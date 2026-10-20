const express = require('express');
const path = require('path');
const lcu = require('./lcu-connector');
const meta = require('./meta-manager');
const historyStore = require('./history-store');

const { version: APP_VERSION } = require('./package.json');

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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      version: APP_VERSION
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

// 동시 실행 개수 제한 map (LCU 과부하 방지)
async function mapLimit(list, limit, fn) {
  const results = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

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
    // 1. LCU 최신 매치 목록 (LCU는 최근 약 40경기만 제공, 페이지 인덱스는 사실상 무시됨)
    const historyRes = await lcu.getMatchList(puuid, 0, 40);
    const rawGames = historyRes?.games?.games || [];
    const windowOldestTime = rawGames.length
      ? Math.min(...rawGames.map(g => g.gameCreation || Infinity))
      : null;

    // 협곡 랭크/일반, 봇전, 연습 모드 등 증강이 없는 큐는 상세 조회 생략
    const standardExcludes = [420, 440, 400, 430, 490, 830, 840, 850, 870, 880, 890, 3140];
    const candidateGames = rawGames.filter(g => !standardExcludes.includes(g.queueId));

    // 2. 이미 저장된 경기는 상세 재조회 생략 (경기 결과는 바뀌지 않음)
    const existing = historyStore.getHistory(puuid);
    const savedIds = new Set(existing.games.filter(g => !g.isGap).map(g => String(g.gameId)));
    const toFetch = candidateGames.filter(g => !savedIds.has(String(g.gameId)));

    let failed = 0;
    const enriched = await mapLimit(toFetch, 6, async (g) => {
      try {
        const detail = await lcu.getGameDetail(g.gameId);
        return meta.enrichGameData(detail, puuid);
      } catch (e) {
        failed++;
        return null;
      }
    });
    const newGames = enriched.filter(Boolean);

    // 상세 조회 실패 경기가 있으면 공백 판정을 보수적으로 (다음 조회 때 다시 시도됨)
    const savedRecord = historyStore.saveHistory(puuid, null, newGames, failed ? null : windowOldestTime);
    const liveIds = new Set(candidateGames.map(g => String(g.gameId)));
    const liveCount = savedRecord.games.filter(g => !g.isGap && liveIds.has(String(g.gameId))).length;

    sendHistory(res, puuid, savedRecord, {
      liveCount,
      cachedCount: savedRecord.totalGamesCount - liveCount,
      newCount: newGames.length
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

  const vbsContent = [
    'Set WshShell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)',
    'nodeBin = "node"',
    'If fso.FileExists(scriptDir & "\\runtime\\node.exe") Then nodeBin = """" & scriptDir & "\\runtime\\node.exe"""',
    'WshShell.Run "cmd.exe /c cd /d """ & scriptDir & """ && " & nodeBin & " server.js", 0, False'
  ].join('\r\n');

  try {
    fs.writeFileSync(vbsPath, vbsContent, 'utf8');

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
  app.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`⚡ 롤 증강 칼바람 전적 뷰어 (ARAM Mayhem Search Viewer) v${APP_VERSION}`);
    console.log(`🔗 대시보드 URL: http://localhost:${PORT}`);
    console.log(`📌 북마크 프로토콜: aram-mayhem://open`);
    console.log(`=======================================================`);
  });
}

startServer();
