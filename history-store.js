const fs = require('fs');
const path = require('path');

class HistoryStore {
  constructor() {
    this.baseDir = path.join(__dirname, 'data');
    this.historyDir = path.join(this.baseDir, 'history');
    this.searchesFile = path.join(this.baseDir, 'recent_searches.json');
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

  // 저장된 과거 전적 로드
  getHistory(puuid) {
    const filePath = this.getFilePath(puuid);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
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

  // 실시간 전적(liveGames)과 과거 저장 전적(cachedGames)을 지능적으로 병합
  mergeGames(liveGames = [], cachedStoredItems = []) {
    if (!cachedStoredItems || cachedStoredItems.length === 0) {
      return liveGames.map(g => ({ ...g, isLiveFetched: true }));
    }

    if (!liveGames || liveGames.length === 0) {
      return cachedStoredItems.map(g => g.isGap ? g : { ...g, isCached: true });
    }

    // 1. 기존 캐시에서 실제 게임 항목들만 추출 (과거 gap 객체는 재정렬용으로 분리)
    const cachedGames = cachedStoredItems.filter(item => !item.isGap);
    
    // 캐시에 있는 게임 ID 세트
    const cachedGameIdSet = new Set(cachedGames.map(g => String(g.gameId)));
    const liveGameIdSet = new Set(liveGames.map(g => String(g.gameId)));

    // 2. 겹치는 경기(Overlap) 여부 판별
    // liveGames 중 cachedGames에 이미 존재하는 경기가 하나라도 있는지?
    let hasOverlap = false;
    let overlapGameId = null;

    for (const lg of liveGames) {
      if (cachedGameIdSet.has(String(lg.gameId))) {
        hasOverlap = true;
        overlapGameId = String(lg.gameId);
        break;
      }
    }

    // 3. 케이스 A: 겹치는 경기가 있는 경우 (자연스러운 연속 연결)
    if (hasOverlap) {
      console.log(`[HistoryStore] 겹치는 경기 발견 (gameId: ${overlapGameId}) -> 연속된 기록으로 자연스럽게 병합합니다.`);
      
      // liveGames에 있는 최신 데이터 우선 (isLiveFetched = true)
      const mergedMap = new Map();
      liveGames.forEach(g => {
        mergedMap.set(String(g.gameId), { ...g, isLiveFetched: true });
      });

      // liveGames에 없는 과거 cachedGames 데이터 추가 (isCached = true)
      cachedGames.forEach(g => {
        if (!mergedMap.has(String(g.gameId))) {
          mergedMap.set(String(g.gameId), { ...g, isCached: true });
        }
      });

      // 시간 최신순(gameCreation 내림차순)으로 정렬
      const sortedGames = Array.from(mergedMap.values()).sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));
      return sortedGames;
    }

    // 4. 케이스 B: 겹치는 경기가 없는 경우 (중간에 미기록 경기 공백 발생)
    console.log(`[HistoryStore] 겹치는 경기 없음 -> 실시간 경기와 과거 기록 사이에 생략 구분선(Gap)을 추가합니다.`);

    // liveGames (최신순 정렬)
    const sortedLive = [...liveGames]
      .map(g => ({ ...g, isLiveFetched: true }))
      .sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));

    // cachedGames (최신순 정렬)
    const sortedCached = [...cachedGames]
      .map(g => ({ ...g, isCached: true }))
      .sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));

    // 실시간에서 가장 오래된 경기의 시간과 캐시에서 가장 최신 경기의 시간
    const liveOldest = sortedLive[sortedLive.length - 1];
    const cachedNewest = sortedCached[0];

    const gapItem = {
      isGap: true,
      gapId: `gap-${liveOldest.gameId}-${cachedNewest.gameId}`,
      newerGameTime: liveOldest.gameCreation,
      olderGameTime: cachedNewest.gameCreation,
      message: '이전 검색 기록과의 사이에 기록되지 않은 경기가 있습니다.'
    };

    return [...sortedLive, gapItem, ...sortedCached];
  }

  // 소환사 전적 저장 및 최신화
  saveHistory(puuid, summonerInfo, liveGames = []) {
    const existing = this.getHistory(puuid);
    const mergedGames = this.mergeGames(liveGames, existing.games || []);

    const dataToSave = {
      puuid,
      summoner: summonerInfo || existing.summoner,
      lastUpdated: Date.now(),
      totalGamesCount: mergedGames.filter(g => !g.isGap).length,
      games: mergedGames
    };

    const filePath = this.getFilePath(puuid);
    try {
      fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
      console.log(`[HistoryStore] ${puuid} 전적 저장 완료 (총 ${dataToSave.totalGamesCount}개 경기)`);
    } catch (err) {
      console.error(`[HistoryStore] 파일 저장 실패:`, err);
    }

    // 최근 검색어 목록에도 등록
    if (summonerInfo) {
      this.addRecentSearch(summonerInfo);
    }

    return dataToSave;
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
      tagLine: summonerInfo.tagLine || 'KR1',
      displayName: summonerInfo.displayName || `${summonerInfo.gameName}#${summonerInfo.tagLine || 'KR1'}`,
      profileIconId: summonerInfo.profileIconId || summonerInfo.profileIcon || 588,
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
