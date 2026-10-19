const express = require('express');
const path = require('path');
const lcu = require('./lcu-connector');
const meta = require('./meta-manager');
const historyStore = require('./history-store');
const sampleData = require('./sample-data');

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
      openHtmlUrl
    });
  } catch (err) {
    res.json({
      connected: false,
      currentSummoner: null,
      openHtmlUrl,
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
  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: '검색할 소환사명을 입력해주세요.' });
  }

  try {
    const isConnected = await lcu.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        connected: false,
        error: '롤 클라이언트가 실행되어 있지 않습니다. 롤 클라이언트를 실행한 후 검색해주세요.'
      });
    }

    const summoner = await lcu.searchSummoner(query.trim());
    historyStore.addRecentSearch(summoner);
    res.json({ summoner });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 4. 소환사 매치 목록 및 증강 칼바람 전적 조회 API (실시간 + 과거 캐시 병합 및 Gap 처리)
app.get('/api/matches/:puuid', async (req, res) => {
  const puuid = req.params.puuid;
  const mayhemOnly = req.query.mayhem !== 'false';
  const clampInt = (v, def, min, max) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
  };
  const begIndex = clampInt(req.query.begIndex, 0, 0, 500);
  const endIndex = clampInt(req.query.endIndex, 30, begIndex + 1, begIndex + 100);

  try {
    const isConnected = await lcu.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        connected: false,
        error: '롤 클라이언트가 실행되어 있지 않습니다.'
      });
    }

    // [B] 롤 클라이언트 연결된 실시간 모드
    // 1. LCU API에서 최신 매치 목록 호출 (충분한 표본을 위해 최근 40게임 조회)
    const historyRes = await lcu.getMatchList(puuid, begIndex, Math.max(endIndex, 40));
    const rawGames = historyRes?.games?.games || [];

    // 일반 협곡 솔랭(420), 자랭(440), 일반(400, 430), 봇전(830-850) 등은 1차 제외
    const standardExcludes = [420, 440, 400, 430, 830, 840, 850, 490];
    const candidateGames = rawGames.filter(g => !standardExcludes.includes(g.queueId));

    // 2. 각 게임 상세 데이터 병렬 로드 및 증강체 검증 (최대 25개)
    const gamesToFetch = candidateGames.slice(0, 25);
    const enrichedLiveGames = await Promise.all(
      gamesToFetch.map(async (g) => {
        try {
          const detail = await lcu.getGameDetail(g.gameId);
          return meta.enrichGameData(detail, puuid);
        } catch (e) {
          return null;
        }
      })
    );

    // 증강 칼바람이 확인된 게임만 선별 (null 제외)
    const validLiveGames = enrichedLiveGames.filter(Boolean);

    // 3. 기존 저장된 과거 전적과 병합 및 영구 저장
    const savedRecord = historyStore.saveHistory(puuid, null, validLiveGames);

    res.json({
      puuid,
      total: savedRecord.totalGamesCount,
      liveCount: validLiveGames.length,
      cachedCount: savedRecord.totalGamesCount - validLiveGames.length,
      games: savedRecord.games,
      isSample: false
    });
  } catch (err) {
    console.error('매치 히스토리 조회 실패:', err.message);
    
    // 에러 발생 시 기존 캐시된 기록이라도 반환 시도
    const cachedRecord = historyStore.getHistory(puuid);
    if (cachedRecord.games && cachedRecord.games.length > 0) {
      return res.json({
        puuid,
        total: cachedRecord.totalGamesCount || cachedRecord.games.filter(g => !g.isGap).length,
        liveCount: 0,
        cachedCount: cachedRecord.games.filter(g => !g.isGap).length,
        games: cachedRecord.games,
        isSample: false,
        notice: '롤 클라이언트 실시간 연결 실패로 저장된 이전 전적만 표시합니다.'
      });
    }

    // 캐시도 없으면 샘플 데이터 반환
    const enrichedLive = sampleData.sampleLiveGames.map(game => meta.enrichGameData(game, puuid));
    const enrichedPast = sampleData.sampleCachedPastGames.map(game => meta.enrichGameData(game, puuid));
    const merged = historyStore.mergeGames(enrichedLive, enrichedPast);

    res.json({
      puuid,
      total: merged.filter(g => !g.isGap).length,
      games: merged,
      isSample: true,
      notice: '롤 클라이언트 응답 실패로 샘플 데이터를 표시합니다.'
    });
  }
});

// 5. 단일 매치 상세 조회 API
app.get('/api/match/:gameId', async (req, res) => {
  const gameId = req.params.gameId;
  const targetPuuid = req.query.puuid || null;

  try {
    const isConnected = await lcu.isConnected();
    if (!isConnected) {
      const allSamples = [...sampleData.sampleLiveGames, ...sampleData.sampleCachedPastGames];
      const sample = allSamples.find(g => String(g.gameId) === String(gameId)) || allSamples[0];
      return res.json(meta.enrichGameData(sample, targetPuuid));
    }

    const detail = await lcu.getGameDetail(gameId);
    res.json(meta.enrichGameData(detail, targetPuuid));
  } catch (err) {
    const allSamples = [...sampleData.sampleLiveGames, ...sampleData.sampleCachedPastGames];
    const sample = allSamples.find(g => String(g.gameId) === String(gameId)) || allSamples[0];
    res.json(meta.enrichGameData(sample, targetPuuid));
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
    console.log(`⚡ 롤 증강 칼바람 전적 뷰어 (ARAM Mayhem Search Viewer)`);
    console.log(`🔗 대시보드 URL: http://localhost:${PORT}`);
    console.log(`📌 북마크 프로토콜: aram-mayhem://open`);
    console.log(`=======================================================`);
  });
}

startServer();
