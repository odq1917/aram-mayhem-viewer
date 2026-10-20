const fs = require('fs');
const path = require('path');
const meta = require('./meta-manager');
const { HISTORY_DIR, RECENT_SEARCHES_FILE } = require('./data-dir');

class HistoryStore {
  constructor() {
    this.historyDir = HISTORY_DIR;
    this.searchesFile = RECENT_SEARCHES_FILE;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  // 소환사의 저장된 과거 전적 파일 경로
  getFilePath(puuid) {
    // 파일명에 안전한 문자만 사용
    const safePuuid = puuid.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.historyDir, `${safePuuid}.json`);
  }

  // 원자적 파일 쓰기 (저장 도중 종료돼도 기존 파일이 깨지지 않도록 임시 파일 → rename)
  writeJsonAtomic(filePath, data) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  // 저장된 과거 전적 로드 (구버전 대용량 포맷은 자동으로 경량 포맷으로 변환)
  getHistory(puuid) {
    const filePath = this.getFilePath(puuid);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const games = data.games || [];
        const needsMigration = games.some(g => !g.isGap && g.participants?.[0] && !g.participants[0].itemIds);
        data.games = games.map(g => meta.compactGame(g));
        if (needsMigration) {
          const before = fs.statSync(filePath).size;
          this.writeJsonAtomic(filePath, data);
          console.log(`[HistoryStore] ${puuid} 저장 포맷 경량화: ${(before / 1e6).toFixed(1)}MB → ${(fs.statSync(filePath).size / 1e6).toFixed(1)}MB`);
        }
        return data;
      } catch (err) {
        console.warn(`[HistoryStore] ${puuid} 히스토리 파일 읽기 실패:`, err.message);
      }
    }
    return {
      puuid,
      summoner: null,
      lastUpdated: null,
      games: [] // [{...gameData}, {isGap: true, ...}, ...]
    };
  }

  // 실시간 전적(liveGames)과 과거 저장 전적(cachedStoredItems)을 병합
  // windowOldestTime: 이번에 LCU가 돌려준 매치 목록(전 모드 포함) 중 가장 오래된 게임 시각.
  //   LCU 목록은 최근 경기의 연속 구간이므로, 저장된 최신 경기가 이 시각보다 오래됐다면
  //   그 사이 경기는 확인할 수 없음 → 공백(Gap) 표시.
  mergeGames(liveGames = [], cachedStoredItems = [], windowOldestTime = null) {
    const cachedGames = (cachedStoredItems || []).filter(item => !item.isGap);
    // 이번 LCU 목록이 공백 구간 전체를 덮으면 그 사이 경기는 모두 확인된 것 → 공백 제거
    const gaps = (cachedStoredItems || []).filter(item =>
      item.isGap && !(windowOldestTime && item.olderGameTime >= windowOldestTime)
    );

    const mergedMap = new Map();
    cachedGames.forEach(g => {
      mergedMap.set(String(g.gameId), { ...g, isCached: true, isLiveFetched: false });
    });
    (liveGames || []).forEach(g => {
      mergedMap.set(String(g.gameId), { ...g, isLiveFetched: true, isCached: false });
    });
    const games = Array.from(mergedMap.values()).sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));

    // 새 공백 판정
    const cachedNewest = cachedGames.reduce((max, g) => Math.max(max, g.gameCreation || 0), 0);
    if (cachedNewest > 0 && windowOldestTime && cachedNewest < windowOldestTime) {
      const liveOldest = (liveGames || []).reduce((min, g) => Math.min(min, g.gameCreation || Infinity), Infinity);
      gaps.push({
        isGap: true,
        newerGameTime: Number.isFinite(liveOldest) ? liveOldest : windowOldestTime,
        olderGameTime: cachedNewest,
        message: '이전 검색 기록과의 사이에 기록되지 않은 경기가 있습니다.'
      });
    }

    // 공백 중복 제거 (같은 지점의 공백은 하나만) 후 위치에 맞게 삽입
    const gapByOlder = new Map();
    for (const gap of gaps) {
      const prev = gapByOlder.get(gap.olderGameTime);
      if (!prev || (gap.newerGameTime || 0) < (prev.newerGameTime || 0)) {
        gapByOlder.set(gap.olderGameTime, { ...gap, gapId: `gap-${gap.olderGameTime}` });
      }
    }
    const pendingGaps = Array.from(gapByOlder.values()).sort((a, b) => b.olderGameTime - a.olderGameTime);

    const result = [];
    let gi = 0;
    for (const g of games) {
      while (gi < pendingGaps.length && (g.gameCreation || 0) <= pendingGaps[gi].olderGameTime) {
        // 공백 위쪽에 경기가 하나도 없으면(맨 위) 표시 의미가 없으므로 유지만 하고 위치는 맨 앞
        result.push(pendingGaps[gi++]);
      }
      result.push(g);
    }
    return result;
  }

  // 소환사 전적 저장 및 최신화 (경량 포맷으로 저장)
  saveHistory(puuid, summonerInfo, liveGames = [], windowOldestTime = null) {
    const existing = this.getHistory(puuid);
    const compactLive = liveGames.map(g => meta.compactGame(g));
    const mergedGames = this.mergeGames(compactLive, existing.games || [], windowOldestTime);

    const dataToSave = {
      puuid,
      summoner: summonerInfo || existing.summoner,
      lastUpdated: Date.now(),
      totalGamesCount: mergedGames.filter(g => !g.isGap).length,
      games: mergedGames
    };

    try {
      // 저장할 경기가 하나도 없으면 빈 파일을 만들지 않음
      if (mergedGames.length > 0 || (existing.games || []).length > 0) {
        this.writeJsonAtomic(this.getFilePath(puuid), dataToSave);
        console.log(`[HistoryStore] ${puuid} 전적 저장 완료 (총 ${dataToSave.totalGamesCount}개 경기)`);
      }
    } catch (err) {
      console.error(`[HistoryStore] 파일 저장 실패:`, err);
    }

    // 최근 검색어 목록에도 등록
    if (summonerInfo) {
      this.addRecentSearch(summonerInfo);
    }

    return dataToSave;
  }

  // 저장된 경기 일부를 교체 (순서·공백 유지). replacements: gameId → 새 게임 데이터 또는 { extUnavailable: true }
  patchGames(puuid, replacements) {
    if (!replacements || replacements.size === 0) return;
    const record = this.getHistory(puuid);
    if (!record.games.length) return;
    record.games = record.games.map(g => {
      if (g.isGap) return g;
      const rep = replacements.get(String(g.gameId));
      if (!rep) return g;
      if (rep.extUnavailable) return { ...g, extUnavailable: true };
      return { ...meta.compactGame(rep), isCached: g.isCached, isLiveFetched: g.isLiveFetched };
    });
    this.writeJsonAtomic(this.getFilePath(puuid), record);
  }

  // 저장된 전적이 있는 모든 소환사 PUUID
  listSavedPuuids() {
    return fs.readdirSync(this.historyDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5));
  }

  // 최근 검색된 소환사 목록 관리
  getRecentSearches() {
    if (fs.existsSync(this.searchesFile)) {
      try {
        const raw = fs.readFileSync(this.searchesFile, 'utf8');
        return JSON.parse(raw);
      } catch (e) {}
    }
    return [];
  }

  addRecentSearch(summonerInfo) {
    if (!summonerInfo || !summonerInfo.puuid) return;
    let list = this.getRecentSearches();

    // 기존 동일 소환사 제거
    list = list.filter(item => item.puuid !== summonerInfo.puuid);

    // 맨 앞에 추가
    list.unshift({
      puuid: summonerInfo.puuid,
      gameName: summonerInfo.gameName || summonerInfo.displayName || '소환사',
      tagLine: summonerInfo.tagLine || '',
      displayName: summonerInfo.gameName
        ? (summonerInfo.tagLine ? `${summonerInfo.gameName}#${summonerInfo.tagLine}` : summonerInfo.gameName)
        : (summonerInfo.displayName || '소환사'),
      profileIconId: summonerInfo.profileIconId || summonerInfo.profileIcon || 588,
      summonerLevel: summonerInfo.summonerLevel || undefined,
      searchedAt: Date.now()
    });

    // 최대 10개 유지
    if (list.length > 10) list = list.slice(0, 10);

    try {
      fs.writeFileSync(this.searchesFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {}
  }

  // 특정 소환사 최근 검색 목록에서만 삭제
  deleteRecentSearch(puuid) {
    let list = this.getRecentSearches().filter(item => item.puuid !== puuid);
    try {
      fs.writeFileSync(this.searchesFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {}
    return list;
  }

  // 최근 검색 목록 전체 비우기
  clearAllRecentSearches() {
    try {
      fs.writeFileSync(this.searchesFile, JSON.stringify([], null, 2), 'utf8');
    } catch (e) {}
    return [];
  }

  // 특정 소환사 히스토리 및 최근 검색 삭제
  deleteHistory(puuid) {
    const filePath = this.getFilePath(puuid);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    return this.deleteRecentSearch(puuid);
  }
}

module.exports = new HistoryStore();
