// 자동 업데이트: 새 릴리스를 백그라운드로 받아 두었다가(stage) 다음 실행 때 적용(applyPending)
// - Portable zip 을 받아 사용자 데이터 폴더의 update/ 에 풀어 둠 (GitHub 가 주는 SHA-256 으로 검증)
// - 다음 실행 시 서버가 뜨기 전에 프로그램 폴더에 덮어씀 (runtime/node.exe 는 실행 중이라 제외)
// - git 으로 받은 개발 폴더에서는 동작하지 않음
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const { DATA_DIR } = require('./data-dir');
const { compareVersions } = require('./update-checker');

const APP_DIR = __dirname;
const UPDATE_DIR = path.join(DATA_DIR, 'update');
const PENDING_FILE = path.join(UPDATE_DIR, 'pending.json');
const BACKUP_DIR = path.join(UPDATE_DIR, 'backup');
const ASSET_RE = /^ARAM-Mayhem-Viewer-Portable-v[\d.]+\.zip$/;
// 덮어쓰지 않는 최상위 항목 (실행 중인 node.exe, 개발용 폴더, 로그)
const SKIP_TOP = new Set(['runtime', '.git', 'run_log.txt']);

let staging = null;
let lastError = null;

const isDevCheckout = () => fs.existsSync(path.join(APP_DIR, '.git'));

function currentVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version;
  } catch (e) {
    return '0.0.0';
  }
}

function readPending() {
  try {
    const p = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return p && p.version && p.dir && fs.existsSync(path.join(p.dir, 'server.js')) ? p : null;
  } catch (e) {
    return null;
  }
}

function clearPending(pending) {
  try { fs.rmSync(PENDING_FILE, { force: true }); } catch (e) {}
  if (pending?.dir) try { fs.rmSync(pending.dir, { recursive: true, force: true }); } catch (e) {}
}

// 최상위 항목 기준으로 걸러서 복사
function copyApp(src, dest, extraSkip = []) {
  const skip = new Set([...SKIP_TOP, ...extraSkip]);
  for (const name of fs.readdirSync(src)) {
    if (skip.has(name)) continue;
    fs.cpSync(path.join(src, name), path.join(dest, name), { recursive: true, force: true });
  }
}

// 업데이트 상태 (화면 배지용)
function status() {
  const pending = readPending();
  return {
    auto: !isDevCheckout(),
    staging: Boolean(staging),
    staged: pending && compareVersions(pending.version, currentVersion()) > 0 ? pending.version : null,
    error: lastError
  };
}

// 새 릴리스를 받아서 풀어 둠. info 는 update-checker 결과 (hasUpdate, latest, assets)
function stage(info) {
  if (isDevCheckout() || !info?.hasUpdate) return Promise.resolve(null);
  const already = readPending();
  if (already && already.version === info.latest) return Promise.resolve(already);
  if (!staging) {
    staging = doStage(info)
      .then(p => { lastError = null; return p; })
      .catch(err => {
        lastError = err.message;
        console.warn(`[업데이트] v${info.latest} 준비 실패: ${err.message}`);
        return null;
      })
      .finally(() => { staging = null; });
  }
  return staging;
}

async function doStage(info) {
  const asset = (info.assets || []).find(a => ASSET_RE.test(a.name));
  if (!asset) throw new Error('릴리스에 Portable zip 이 없음');

  console.log(`[업데이트] v${info.latest} 내려받는 중...`);
  const res = await fetch(asset.url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!res.ok) throw new Error(`다운로드 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (asset.size && buf.length !== asset.size) throw new Error('다운로드 크기가 다름');
  const [algo, expected] = String(asset.digest || '').split(':');
  if (algo === 'sha256' && crypto.createHash('sha256').update(buf).digest('hex') !== expected) {
    throw new Error('파일 검증(SHA-256) 실패');
  }

  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  const zipPath = path.join(UPDATE_DIR, 'download.zip');
  const dir = path.join(UPDATE_DIR, `staged-${info.latest}`);
  fs.writeFileSync(zipPath, buf);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  try {
    // Windows 10 이상 기본 포함된 tar(bsdtar)로 zip 해제
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(fs.existsSync(tar) ? tar : 'tar', ['-xf', zipPath, '-C', dir], { windowsHide: true, stdio: 'ignore' });
  } finally {
    fs.rmSync(zipPath, { force: true });
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (pkg.version !== info.latest || !fs.existsSync(path.join(dir, 'server.js'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error('내려받은 파일의 버전이 맞지 않음');
  }

  const old = readPending();
  if (old && old.dir !== dir) clearPending(old);
  const pending = { version: info.latest, dir, stagedAt: Date.now() };
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending), 'utf8');
  console.log(`[업데이트] v${info.latest} 준비 완료 → 다음 실행 때 적용됩니다.`);
  return pending;
}

// 서버 시작 전에 호출. 받아 둔 새 버전이 있으면 덮어쓰고 true 반환 (호출 측에서 새 코드로 다시 실행)
function applyPending() {
  if (isDevCheckout()) return false;
  const pending = readPending();
  if (!pending) return false;
  const from = currentVersion();
  if (compareVersions(pending.version, from) <= 0) {
    clearPending(pending);
    return false;
  }

  try {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    copyApp(APP_DIR, BACKUP_DIR, ['node_modules']);
  } catch (err) {
    console.warn(`[업데이트] 백업 실패로 적용을 미룹니다: ${err.message}`);
    return false;
  }

  try {
    copyApp(pending.dir, APP_DIR);
    clearPending(pending);
    fs.writeFileSync(path.join(UPDATE_DIR, 'last.json'), JSON.stringify({ from, to: pending.version, at: Date.now() }), 'utf8');
    console.log(`[업데이트] v${from} → v${pending.version} 적용 완료`);
    return true;
  } catch (err) {
    console.warn(`[업데이트] 적용 실패, 이전 버전으로 되돌립니다: ${err.message}`);
    try { copyApp(BACKUP_DIR, APP_DIR); } catch (e) {}
    clearPending(pending); // 같은 실패를 매번 반복하지 않도록 버림 (다음 확인 때 다시 받음)
    return false;
  }
}

// 같은 인자로 서버를 새로 띄움 (출력은 run_log.txt 에 이어서 기록)
function relaunch() {
  let out = 'ignore';
  try { out = fs.openSync(path.join(APP_DIR, 'run_log.txt'), 'a'); } catch (e) {}
  spawn(process.execPath, [path.join(APP_DIR, 'server.js'), ...process.argv.slice(2)], {
    cwd: APP_DIR,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, MAYHEM_RELAUNCHED: '1' }
  }).unref();
}

module.exports = { stage, applyPending, relaunch, status, isDevCheckout };
