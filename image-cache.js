const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./data-dir');

// 아이콘 이미지 로컬 캐시
// - 화면의 CommunityDragon / Data Dragon 이미지를 /img/cd/..., /img/dd/... 로 받아 DATA_DIR/img-cache 에 저장
// - 한 번 받은 이미지는 다음부터 디스크에서 즉시 응답 (CDN 장애·지연과 무관)
// - CommunityDragon 'latest' 경로는 원본 서버가 느릴 때 수십 초씩 걸리므로 현재 패치 버전 경로(예: 16.22)를 먼저 시도

const CACHE_DIR = path.join(DATA_DIR, 'img-cache');
const UPSTREAMS = {
  cd: 'https://raw.communitydragon.org/',
  dd: 'https://ddragon.leagueoflegends.com/'
};
const PATH_RE = /^[\w.\-/]+\.(png|jpg|jpeg|webp)$/i;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const REFRESH_MS = 14 * 24 * 60 * 60 * 1000; // 2주 지난 파일은 응답 후 백그라운드에서 새로 받음
const MISS_TTL_MS = 10 * 60 * 1000;          // 없는 이미지(404)는 10분 동안 다시 묻지 않음
const MAX_BYTES = 5 * 1024 * 1024;

const inflight = new Map();
const misses = new Map();
let patchPromise = null;
let patchFetchedAt = 0;

// Data Dragon 최신 버전(예: 16.22.1) → CommunityDragon 패치 경로(16.22)
function currentPatch() {
  if (!patchPromise || Date.now() - patchFetchedAt > 6 * 60 * 60 * 1000) {
    patchFetchedAt = Date.now();
    patchPromise = fetch('https://ddragon.leagueoflegends.com/api/versions.json', { signal: AbortSignal.timeout(5000) })
      .then(r => (r.ok ? r.json() : null))
      .then(v => {
        const m = Array.isArray(v) && String(v[0] || '').match(/^(\d+)\.(\d+)\./);
        return m ? `${m[1]}.${m[2]}` : null;
      })
      .catch(() => { patchFetchedAt = 0; return null; });
  }
  return patchPromise;
}

function validPath(rel) {
  return PATH_RE.test(rel) && !rel.split('/').some(seg => seg === '' || seg === '.' || seg === '..');
}

function cacheFile(host, rel) {
  const ext = rel.split('.').pop().toLowerCase();
  const hash = crypto.createHash('sha1').update(`${host}/${rel}`).digest('hex');
  return path.join(CACHE_DIR, host, hash.slice(0, 2), `${hash}.${ext}`);
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (res.status === 404 || res.status === 403) return { notFound: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) throw new Error('bad size');
  return { buf };
}

async function fetchUpstream(host, rel) {
  if (host === 'cd' && rel.startsWith('latest/')) {
    const patch = await currentPatch();
    if (patch) {
      try {
        const r = await download(`${UPSTREAMS.cd}${patch}/${rel.slice(7)}`);
        if (r.buf) return r;
      } catch { /* 패치 경로 실패 → latest 로 재시도 */ }
    }
  }
  return download(UPSTREAMS[host] + rel);
}

function load(host, rel, file) {
  const key = `${host}/${rel}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchUpstream(host, rel)
    .then(async r => {
      if (r.notFound) { misses.set(key, Date.now()); return null; }
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, r.buf);
      await fs.promises.rename(tmp, file);
      return r.buf;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function send(res, buf, ext) {
  res.set('Content-Type', MIME[ext] || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=604800');
  res.set('X-Content-Type-Options', 'nosniff');
  res.end(buf);
}

// Express 핸들러: GET /img/:host/<경로>
async function handler(req, res) {
  const host = req.params.host;
  const rel = req.params[0] || '';
  if (!UPSTREAMS[host] || !validPath(rel)) return res.status(400).end();
  const ext = rel.split('.').pop().toLowerCase();
  const key = `${host}/${rel}`;
  const file = cacheFile(host, rel);

  try {
    const stat = await fs.promises.stat(file).catch(() => null);
    if (stat) {
      const buf = await fs.promises.readFile(file);
      send(res, buf, ext);
      if (Date.now() - stat.mtimeMs > REFRESH_MS) load(host, rel, file).catch(() => {});
      return;
    }
    const missAt = misses.get(key);
    if (missAt && Date.now() - missAt < MISS_TTL_MS) return res.status(404).end();
    const buf = await load(host, rel, file);
    if (!buf) return res.status(404).end();
    send(res, buf, ext);
  } catch (err) {
    // 받기 실패 시 원래 CDN 주소로 넘겨 브라우저가 직접 시도
    res.redirect(302, UPSTREAMS[host] + rel);
  }
}

// API 응답(JSON 문자열) 안의 이미지 CDN 주소를 로컬 캐시 경로로 바꿈
const REWRITE_RE = /https:\/\/(raw\.communitydragon\.org|ddragon\.leagueoflegends\.com)\/([\w.\-/]+\.(?:png|jpg|jpeg|webp))(?=")/gi;
function rewriteJson(str) {
  return str.replace(REWRITE_RE, (m, h, rel) => (validPath(rel) ? `/img/${h.startsWith('raw') ? 'cd' : 'dd'}/${rel}` : m));
}

module.exports = { handler, rewriteJson, validPath, cacheFile, CACHE_DIR };
