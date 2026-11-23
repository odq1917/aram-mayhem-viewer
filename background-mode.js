const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./data-dir');

// 백그라운드 수집 모드
// - 켜면: Windows 로그인 시 서버가 창 없이 자동 실행되고, 열린 페이지가 없어도 꺼지지 않음
//   → 롤을 켜고 게임을 하면 언제든 정밀 기록(아이템 순서·스킬 순서·룬 파편)이 쌓임
// - 끄면: 시작 프로그램 등록을 지우고 기존처럼 페이지를 닫으면 일정 시간 뒤 자동 종료
// - 등록 위치: 사용자 '시작프로그램' 폴더 (관리자 권한·레지스트리 불필요, Windows 설정 > 시작 앱에서도 끌 수 있음)

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const STARTUP_NAME = 'MAYHEM.GG 전적 수집기.vbs';

function startupDir() {
  if (process.platform !== 'win32' || !process.env.APPDATA) return null;
  return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function startupFile() {
  const dir = startupDir();
  return dir ? path.join(dir, STARTUP_NAME) : null;
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function isEnabled() {
  return readSettings().backgroundCollector === true;
}

// 시작프로그램 스크립트 작성 (한글 경로 보존을 위해 UTF-16LE + BOM)
function writeStartupScript(appDir) {
  const file = startupFile();
  if (!file) throw new Error('Windows 에서만 사용할 수 있습니다.');
  const launcher = path.join(appDir, 'launcher.vbs');
  const vbs = [
    "' MAYHEM.GG 전적 수집기 - 로그인 시 전적 검색기 서버를 창 없이 실행합니다.",
    "' 끄려면 전적 검색기 페이지에서 '백그라운드 수집'을 끄거나 이 파일을 지우세요.",
    'Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")',
    `If fso.FileExists("${launcher.replace(/"/g, '""')}") Then`,
    `  CreateObject("WScript.Shell").Run "wscript.exe ""${launcher.replace(/"/g, '""""')}""", 0, False`,
    'End If',
    ''
  ].join('\r\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(vbs, 'utf16le')]));
}

function removeStartupScript() {
  const file = startupFile();
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
}

function setEnabled(enabled, appDir) {
  if (enabled) writeStartupScript(appDir);
  else removeStartupScript();
  writeSettings({ backgroundCollector: Boolean(enabled) });
  return status();
}

// 서버 시작 시: 켜져 있으면 현재 프로그램 폴더 경로로 시작 스크립트를 다시 씀 (폴더를 옮긴 경우 대비)
function syncOnStartup(appDir) {
  try {
    if (isEnabled()) writeStartupScript(appDir);
  } catch (e) {
    console.warn('[Background] 시작 프로그램 등록 갱신 실패:', e.message);
  }
}

function status() {
  const file = startupFile();
  return {
    enabled: isEnabled(),
    registered: Boolean(file && fs.existsSync(file)),
    supported: Boolean(file)
  };
}

module.exports = { isEnabled, setEnabled, syncOnStartup, status, readSettings, writeSettings, STARTUP_NAME };
