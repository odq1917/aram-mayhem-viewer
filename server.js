const express = require('express');
const path = require('path');
const lcu = require('./lcu-connector');
const meta = require('./meta-manager');
const historyStore = require('./history-store');
const updateChecker = require('./update-checker');
const dataDir = require('./data-dir');
const { syncMatches } = require('./match-sync');
const autoRefresher = require('./auto-refresh');

// 구버전(프로그램 폴더 data/)의 기록을 사용자 데이터 폴더로 이전
try {
  const moved = dataDir.migrateLegacyData(__dirname);
  if (moved.movedFiles || moved.mergedSearches) {
    console.log(`[DataDir] 기존 기록 이전 완료 → ${dataDir.DATA_DIR} (전적 ${moved.movedFiles}명, 최근 검색 ${moved.mergedSearches}개)`);
  }
} catch (e) {
  console.warn('[DataDir] 기존 기록 이전 실패:', e.message);
}

const { version: APP_VERSION } = require('./package.json');

// 백그라운드 작업에서 놓친 오류로 서버 전체가 죽지 않도록 기록만 남김
process.on('unhandledRejection', (err) => {
  console.warn('[Server] 처리되지 않은 오류:', err?.message || err);
});

const app = express();
const PORT = Number(process.env.PORT) || 3500;
const HOST = '127.0.0.1';

// 보안: 로컬 대시보드 외 출처 차단
// - Host 검사: DNS 리바인딩 공격 방지
// - Origin 검사: 다른 웹사이트가 브라우저를 통해 API(삭제 등)를 호출하는 것 방지
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) {
    return res.status(403).json({ error: 'Forbidden host' });
  }
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin.toLowerCase())) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  next();
});

// 경로 파라미터 검증 (LCU 경로 조작 방지)
const PUUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.param('puuid', (req, res, next, value) => {
  if (!PUUID_RE.test(value)) return res.status(400).json({ error: '잘못된 PUUID 형식입니다.' });
  next();
});
app.param('gameId', (req, res, next, value) => {
  if (!/^\d{1,20}$/.test(value)) return res.status(400).json({ error: '잘못된 gameId 형식입니다.' });
  next();
});

// 자동 종료: 대시보드 페이지가 하나도 열려 있지 않은 채 일정 시간이 지나면 서버 종료
// (열린 페이지는 10초마다 /api/status 를 호출하므로, API 요청이 끊기면 페이지가 없는 것으로 판단)
// IDLE_SHUTDOWN_MIN 환경변수로 조정 가능, 0 이면 비활성화
const IDLE_SHUTDOWN_MIN = process.env.IDLE_SHUTDOWN_MIN !== undefined ? Number(process.env.IDLE_SHUTDOWN_MIN) : 60;
let lastApiActivity = Date.now();
app.use('/api', (req, res, next) => {
  lastApiActivity = Date.now();
  next();
});
if (IDLE_SHUTDOWN_MIN > 0) {
  const idleMs = IDLE_SHUTDOWN_MIN * 60 * 1000;
  setInterval(() => {
    if (Date.now() - lastApiActivity > idleMs) {
      console.log(`[AutoShutdown] ${IDLE_SHUTDOWN_MIN}분 동안 열린 페이지가 없어 서버를 종료합니다.`);
      process.exit(0);
    }
  }, Math.min(60 * 1000, Math.max(1000, idleMs / 4))).unref();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 0. 서버 생존 확인 (런처/북마크 페이지용, LCU 조회 없이 즉시 응답)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, version: APP_VERSION });
});

// 0-1. 업데이트 확인 (GitHub 최신 릴리스와 현재 버전 비교, ?force=1 이면 캐시 무시)
app.get('/api/update-check', async (req, res) => {
  res.json(await updateChecker.check(req.query.force === '1'));
});

// 1. 상태 및 롤 클라이언트 연결 확인 API
app.get('/api/status', async (req, res) => {
  const { pathToFileURL } = require('url');
  const openHtmlUrl = pathToFileURL(path.join(__dirname, 'open.html')).href;
  try {
    const isConnected = await lcu.isConnected();
    let currentSummoner = null;
    if (isConnected) {
      currentSummoner = await lcu.getCurrentSummoner();
    }
    res.json({
      connected: isConnected,
      currentSummoner: currentSummoner,
      openHtmlUrl,
      version: APP_VERSION,
      autoRefresh: autoRefresher.state
    });
  } catch (err) {
    res.json({
      connected: false,
      currentSummoner: null,
      openHtmlUrl,
      version: APP_VERSION,
      error: err.message
    });
  }
});

// 1-1. 현재 로그인된 내 계정 정보 조회 API
app.get('/api/me', async (req, res) => {
  try {
    const isConnected = await lcu.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        connected: false,
        error: '롤 클라이언트가 실행되어 있지 않습니다. 롤 클라이언트를 켠 후 다시 클릭해주세요.'
      });
    }

    const currentSummoner = await lcu.getCurrentSummoner();
    if (!currentSummoner || !currentSummoner.puuid) {
      return res.status(404).json({ error: '로그인된 소환사 정보를 불러올 수 없습니다.' });
    }

    historyStore.addRecentSearch(currentSummoner);
    res.json({
      connected: true,
      summoner: currentSummoner
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 최근 검색 소환사 목록 API
app.get('/api/recent-searches', (req, res) => {
  const list = historyStore.getRecentSearches();
  res.json(list);
});

// 최근 검색어 단일 삭제 API
app.delete('/api/recent-searches/:puuid', (req, res) => {
  const list = historyStore.deleteRecentSearch(req.params.puuid);
  res.json({ success: true, list });
});

// 최근 검색어 전체 삭제 API
app.delete('/api/recent-searches', (req, res) => {
  const list = historyStore.clearAllRecentSearches();
  res.json({ success: true, list });
});

// 3. 소환사 검색 API (닉네임 또는 닉네임#태그)
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: '검색할 소환사명을 입력해주세요.' });
  }

  try {
    const isConnected = await lcu.isConnected();
    if (!isConnected) {
      // 오프라인: 최근 검색 목록에서 이름으로 찾아 저장된 전적을 볼 수 있게 함
      const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
      const q = norm(query);
      const hit = historyStore.getRecentSearches().find(item =>
        norm(item.displayName) === q || norm(`${item.gameName}#${item.tagLine}`) === q || norm(item.gameName) === q
      );
      if (hit) {
        return res.json({ summoner: { ...hit, profileIconId: hit.profileIconId }, offline: true });
      }
      return res.status(503).json({
        connected: false,
        error: '롤 클라이언트가 실행되어 있지 않습니다. (오프라인에서는 최근 검색한 소환사의 저장된 전적만 볼 수 있습니다.)'
      });
    }

    const summoner = await lcu.searchSummoner(query);
    historyStore.addRecentSearch(summoner);
    res.json({ summoner });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

function sendHistory(res, puuid, record, extra = {}) {
  const games = record.games || [];
  const total = games.filter(g => !g.isGap).length;
  res.json({
    puuid,
    total,
    liveCount: 0,
    cachedCount: total,
    games,
    meta: meta.buildMetaFor(games),
    ...extra
  });
}

// 4. 소환사 매치 목록 및 증강 칼바람 전적 조회 API (실시간 + 과거 저장 병합 및 Gap 처리)
app.get('/api/matches/:puuid', async (req, res) => {
  const puuid = req.params.puuid;

  let isConnected = false;
  try {
    isConnected = await lcu.isConnected();
  } catch (e) {}

  if (!isConnected) {
    const cached = historyStore.getHistory(puuid);
    if (cached.games.length > 0) {
      return sendHistory(res, puuid, cached, { offline: true, notice: '롤 클라이언트 미실행: 저장된 전적만 표시합니다.' });
    }
    return res.status(503).json({ connected: false, error: '롤 클라이언트가 실행되어 있지 않고, 저장된 전적도 없습니다.' });
  }

  try {
    const { record, newCount, liveCount } = await syncMatches(puuid);
    sendHistory(res, puuid, record, {
      liveCount,
      cachedCount: record.totalGamesCount - liveCount,
      newCount
    });
  } catch (err) {
    console.error('매치 히스토리 조회 실패:', err.message);
    const cached = historyStore.getHistory(puuid);
    if (cached.games.length > 0) {
      return sendHistory(res, puuid, cached, { notice: '롤 클라이언트 응답 실패로 저장된 이전 전적만 표시합니다.' });
    }
    res.status(502).json({ error: `전적을 불러오지 못했습니다: ${err.message}` });
  }
});

// 5. 단일 매치 상세 조회 API
app.get('/api/match/:gameId', async (req, res) => {
  const targetPuuid = req.query.puuid || null;
  try {
    const detail = await lcu.getGameDetail(req.params.gameId);
    const game = meta.enrichGameData(detail, targetPuuid);
    if (!game) return res.status(404).json({ error: '증강 모드 경기가 아닙니다.' });
    res.json(game);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// 5-1. 자동 갱신 목록 (데이터 폴더의 auto-refresh.txt)
app.get('/api/watchlist', (req, res) => {
  res.json({ entries: autoRefresher.readWatchlist(), file: dataDir.WATCHLIST_FILE });
});

app.post('/api/watchlist', (req, res) => {
  const riotId = String(req.body?.riotId || '').trim();
  if (!/^[^#]{1,32}#[^#]{1,16}$/.test(riotId)) {
    return res.status(400).json({ error: '"닉네임#태그" 형식이어야 합니다.' });
  }
  const entries = autoRefresher.setWatched(riotId, Boolean(req.body?.watched));
  res.json({ entries });
});

// 5-2. 데이터 폴더 열기 (Windows 탐색기)
app.post('/api/open-data-folder', (req, res) => {
  if (process.platform !== 'win32') return res.status(400).json({ error: 'Windows에서만 지원합니다.' });
  require('child_process').spawn('explorer.exe', [dataDir.DATA_DIR], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true, path: dataDir.DATA_DIR });
});

// 6. 소환사 로컬 전적 기록 삭제 API
app.delete('/api/history/:puuid', (req, res) => {
  historyStore.deleteHistory(req.params.puuid);
  res.json({ message: '소환사의 이전 전적 캐시가 삭제되었습니다.' });
});

// 7. 전체 증강체 도감 API (순수 아수라장 유효 증강체만 반환)
app.get('/api/augments', (req, res) => {
  const result = meta.dexAugments && Object.keys(meta.dexAugments).length > 0
    ? meta.dexAugments 
    : meta.augments;
  res.json(result);
});

// 8. 윈도우 커스텀 URL 프로토콜(aram-mayhem://) 및 백그라운드 런처 등록
function registerProtocolHandler() {
  if (process.platform !== 'win32') return;

  const fs = require('fs');
  const { execSync } = require('child_process');
  const vbsPath = path.join(__dirname, 'launcher.vbs');

  // launcher.vbs는 배포 파일에 포함됨 (창 없이 서버 실행 + 중복 실행 방지)
  if (!fs.existsSync(vbsPath)) {
    console.warn('[Protocol] launcher.vbs가 없어 북마크 자동 실행을 등록하지 않습니다.');
    return;
  }

  try {
    // Windows .reg 파일 (UTF-16LE with BOM) 작성 후 reg import로 한국어 경로 100% 보존 등록
    const escapedVbs = vbsPath.split(path.sep).join('\\\\');
    const regLines = [
      'Windows Registry Editor Version 5.00',
      '',
      '[HKEY_CURRENT_USER\\Software\\Classes\\aram-mayhem]',
      '@="URL:ARAM Mayhem Protocol"',
      '"URL Protocol"=""',
      '',
      '[HKEY_CURRENT_USER\\Software\\Classes\\aram-mayhem\\shell\\open\\command]',
      `@="wscript.exe \\"${escapedVbs}\\" \\"%1\\""`,
      ''
    ].join('\r\n');

    const regFile = path.join(__dirname, 'protocol.reg');
    const regBuf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(regLines, 'utf16le')]);
    fs.writeFileSync(regFile, regBuf);

    execSync(`reg import "${regFile}"`, { stdio: 'ignore' });
    console.log(`📌 브라우저 북마크 프로토콜 'aram-mayhem://' 등록 완료!`);
  } catch (e) {
    console.warn('[Protocol] 등록 알림:', e.message);
  }
}

// 서버 시작
async function startServer() {
  await meta.init();
  registerProtocolHandler();
  autoRefresher.start();
  const server = app.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`⚡ 롤 증강 칼바람 전적 뷰어 (ARAM Mayhem Search Viewer) v${APP_VERSION}`);
    console.log(`🔗 대시보드 URL: http://localhost:${PORT}`);
    console.log(`📌 북마크 프로토콜: aram-mayhem://open`);
    console.log(`💾 데이터 폴더: ${dataDir.DATA_DIR}`);
    console.log(`=======================================================`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`이미 포트 ${PORT}에서 서버가 실행 중입니다. 이 인스턴스는 종료합니다.`);
      process.exit(0);
    }
    throw err;
  });
}

startServer();
