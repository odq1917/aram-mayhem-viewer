document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소
  const lcuStatusBadge = document.getElementById('lcuStatusBadge');
  const summonerSearchInput = document.getElementById('summonerSearchInput');
  const btnSearch = document.getElementById('btnSearch');
  const btnMyHistory = document.getElementById('btnMyHistory');
  const recentSearchesContainer = document.getElementById('recentSearchesContainer');
  const recentChipsList = document.getElementById('recentChipsList');
  const btnClearAllRecent = document.getElementById('btnClearAllRecent');

  const lcuDisconnectedView = document.getElementById('lcuDisconnectedView');
  const btnReconnectLcu = document.getElementById('btnReconnectLcu');

  const loadingIndicator = document.getElementById('loadingIndicator');
  const profileSection = document.getElementById('profileSection');
  const profileIconImg = document.getElementById('profileIconImg');
  const profileLevel = document.getElementById('profileLevel');
  const profileGameName = document.getElementById('profileGameName');
  const profileTagLine = document.getElementById('profileTagLine');
  const accumulatedCountBadge = document.getElementById('accumulatedCountBadge');

  const statWinCount = document.getElementById('statWinCount');
  const statLossCount = document.getElementById('statLossCount');
  const statWinRate = document.getElementById('statWinRate');
  const statAvgKDA = document.getElementById('statAvgKDA');
  const statAvgKillsDeaths = document.getElementById('statAvgKillsDeaths');
  const statAvgDamage = document.getElementById('statAvgDamage');
  const statFavAugment = document.getElementById('statFavAugment');
  const statFavAugCount = document.getElementById('statFavAugCount');

  const matchTotalCount = document.getElementById('matchTotalCount');
  const matchListContainer = document.getElementById('matchListContainer');
  const emptyState = document.getElementById('emptyState');
  const matchesSection = document.getElementById('matchesSection');
  const filterChips = document.querySelectorAll('.filter-chip');

  // 챔피언 및 증강체 경기 검색 요소
  const toolbarChampSearchWrapper = document.getElementById('toolbarChampSearchWrapper');
  const matchChampionSearchInput = document.getElementById('matchChampionSearchInput');
  const btnClearChampSearch = document.getElementById('btnClearChampSearch');
  const champSearchDropdown = document.getElementById('champSearchDropdown');
  const champDropdownCount = document.getElementById('champDropdownCount');
  const champDropdownList = document.getElementById('champDropdownList');
  const filteredChampBadge = document.getElementById('filteredChampBadge');
  const statWinRateLabel = document.getElementById('statWinRateLabel');
  const statFavAugLabel = document.getElementById('statFavAugLabel');

  const matchAugmentSearchInput = document.getElementById('matchAugmentSearchInput');
  const btnClearAugSearch = document.getElementById('btnClearAugSearch');

  // 증강체 도감 모달 요소
  const btnAugmentDex = document.getElementById('btnAugmentDex');
  const augmentDexModal = document.getElementById('augmentDexModal');
  const btnCloseDexModal = document.getElementById('btnCloseDexModal');
  const dexSearchInput = document.getElementById('dexSearchInput');
  const dexRarityChips = document.querySelectorAll('.dex-rarity-filters .filter-chip');
  const dexGridContainer = document.getElementById('dexGridContainer');

  // 글로벌 증강체 툴팁 팝업 요소
  const globalAugmentTooltip = document.getElementById('globalAugmentTooltip');
  const tooltipAugImg = document.getElementById('tooltipAugImg');
  const tooltipAugName = document.getElementById('tooltipAugName');
  const tooltipAugRarity = document.getElementById('tooltipAugRarity');
  const tooltipAugDesc = document.getElementById('tooltipAugDesc');

  // 상태 변수
  let currentSummoner = null;
  let currentGames = [];
  let gameByIdMap = new Map();
  let playedChampionsList = [];
  let selectedExactChamp = '';
  let lastAppliedChampKey = null;
  let lastAppliedAugKey = null;
  let filterEmptyEl = null;
  let allAugmentsMap = {};
  let dexCardsInitialized = false;
  let dexCardItems = [];
  let isLcuConnected = false;

  // 아이콘 초기화
  if (window.lucide) window.lucide.createIcons();

  // 1. 초기화 및 LCU 상태 점검
  let myPuuid = null;
  let seenAutoRefreshAt = null;
  let seenBackfillAt = null;

  // 게임 종료 후 서버가 자동 갱신했거나, 과거 경기 스탯 보충이 끝나면 보고 있는 목록에 반영
  function handleAutoRefreshState(state) {
    if (!state) return;
    if (seenAutoRefreshAt === null) {
      seenAutoRefreshAt = state.lastRunAt;
      seenBackfillAt = state.backfill?.finishedAt || 0;
      return;
    }
    const viewing = currentSummoner?.puuid;
    if (state.lastRunAt > seenAutoRefreshAt) {
      seenAutoRefreshAt = state.lastRunAt;
      const added = viewing ? state.updated?.[viewing] : 0;
      if (added > 0) {
        fetchMatches(viewing, { keepFilters: true }).then(() => {
          showRefreshStatus(state.reason === 'game-end' ? `게임 종료 · 새 경기 ${added}개 자동 반영` : `새 경기 ${added}개 자동 반영`);
        });
      }
    }
    const bfAt = state.backfill?.finishedAt || 0;
    if (bfAt > seenBackfillAt) {
      seenBackfillAt = bfAt;
      if (viewing && state.backfill.updated?.includes(viewing)) fetchMatches(viewing, { keepFilters: true });
    }
  }

  async function checkLcuStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      isLcuConnected = data.connected;

      const appVersionEl = document.getElementById('appVersion');
      if (appVersionEl && data.version) appVersionEl.textContent = `v${data.version}`;

      const bookmarkDraggableBtn = document.getElementById('bookmarkDraggableBtn');
      if (bookmarkDraggableBtn && data.openHtmlUrl) {
        bookmarkDraggableBtn.href = data.openHtmlUrl;
      }

      if (data.currentSummoner?.puuid) myPuuid = data.currentSummoner.puuid;
      handleAutoRefreshState(data.autoRefresh);

      if (data.connected) {
        lcuStatusBadge.className = 'status-badge connected';
        lcuStatusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">롤 클라이언트 연결됨</span>`;
        if (lcuDisconnectedView) lcuDisconnectedView.classList.add('hidden');
        if (!currentSummoner && data.currentSummoner) {
          loadSummoner(data.currentSummoner);
        }
      } else {
        lcuStatusBadge.className = 'status-badge disconnected';
        lcuStatusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">롤 클라이언트 미실행</span>`;
        // 오프라인 열람 중이면(저장된 전적 표시 중) 화면을 가리지 않음
        if (!currentSummoner) {
          if (lcuDisconnectedView) lcuDisconnectedView.classList.remove('hidden');
          if (profileSection) profileSection.classList.add('hidden');
        }
      }
    } catch (err) {
      lcuStatusBadge.className = 'status-badge disconnected';
      lcuStatusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">서버 연결 대기 중</span>`;
      if (lcuDisconnectedView) lcuDisconnectedView.classList.remove('hidden');
      if (profileSection) profileSection.classList.add('hidden');
    }
  }

  // 2. 최근 검색어 목록 로드 및 칩 렌더링 (개별 삭제 & 전체 삭제 지원)
  async function loadRecentSearches() {
    try {
      const res = await fetch('/api/recent-searches');
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        recentChipsList.innerHTML = list.map(item => `
          <div class="recent-chip" data-puuid="${escapeHtml(item.puuid)}" data-name="${escapeHtml(item.displayName || item.gameName)}">
            <span class="chip-name">
              <i data-lucide="user" style="width:11px;height:11px;"></i>
              <span>${escapeHtml(item.displayName || item.gameName)}</span>
            </span>
            <button class="chip-delete-btn" data-puuid="${item.puuid}" title="이 검색어 삭제">
              <i data-lucide="x" style="width:11px;height:11px;"></i>
            </button>
          </div>
        `).join('');

        recentSearchesContainer.classList.remove('hidden');

        // 칩 클릭 시 해당 소환사 검색
        recentChipsList.querySelectorAll('.recent-chip').forEach(chip => {
          chip.addEventListener('click', (e) => {
            if (e.target.closest('.chip-delete-btn')) return;
            const name = chip.getAttribute('data-name');
            if (name) {
              summonerSearchInput.value = name;
              searchSummoner(name);
            }
          });
        });

        // 개별 삭제 버튼 이벤트 바인딩
        recentChipsList.querySelectorAll('.chip-delete-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const puuid = btn.getAttribute('data-puuid');
            if (puuid) {
              await deleteRecentSearch(puuid);
            }
          });
        });
      } else {
        recentChipsList.innerHTML = '';
        recentSearchesContainer.classList.add('hidden');
      }
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.warn('최근 검색어 로드 실패:', e);
    }
  }

  // 최근 검색어 단일 삭제
  async function deleteRecentSearch(puuid) {
    try {
      const res = await fetch(`/api/recent-searches/${puuid}`, { method: 'DELETE' });
      if (res.ok) {
        loadRecentSearches();
      }
    } catch (e) {
      console.error('최근 검색어 삭제 실패:', e);
    }
  }

  // 최근 검색어 전체 삭제
  async function clearAllRecentSearches() {
    try {
      const res = await fetch('/api/recent-searches', { method: 'DELETE' });
      if (res.ok) {
        loadRecentSearches();
      }
    } catch (e) {
      console.error('최근 검색어 전체 삭제 실패:', e);
    }
  }

  // 3. 증강체 메타데이터 사전 로드
  async function loadAugmentsMeta() {
    try {
      const res = await fetch('/api/augments');
      allAugmentsMap = await res.json();
    } catch (e) {
      console.warn('증강체 목록 로드 실패:', e);
    }
  }

  // 4. 소환사 데이터 및 매치 불러오기
  async function loadSummoner(summoner) {
    if (!summoner) return;
    currentSummoner = summoner;
    
    if (lcuDisconnectedView) lcuDisconnectedView.classList.add('hidden');
    
    document.getElementById('profileGameName').textContent = summoner.gameName || summoner.displayName || '소환사';
    document.getElementById('profileTagLine').textContent = summoner.tagLine ? `#${summoner.tagLine}` : '';
    document.getElementById('profileLevel').textContent = summoner.summonerLevel || 1;
    
    const iconId = summoner.profileIconId || summoner.profileIcon || 588;
    document.getElementById('profileIconImg').src = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;


    profileSection.classList.remove('hidden');
    loadWatchlist();
    await fetchMatches(summoner.puuid);
    loadRecentSearches();
  }

  // 5. 매치 히스토리 요청
  // keepFilters: 전적 갱신 시 기존 목록과 검색 조건을 유지한 채 새 데이터로 교체
  async function fetchMatches(puuid, { keepFilters = false } = {}) {
    const savedFilters = keepFilters ? {
      champ: matchChampionSearchInput?.value || '',
      aug: matchAugmentSearchInput?.value || '',
      exactChamp: selectedExactChamp
    } : null;

    if (!keepFilters) {
      showLoading(true);
      matchListContainer.innerHTML = '';
    }
    emptyState.classList.add('hidden');
    const emptyMsg = emptyState.querySelector('p');
    if (emptyMsg) emptyMsg.textContent = '롤 클라이언트에서 증강 칼바람을 플레이한 후 다시 조회해보세요.';

    try {
      const res = await fetch(`/api/matches/${puuid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '전적을 불러오지 못했습니다.');

      currentGames = hydrateGames(data.games || [], data.meta);
      prepareGamesIndex(currentGames);
      const actualGamesCount = currentGames.filter(g => !g.isGap).length;

      // 챔피언 및 증강체 경기 검색창 초기화
      selectedExactChamp = '';
      lastAppliedChampKey = '';
      lastAppliedAugKey = '';
      if (matchChampionSearchInput) matchChampionSearchInput.value = '';
      if (btnClearChampSearch) btnClearChampSearch.classList.add('hidden');
      if (champSearchDropdown) champSearchDropdown.classList.add('hidden');
      if (matchAugmentSearchInput) matchAugmentSearchInput.value = '';
      if (btnClearAugSearch) btnClearAugSearch.classList.add('hidden');

      accumulatedCountBadge.textContent = `총 ${actualGamesCount}게임`;
      matchTotalCount.textContent = data.notice
        ? `총 ${actualGamesCount}개의 경기 · ${data.notice}`
        : `총 ${actualGamesCount}개의 경기`;

      buildPlayedChampionsList(currentGames);
      renderChampDropdown('');
      initMatchListDom(currentGames);
      updateProfileStats(currentGames, '');

      if (savedFilters && (savedFilters.champ || savedFilters.aug)) {
        selectedExactChamp = savedFilters.exactChamp;
        if (matchChampionSearchInput) matchChampionSearchInput.value = savedFilters.champ;
        if (matchAugmentSearchInput) matchAugmentSearchInput.value = savedFilters.aug;
        applyMatchFilters(true);
      }
      return data;
    } catch (err) {
      console.error('매치 조회 실패:', err);
      const emptyMsg = emptyState.querySelector('p');
      if (emptyMsg) emptyMsg.textContent = err.message;
      emptyState.classList.remove('hidden');
      return null;
    } finally {
      if (!keepFilters) showLoading(false);
    }
  }

  // 전적 갱신 버튼 (게임 종료 후 최신 경기 반영)
  const btnRefreshMatches = document.getElementById('btnRefreshMatches');
  const refreshStatusEl = document.getElementById('refreshStatus');
  if (btnRefreshMatches) {
    btnRefreshMatches.addEventListener('click', async () => {
      if (!currentSummoner?.puuid || btnRefreshMatches.disabled) return;
      btnRefreshMatches.disabled = true;
      btnRefreshMatches.classList.add('is-loading');
      refreshStatusEl.textContent = '갱신 중...';
      const data = await fetchMatches(currentSummoner.puuid, { keepFilters: true });
      btnRefreshMatches.disabled = false;
      btnRefreshMatches.classList.remove('is-loading');
      if (!data) {
        refreshStatusEl.textContent = '갱신 실패';
      } else if (data.offline) {
        refreshStatusEl.textContent = '롤 클라이언트 미실행';
      } else {
        refreshStatusEl.textContent = data.newCount > 0 ? `새 경기 ${data.newCount}개 추가` : '새 경기 없음';
      }
      clearTimeout(refreshStatusEl._timer);
      refreshStatusEl._timer = setTimeout(() => { refreshStatusEl.textContent = ''; }, 5000);
    });
  }

  function showRefreshStatus(text) {
    if (!refreshStatusEl) return;
    refreshStatusEl.textContent = text;
    clearTimeout(refreshStatusEl._timer);
    refreshStatusEl._timer = setTimeout(() => { refreshStatusEl.textContent = ''; }, 8000);
  }

  // 자동 갱신 목록(auto-refresh.txt) 등록 토글 — 내 계정은 항상 자동 갱신되므로 숨김
  const btnWatchToggle = document.getElementById('btnWatchToggle');
  const btnOpenDataFolder = document.getElementById('btnOpenDataFolder');
  let watchlistEntries = [];
  const normRiotId = s => String(s || '').toLowerCase().replace(/\s+/g, '');
  function currentRiotId() {
    return currentSummoner?.gameName && currentSummoner?.tagLine ? `${currentSummoner.gameName}#${currentSummoner.tagLine}` : '';
  }
  function renderWatchToggle() {
    if (!btnWatchToggle) return;
    const riotId = currentRiotId();
    const isMe = currentSummoner?.puuid && currentSummoner.puuid === myPuuid;
    btnWatchToggle.classList.toggle('hidden', !riotId || isMe);
    const watched = watchlistEntries.some(e => normRiotId(e) === normRiotId(riotId));
    btnWatchToggle.classList.toggle('is-on', watched);
    btnWatchToggle.querySelector('span').textContent = watched ? '★ 자동 갱신 중' : '☆ 자동 갱신';
    btnWatchToggle.title = watched
      ? '전적 검색기를 켤 때와 게임이 끝날 때마다 이 소환사도 함께 갱신합니다. 누르면 해제'
      : '이 소환사를 자동 갱신 목록에 추가 (오래된 경기도 계속 쌓임)';
  }
  async function loadWatchlist() {
    try {
      watchlistEntries = (await (await fetch('/api/watchlist')).json()).entries || [];
    } catch (e) {}
    renderWatchToggle();
  }
  if (btnWatchToggle) {
    btnWatchToggle.addEventListener('click', async () => {
      const riotId = currentRiotId();
      if (!riotId) return;
      const watched = !btnWatchToggle.classList.contains('is-on');
      try {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ riotId, watched })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        watchlistEntries = data.entries || [];
        renderWatchToggle();
      } catch (e) {
        alert(e.message || '자동 갱신 목록을 바꾸지 못했습니다.');
      }
    });
  }
  if (btnOpenDataFolder) {
    btnOpenDataFolder.addEventListener('click', () => fetch('/api/open-data-folder', { method: 'POST' }));
  }

  // ===== 증강 출처 표시 =====
  // 롤 전적에는 레벨 3/7/11/15에 고른 증강(+ 16.21 시즌부터 테마 기믹 보너스 증강)만 남고, 전환(골드/프리즘/혼돈)이 준 일반 증강은 기록되지 않음.
  // 예외적으로 기록되는 것 (저장된 7,496명분 분석 결과):
  //  - 나는 왕이다 보상(프리즘): 왕이 된 시점 순서대로 끼워짐
  //  - 전환이 뽑아 준 증강이 또 전환류(전환/판도라)인 경우: 바로 뒤에 붙어서 기록됨
  const TRANSMUTE_TIER = { '전환: 골드': 'gold', '전환: 프리즘': 'prismatic', '전환: 혼돈': 'any' };
  const CHAINABLE = new Set(['전환: 골드', '전환: 프리즘', '전환: 혼돈', '판도라의 상자']);
  const KING = '나는 왕이다';
  const PANDORA = '판도라의 상자';

  // 기본 선택은 레벨 3/7/11/15의 4개. 16.21 시즌부터는 게임별 테마 기믹으로 증강을 더 받을 수 있어
  // 최대 6개까지 표시하며, 그 경우에도 기준은 4개로 둠
  function annotateAugments(augs, champLevel) {
    const list = augs.map(aug => ({ ...aug }));
    const picks = [3, 7, 11, 15].filter(l => (champLevel || 0) >= l).length;
    let extra = list.length - picks;

    for (let i = 1; i < list.length && extra > 0; i++) {
      const tier = TRANSMUTE_TIER[list[i - 1].name];
      if (tier && CHAINABLE.has(list[i].name) && (tier === 'any' || list[i].rarityCode === tier) && !list[i - 1].source) {
        list[i].source = 'chain';
        list[i].note = `↳ 앞의 '${list[i - 1].name}'이(가) 뽑아 준 증강입니다.`;
        extra--;
      }
    }

    const kingIdx = list.findIndex(x => x.name === KING);
    if (kingIdx >= 0) {
      const candidates = list.slice(kingIdx + 1).filter(x => x.rarityCode === 'prismatic' && !x.source);
      if (extra > 0 && candidates.length === 1) {
        candidates[0].source = 'king';
        candidates[0].note = '👑 나는 왕이다 보상으로 얻은 증강입니다.';
        list[kingIdx].note = '보상 증강도 함께 기록되어 있습니다. (👑 표시)';
      } else if (extra > 0) {
        list[kingIdx].note = '보상 증강이 기록되어 있지만 뒤의 프리즘 증강 중 어느 것인지는 구분할 수 없습니다.';
      } else {
        list[kingIdx].note = '이 경기에는 보상 증강 기록이 없습니다. (왕이 되기 전에 게임이 끝난 경우 등)';
      }
    }

    for (const x of list) {
      if (TRANSMUTE_TIER[x.name] && !x.note) {
        x.note = '이 증강이 준 결과 증강은 롤 전적에 기록되지 않아 확인할 수 없습니다.';
      } else if (TRANSMUTE_TIER[x.name] && x.source === 'chain') {
        x.note += ' 이 증강이 다시 준 결과는 기록되지 않습니다.';
      }
      if (x.name === PANDORA) {
        x.note = (x.note ? x.note + ' ' : '') + '판도라의 상자로 바뀐 증강은 롤 전적에 반영되지 않아, 원래 고른 증강이 표시됩니다.';
      }
    }
    return list;
  }

  const AUG_SOURCE_MARK = { king: '👑', chain: '↳' };
  function augSourceAttrs(aug) {
    return ` data-aug-note="${encodeURIComponent(aug.note || '')}"`;
  }
  function augSourceMark(aug) {
    return aug.source ? `<span class="aug-source-mark src-${aug.source}">${AUG_SOURCE_MARK[aug.source]}</span>` : '';
  }

  // 서버의 경량 포맷(ID만 포함)을 렌더링용 객체 구조로 복원
  function hydrateGames(games, meta) {
    if (!meta) return games;
    const fallbackChamp = id => ({
      id,
      name: `챔피언 #${id}`,
      squarePortraitPath: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`
    });
    return games.map(g => {
      if (g.isGap) return g;
      const participants = (g.participants || []).map(p => ({
        ...p,
        champion: meta.champions[p.championId] || fallbackChamp(p.championId),
        spells: (p.spellIds || []).map(id => meta.spells[id] || null),
        items: (p.itemIds || []).map(id => (id > 0 ? meta.items[id] || null : null)),
        augments: annotateAugments((p.augmentIds || []).map(id => meta.augments[id]).filter(Boolean), p.champLevel)
      }));
      // 게임 종료 화면에서 받은 '팀원 보호막' 값이 있으면 회복·보호 칸에 포함
      if (participants.some(p => p.ext?.totalDamageShieldedOnTeammates !== undefined)) {
        for (const p of participants) p.totalHeal = (p.totalHeal || 0) + (p.ext?.totalDamageShieldedOnTeammates || 0);
        const maxHeal = Math.max(0, ...participants.map(p => p.totalHeal));
        for (const p of participants) p.healPercent = maxHeal > 0 ? Math.round((p.totalHeal / maxHeal) * 100) : 0;
      }
      return {
        ...g,
        participants,
        team100: participants.filter(p => p.teamId === 100),
        team200: participants.filter(p => p.teamId === 200),
        targetParticipant: participants.find(p => p.isTarget) || null
      };
    });
  }

  // 검색 속도 최적화를 위한 사전 인덱싱 (게임 로드 시 1회만 수행)
  function prepareGamesIndex(games) {
    gameByIdMap.clear();
    (games || []).forEach(g => {
      g._el = null;
      if (g.isGap) return;
      g._detailRendered = false;
      g._champName = g.targetParticipant?.champion?.name || '';
      g._targetAugNames = (g.targetParticipant?.augments || [])
        .map(a => (a?.name || '').toLowerCase().replace(/\s+/g, ''))
        .filter(Boolean);
      const allP = [...(g.team100 || []), ...(g.team200 || []), g.targetParticipant].filter(Boolean);
      g._allAugNames = allP.flatMap(p =>
        (p.augments || []).map(a => (a?.name || '').toLowerCase().replace(/\s+/g, ''))
      ).filter(Boolean);
      gameByIdMap.set(String(g.gameId), g);
    });
  }

  // 한글 초성 추출 및 초성 포함 검색 도우미
  const CHOSUNG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  function matchesKoreanSearch(target, query) {
    if (!query) return true;
    const cleanTarget = (target || '').toLowerCase().replace(/\s+/g, '');
    const cleanQuery = query.toLowerCase().replace(/\s+/g, '');
    if (cleanTarget.includes(cleanQuery)) return true;
    if (cleanQuery.length > cleanTarget.length) return false;

    for (let start = 0; start <= cleanTarget.length - cleanQuery.length; start++) {
      let matched = true;
      for (let i = 0; i < cleanQuery.length; i++) {
        const qChar = cleanQuery[i];
        const tChar = cleanTarget[start + i];
        if (qChar === tChar) continue;
        const code = tChar.charCodeAt(0) - 44032;
        const tCho = (code >= 0 && code <= 11171) ? CHOSUNG_LIST[Math.floor(code / 588)] : tChar;
        if (qChar !== tCho) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }
    return false;
  }

  // 플레이한 챔피언 목록 집계 (판수 내림차순 -> 승률 내림차순 -> 이름 오름차순)
  function buildPlayedChampionsList(games) {
    const map = {};
    const actualGames = (games || []).filter(g => !g.isGap);

    actualGames.forEach(g => {
      const p = g.targetParticipant;
      if (!p || !p.champion || !p.champion.name) return;
      const cName = p.champion.name;
      if (!map[cName]) {
        map[cName] = {
          name: cName,
          icon: p.champion.squarePortraitPath || '',
          games: 0,
          playedGames: 0,
          wins: 0,
          losses: 0
        };
      }
      map[cName].games += 1;
      if (!g.isRemake) {
        map[cName].playedGames += 1;
        if (p.win) map[cName].wins += 1;
        else map[cName].losses += 1;
      }
    });

    playedChampionsList = Object.values(map).map(item => ({
      ...item,
      winRate: item.playedGames > 0 ? Math.round((item.wins / item.playedGames) * 100) : 0
    })).sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.name.localeCompare(b.name, 'ko');
    });
  }

  // 챔피언 검색 드롭다운 렌더링
  function renderChampDropdown(query = '') {
    if (!champDropdownList || !champDropdownCount) return;
    champDropdownCount.textContent = `${playedChampionsList.length}종`;

    const filteredChamps = playedChampionsList.filter(c => matchesKoreanSearch(c.name, query));
    if (filteredChamps.length === 0) {
      champDropdownList.innerHTML = `<div class="champ-dropdown-empty">일치하는 플레이 챔피언이 없습니다.</div>`;
      return;
    }

    const currentVal = (matchChampionSearchInput?.value || '').trim();
    champDropdownList.innerHTML = filteredChamps.map(c => {
      const wrClass = c.winRate >= 60 ? 'high' : (c.winRate >= 50 ? 'mid' : 'low');
      const isActive = currentVal === c.name ? 'active' : '';
      return `
        <div class="champ-dropdown-item ${isActive}" data-champ-name="${escapeHtml(c.name)}">
          <div class="champ-dropdown-left">
            <img src="${c.icon}" alt="${escapeHtml(c.name)}" class="champ-dropdown-avatar" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'">
            <span class="champ-dropdown-name">${escapeHtml(c.name)}</span>
          </div>
          <div class="champ-dropdown-right">
            <span class="champ-dropdown-games">${c.games}게임 (${c.wins}승 ${c.losses}패)</span>
            <span class="champ-dropdown-wr ${wrClass}">${c.winRate}%</span>
          </div>
        </div>
      `;
    }).join('');

    champDropdownList.querySelectorAll('.champ-dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // input blur 보다 먼저 실행 보장
        const cName = item.getAttribute('data-champ-name');
        if (cName && matchChampionSearchInput) {
          selectedExactChamp = cName;
          matchChampionSearchInput.value = cName;
          champSearchDropdown.classList.add('hidden');
          applyMatchFilters();
        }
      });
    });
  }

  // 6. 프로필 종합 통계 계산 (챔피언 필터 적용 시 해당 챔피언 기준으로 정렬/재계산)
  // "16.20.824.8524" → "16.20"
  const patchOf = v => (v ? String(v).split('.').slice(0, 2).join('.') : '');
  function updatePatchStat(games) {
    const labelEl = document.getElementById('statPatchLabel');
    if (!labelEl) return;
    const played = (games || []).filter(g => !g.isGap && !g.isRemake && g.gameVersion && g.targetParticipant);
    const latest = played.reduce((best, g) => (!best || g.gameCreation > best.gameCreation ? g : best), null);
    const patch = latest ? patchOf(latest.gameVersion) : '';
    const list = played.filter(g => patchOf(g.gameVersion) === patch);
    const wins = list.filter(g => g.targetParticipant.win).length;
    labelEl.textContent = patch ? `${patch} 패치 승률` : '이번 패치 승률';
    document.getElementById('statPatchWin').textContent = list.length ? `${wins}승` : '-';
    document.getElementById('statPatchLoss').textContent = list.length ? `${list.length - wins}패` : '';
    document.getElementById('statPatchRate').textContent = list.length ? `승률 ${Math.round((wins / list.length) * 100)}%` : '패치 정보 수집 중';
  }

  function updateProfileStats(games, activeChampLabel = '') {
    updatePatchStat(games);
    const actualGames = (games || []).filter(g => !g.isGap);
    const validPlayedGames = actualGames.filter(g => !g.isRemake);

    if (statWinRateLabel) {
      statWinRateLabel.textContent = activeChampLabel ? `${activeChampLabel} 승률` : '누적 승률';
    }
    if (statFavAugLabel) {
      statFavAugLabel.textContent = activeChampLabel ? `${activeChampLabel} 선호 증강` : '선호 증강체';
    }
    if (filteredChampBadge) {
      if (activeChampLabel) {
        filteredChampBadge.textContent = `⚔️ ${activeChampLabel} (${actualGames.length}게임) ✕`;
        filteredChampBadge.title = '클릭하여 챔피언 필터 해제';
        filteredChampBadge.classList.remove('hidden');
      } else {
        filteredChampBadge.classList.add('hidden');
      }
    }

    if (actualGames.length === 0) {
      document.getElementById('statWinCount').textContent = '0승';
      document.getElementById('statLossCount').textContent = '0패';
      document.getElementById('statWinRate').textContent = '승률 0%';
      document.getElementById('statAvgKDA').textContent = '0.00:1';
      document.getElementById('statAvgKillsDeaths').textContent = '0.0 / 0.0 / 0.0';
      document.getElementById('statMaxWinStreak').textContent = '0연승';
      document.getElementById('statMaxLossStreak').textContent = '0연패';
      document.getElementById('statCurrentStreak').textContent = '현재 -';
      document.getElementById('statFavAugment').textContent = '-';
      document.getElementById('statFavAugCount').textContent = '0회 픽';
      return;
    }

    let wins = 0;
    let losses = 0;
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;
    const augmentStats = {};

    actualGames.forEach(g => {
      const p = g.targetParticipant;
      if (!p) return;

      // 다시하기(Remake) 판은 승/패 카운트에서 제외 (무효 처리)
      if (!g.isRemake) {
        if (p.win) wins++;
        else losses++;
      }

      totalKills += p.kills;
      totalDeaths += p.deaths;
      totalAssists += p.assists;

      (p.augments || []).forEach(aug => {
        if (aug && aug.name) {
          if (!augmentStats[aug.name]) {
            augmentStats[aug.name] = { count: 0, wins: 0 };
          }
          augmentStats[aug.name].count += 1;
          if (!g.isRemake && p.win) {
            augmentStats[aug.name].wins += 1;
          }
        }
      });
    });

    // 최다 연승 / 최다 연패 계산 (공백 isGap 발생 시 streak 리셋, 다시하기 isRemake는 streak 유지)
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let curWins = 0;
    let curLosses = 0;

    for (const item of (games || [])) {
      if (item.isGap) {
        // 공백 구간: 연속 기록 리셋
        curWins = 0;
        curLosses = 0;
        continue;
      }

      // 다시하기 판은 승리도 패배도 아니므로 streak을 끊지 않고 보존
      if (item.isRemake) continue;

      const p = item.targetParticipant;
      if (!p) continue;

      if (p.win) {
        curWins++;
        curLosses = 0;
        if (curWins > maxWinStreak) maxWinStreak = curWins;
      } else {
        curLosses++;
        curWins = 0;
        if (curLosses > maxLossStreak) maxLossStreak = curLosses;
      }
    }

    // 최신 기준 현재 연속 기록(Current Streak) 계산 (다시하기는 건너뜀)
    let currentStreakText = '현재 -';
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const item of (games || [])) {
      if (item.isGap) break;
      if (item.isRemake) continue; // 다시하기는 건너뜀

      const p = item.targetParticipant;
      if (!p) continue;

      if (currentWinStreak === 0 && currentLossStreak === 0) {
        if (p.win) currentWinStreak = 1;
        else currentLossStreak = 1;
      } else if (currentWinStreak > 0) {
        if (p.win) currentWinStreak++;
        else break;
      } else if (currentLossStreak > 0) {
        if (!p.win) currentLossStreak++;
        else break;
      }
    }

    if (currentWinStreak > 0) {
      currentStreakText = `현재 ${currentWinStreak}연승 중`;
    } else if (currentLossStreak > 0) {
      currentStreakText = `현재 ${currentLossStreak}연패 중`;
    }

    const totalCount = actualGames.length;
    const playedCount = validPlayedGames.length;
    const winRate = playedCount > 0 ? Math.round((wins / playedCount) * 100) : 0;
    const avgK = (totalKills / totalCount).toFixed(1);
    const avgD = (totalDeaths / totalCount).toFixed(1);
    const avgA = (totalAssists / totalCount).toFixed(1);
    const kdaRatio = totalDeaths === 0 ? ((totalKills + totalAssists)).toFixed(2) : ((totalKills + totalAssists) / totalDeaths).toFixed(2);

    // 최다 선택 증강체 정렬 (선택 횟수 내림차순 -> 승리 횟수 내림차순)
    let favAugName = '-';
    let favAugCount = 0;
    let favAugWins = 0;
    for (const [name, st] of Object.entries(augmentStats)) {
      if (st.count > favAugCount || (st.count === favAugCount && st.wins > favAugWins)) {
        favAugName = name;
        favAugCount = st.count;
        favAugWins = st.wins;
      }
    }

    document.getElementById('statWinCount').textContent = `${wins}승`;
    document.getElementById('statLossCount').textContent = `${losses}패`;
    document.getElementById('statWinRate').textContent = `승률 ${winRate}%`;
    document.getElementById('statAvgKDA').textContent = `${kdaRatio}:1`;
    document.getElementById('statAvgKillsDeaths').textContent = `${avgK} / ${avgD} / ${avgA}`;
    document.getElementById('statMaxWinStreak').textContent = `${maxWinStreak}연승`;
    document.getElementById('statMaxLossStreak').textContent = `${maxLossStreak}연패`;
    document.getElementById('statCurrentStreak').textContent = currentStreakText;
    document.getElementById('statFavAugment').textContent = favAugName;
    document.getElementById('statFavAugCount').textContent = favAugCount > 0 ? `${favAugCount}회 선택` : '-';
  }

  // 인라인 SVG 상수 (매치 카드 생성 시 lucide 전체 스캔 제거용)
  const SVG_SPARKLES = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
  const SVG_CHEVRON_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;

  // 7. 매치 목록 초기 DOM 1회 구축 (검색 시에는 재렌더링 없이 hidden 클래스만 토글!)
  function initMatchListDom(items) {
    matchListContainer.innerHTML = '';
    filterEmptyEl = null;

    if (!items || items.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    const frag = document.createDocumentFragment();

    items.forEach(item => {
      const el = item.isGap ? createGapDividerElement(item) : createMatchCardElement(item);
      item._el = el;
      frag.appendChild(el);
    });

    // 검색 결과 0건일 때 표시할 재사용 요소
    filterEmptyEl = document.createElement('div');
    filterEmptyEl.className = 'empty-state hidden';
    frag.appendChild(filterEmptyEl);

    matchListContainer.classList.add('is-entering');
    matchListContainer.appendChild(frag);
    clearTimeout(initMatchListDom.enterTimer);
    initMatchListDom.enterTimer = setTimeout(() => matchListContainer.classList.remove('is-entering'), 400);
  }

  // 한글 조합 중 미완성 단일 자모(ㄱ~ㅎ, ㅏ~ㅣ) 처리 헬퍼
  // 1) 증강체 검색: 초성 검색이 아닌 완성된 글자/영문/숫자만 추출 ("ㅈ" -> "", "점ㅁ" -> "점", "점멸 ㄴ" -> "점멸")
  function getCompletedAugQuery(raw) {
    if (!raw) return '';
    return raw.trim().toLowerCase().replace(/\s+/g, '').replace(/[ㄱ-ㅎㅏ-ㅣ]+/g, '');
  }

  // 2) 챔피언 검색: 완성된 음절이 포함된 경우 끝에 조합 중인 미완성 낱자 제거 ("제ㅇ" -> "제"),
  //    순수 초성 입력인 경우 2글자 이상("ㅈㅋ")부터 즉시 매치 필터링 적용 ("ㅈ" 1글자는 드롭다운만 우선 필터링)
  function getEffectiveChampQuery(raw) {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (selectedExactChamp && selectedExactChamp === trimmed) {
      return selectedExactChamp;
    }
    if (/[가-힣]/.test(trimmed)) {
      return trimmed.replace(/[ㄱ-ㅎㅏ-ㅣ]+$/, '');
    }
    const noSpace = trimmed.replace(/\s+/g, '');
    if (/^[ㄱ-ㅎㅏ-ㅣ]$/.test(noSpace)) {
      return '';
    }
    return trimmed;
  }

  // 7-1. 챔피언 + 증강체 초고속 통합 경기 필터링 (DOM 재생성 0회, 0.1ms 내외)
  // 통계 창에서 증강을 눌러 들어온 경우엔 '내가 고른 증강' 기준으로만 검색
  let augSearchMineOnly = false;

  function applyMatchFilters(force = false) {
    const rawChampVal = (matchChampionSearchInput?.value || '').trim();
    const rawAugVal = (matchAugmentSearchInput?.value || '').trim();

    if (btnClearChampSearch) {
      btnClearChampSearch.classList.toggle('hidden', rawChampVal.length === 0);
    }
    if (btnClearAugSearch) {
      btnClearAugSearch.classList.toggle('hidden', rawAugVal.length === 0);
    }

    if (!currentGames || currentGames.length === 0) return;

    const effectiveChampVal = getEffectiveChampQuery(rawChampVal);
    const effectiveAugKeyword = getCompletedAugQuery(rawAugVal);

    // 완성된 글자 기준 검색어가 이전과 동일하면 불필요한 재계산/DOM 조작 즉시 건너뜀
    if (force !== true && effectiveChampVal === lastAppliedChampKey && effectiveAugKeyword === lastAppliedAugKey) {
      return;
    }
    lastAppliedChampKey = effectiveChampVal;
    lastAppliedAugKey = effectiveAugKeyword;

    const actualGames = currentGames.filter(g => !g.isGap);

    // 유효 검색어가 모두 비어있으면 전체 목록 및 전체 통계 즉시 복원
    if (!effectiveChampVal && !effectiveAugKeyword) {
      emptyState.classList.add('hidden');
      if (filterEmptyEl) filterEmptyEl.classList.add('hidden');
      currentGames.forEach(item => {
        if (item._el) item._el.classList.remove('hidden');
      });
      matchTotalCount.textContent = `총 ${actualGames.length}개의 경기`;
      updateProfileStats(currentGames, '');
      return;
    }

    // 1) 챔피언 필터 판정 및 상단 통계 재계산
    let champMatchedGames = actualGames;
    if (effectiveChampVal) {
      const isExact = Boolean(selectedExactChamp && selectedExactChamp === effectiveChampVal);
      champMatchedGames = actualGames.filter(game => {
        const cName = game._champName || '';
        return isExact ? (cName === selectedExactChamp) : matchesKoreanSearch(cName, effectiveChampVal);
      });

      const matchedChampNames = [...new Set(champMatchedGames.map(g => g._champName).filter(Boolean))];
      const activeChampLabel = matchedChampNames.length === 1 ? matchedChampNames[0] : effectiveChampVal;
      updateProfileStats(champMatchedGames, activeChampLabel);
    } else {
      updateProfileStats(currentGames, '');
    }

    const champMatchedSet = effectiveChampVal ? new Set(champMatchedGames) : null;

    // 2) 증강체 필터 판정 및 캐싱된 DOM 토글 (Gap 구분선은 필터 시 숨김)
    let visibleCount = 0;
    currentGames.forEach(item => {
      if (!item._el) return;
      if (item.isGap) {
        item._el.classList.add('hidden');
        return;
      }

      let match = true;
      if (champMatchedSet && !champMatchedSet.has(item)) {
        match = false;
      }
      if (match && effectiveAugKeyword) {
        const augList = (effectiveChampVal || augSearchMineOnly) ? (item._targetAugNames || []) : (item._allAugNames || []);
        match = augList.some(aName => aName.includes(effectiveAugKeyword));
      }

      item._el.classList.toggle('hidden', !match);
      if (match) visibleCount++;
    });

    matchTotalCount.textContent = `총 ${actualGames.length}개 중 ${visibleCount}개 검색됨`;

    if (filterEmptyEl) {
      if (visibleCount === 0) {
        const emptyLabel = [
          effectiveChampVal && `'${escapeHtml(effectiveChampVal)}' 챔피언`,
          effectiveAugKeyword && `'${escapeHtml(rawAugVal)}' 증강체`
        ].filter(Boolean).join(' + ');
        filterEmptyEl.innerHTML = `
          <h3>${emptyLabel} 조건에 해당하는 경기가 없습니다.</h3>
          <p>다른 챔피언이나 증강체 이름을 검색하거나 검색창을 비워보세요.</p>
        `;
        filterEmptyEl.classList.remove('hidden');
      } else {
        filterEmptyEl.classList.add('hidden');
      }
    }
  }

  // Gap 구분선 요소 생성
  function createGapDividerElement(gapItem) {
    const divider = document.createElement('div');
    divider.className = 'gap-divider';

    const newerDate = gapItem.newerGameTime ? formatDate(gapItem.newerGameTime) : '';
    const olderDate = gapItem.olderGameTime ? formatDate(gapItem.olderGameTime) : '';
    const timeRangeStr = (newerDate && olderDate) ? ` (${olderDate} ~ ${newerDate})` : '';

    divider.innerHTML = `
      <div class="gap-line"></div>
      <div class="gap-content">
        <span class="gap-dots">· · ·</span>
        <span class="gap-text">이 사이의 미기록 경기 존재${timeRangeStr}</span>
        <span class="gap-dots">· · ·</span>
      </div>
      <div class="gap-line"></div>
    `;
    return divider;
  }

  // 매치 카드 단일 요소 생성 (10인 상세 서랍은 클릭 시 지연 렌더링)
  function createMatchCardElement(game) {
    const p = game.targetParticipant || {};
    const isRemake = Boolean(game.isRemake || p.isRemake || (game.gameDuration > 0 && game.gameDuration < 240));
    const isWin = p.win;
    const champ = p.champion || {};
    
    const resultTheme = isRemake ? 'remake' : (isWin ? 'win' : 'loss');
    const card = document.createElement('div');
    card.className = `match-card ${resultTheme}`;
    card.id = `match-${game.gameId}`;

    const durationMin = Math.floor(game.gameDuration / 60);
    const durationSec = game.gameDuration % 60;
    const timeAgo = formatTimeAgo(game.gameCreation);
    const augmentsHtml = renderAugmentSlotsHtml(p.augments || []);
    const itemsHtml = renderItemSlotsHtml(p.items || []);

    const modeNameText = game.modeName || (game.isMayhemClassic ? '아수라장 클래식' : '아수라장');
    const resultBadgeText = isRemake ? '다시하기' : (isWin ? '승리' : '패배');

    card.innerHTML = `
      <div class="match-summary-row" onclick="toggleMatchDetail('${game.gameId}')">
        <div class="col-meta">
          <div class="game-mode-row">
            <span class="game-mode-title">${escapeHtml(modeNameText)}</span>
          </div>
          <span class="game-time-ago">${timeAgo}</span>
          <span class="game-result-badge">${resultBadgeText}</span>
          <span class="game-duration">${durationMin}분 ${durationSec}초</span>
        </div>

        <div class="col-champ">
          <div class="champ-avatar-box">
            <img src="${champ.squarePortraitPath || ''}" alt="${escapeHtml(champ.name)}" class="champ-avatar" loading="lazy" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'">
            <span class="champ-lvl">${p.champLevel || 1}</span>
          </div>
          <div class="champ-meta">
            <span class="champ-name">${escapeHtml(champ.name || '챔피언')}</span>
            <div class="spells-row">
              ${(p.spells || []).map(s => s?.iconUrl ? `<img src="${s.iconUrl}" class="spell-icon" loading="lazy" title="${escapeHtml(s.name)}">` : '').join('')}
            </div>
          </div>
        </div>

        <div class="col-kda">
          <div class="kda-scores">
            <span class="kills">${p.kills}</span><span class="slash">/</span><span class="deaths">${p.deaths}</span><span class="slash">/</span><span class="assists">${p.assists}</span>
          </div>
          <span class="kda-ratio">${p.kda}:1 평점</span>
          <span class="kp-rate">킬관여 ${p.killParticipation || 0}%</span>
          ${renderMultiKillBadge(p)}
        </div>

        <div class="col-augments">
          <span class="augment-label-bar">${SVG_SPARKLES} 장착 증강체</span>
          <div class="augment-slots-grid${(p.augments || []).length > 4 ? ` many-${Math.min(p.augments.length, 6)}` : ''}">
            ${augmentsHtml}
          </div>
        </div>

        <div class="col-items">
          ${itemsHtml}
        </div>

        <div class="col-damage">
          <div class="dmg-number-row">
            <span class="dmg-val">${(p.totalDamage || 0).toLocaleString()}</span>
            ${p.isHighestDamage ? `<span class="dmg-rank-badge">1위</span>` : ''}
          </div>
          <div class="dmg-bar-bg">
            <div class="dmg-bar-multi" style="width: ${p.damagePercent || 0}%;">
              <div class="dmg-seg seg-phys" style="width: ${p.physicalDamagePercent || 0}%;" title="물리: ${(p.physicalDamage || 0).toLocaleString()} (${p.physicalDamagePercent || 0}%)"></div>
              <div class="dmg-seg seg-magic" style="width: ${p.magicDamagePercent || 0}%;" title="마법: ${(p.magicDamage || 0).toLocaleString()} (${p.magicDamagePercent || 0}%)"></div>
              <div class="dmg-seg seg-true" style="width: ${p.trueDamagePercent || 0}%;" title="고정: ${(p.trueDamage || 0).toLocaleString()} (${p.trueDamagePercent || 0}%)"></div>
            </div>
          </div>
          <div class="dmg-types-row">
            <span class="dmg-type-tag phys" title="물리 피해: ${(p.physicalDamage || 0).toLocaleString()} (${p.physicalDamagePercent || 0}%)">물리 ${(p.physicalDamage || 0).toLocaleString()}</span>
            <span class="dmg-type-tag magic" title="마법 피해: ${(p.magicDamage || 0).toLocaleString()} (${p.magicDamagePercent || 0}%)">마법 ${(p.magicDamage || 0).toLocaleString()}</span>
            ${p.trueDamage > 0 ? `<span class="dmg-type-tag true" title="고정 피해: ${(p.trueDamage || 0).toLocaleString()} (${p.trueDamagePercent || 0}%)">고정 ${(p.trueDamage || 0).toLocaleString()}</span>` : ''}
          </div>
        </div>

        <div class="col-expand-btn">
          ${SVG_CHEVRON_DOWN}
        </div>
      </div>

      <div class="match-detail-drawer" id="detail-${game.gameId}"></div>
    `;

    return card;
  }

  // 증강체 이름 사용자 지정 예외 및 줄바꿈 최적화 매핑
  const SHORT_AUGMENT_NAMES = {
    '꽃피는 새벽의 검 업그레이드': '꽃새검\n업그레이드',
    '퀘스트: 우글렛의 마녀 모자': '우글렛의\n마녀 모자',
    '우글렛의 마녀 모자': '우글렛의\n마녀 모자',
    '퀘스트: 강철 같은 심장': '강철심장\n퀘스트',
    '강철심장 퀘스트': '강철심장\n퀘스트',
    '퀘스트: 이케시아의 몰락': '이케시아의\n몰락',
    '이케시아의 몰락': '이케시아의\n몰락',
    '퀘스트: 우르프의 챔피언': '우르프의\n챔피언',
    '우르프의 챔피언': '우르프의\n챔피언',
    '무한의 대검 업그레이드': '무한의 대검\n업그레이드',
    '갈라진 하늘 업그레이드': '갈라진 하늘\n업그레이드',
    '굶주린 히드라 업그레이드': '굶주린 히드라\n업그레이드',
    '징수의 총 업그레이드': '징수의 총\n업그레이드',
    '광휘의 검 업그레이드': '광휘의 검\n업그레이드',
    '불사르기 업그레이드': '불사르기\n업그레이드',
    '마도사의 주스 상자': '마도사의\n주스 상자',
    '최상급 조준경 부착': '최상급\n조준경 부착',
    '하체 운동의 날': '하체\n운동의 날',
    '응급 처치 키트': '응급 처치\n키트',
    '시작부터 끝까지': '시작부터\n끝까지',
    '도망갈 수 없어': '도망갈 수\n없어',
    '태양의 대포 부착': '태양의 대포\n부착'
  };

  function getShortAugName(name) {
    if (!name) return '';
    if (SHORT_AUGMENT_NAMES[name]) return SHORT_AUGMENT_NAMES[name];
    if (SHORT_AUGMENT_NAMES[name.replace(/\s+/g, '')]) return SHORT_AUGMENT_NAMES[name.replace(/\s+/g, '')];
    // 만약 기타 퀘스트 증강체인 경우 '퀘스트: ' 접두어 제거
    if (name.startsWith('퀘스트: ')) {
      const clean = name.replace(/^퀘스트:\s*/, '');
      return SHORT_AUGMENT_NAMES[clean] || clean;
    }
    return name;
  }

  // 최다 멀티킬 표기 (모든 단계 같은 스타일)
  const MULTI_KILL_LABELS = { 2: '더블킬', 3: '트리플킬', 4: '쿼드라킬', 5: '펜타킬' };
  function renderMultiKillBadge(p) {
    const n = Math.min(p.ext?.largestMultiKill || 0, 5);
    return n >= 2 ? `<span class="multikill-badge">${MULTI_KILL_LABELS[n]}</span>` : '';
  }

  // 증강은 보통 4개지만 전환: 혼돈 / 나는 왕이다 등으로 최대 6개까지 획득 가능
  function renderAugmentSlotsHtml(augments) {
    let html = '';
    const slotCount = Math.max(4, Math.min(augments.length, 6));
    for (let i = 0; i < slotCount; i++) {
      const aug = augments[i];
      if (aug) {
        const shortName = getShortAugName(aug.name);
        const labelHtml = shortName.split('\n').map(line => escapeHtml(line)).join('<br>');
        html += `
          <div class="aug-slot-wrapper">
            <div class="augment-slot ${aug.rarityCode}${aug.source ? ' has-source' : ''}"
                 data-aug-id="${aug.id}"
                 data-aug-name="${escapeHtml(aug.name)}"
                 data-aug-desc="${encodeURIComponent(aug.styledDescription || aug.description || '')}"
                 data-aug-rarity="${aug.rarityLabel}"${augSourceAttrs(aug)}
                 data-aug-icon="${aug.iconUrl}">
              ${augSourceMark(aug)}
              <img src="${aug.iconUrl}" alt="${escapeHtml(aug.name)}" loading="lazy" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'">
            </div>
            <span class="aug-name-label" title="${escapeHtml(aug.name)}">${labelHtml}</span>
          </div>
        `;
      } else {
        html += `
          <div class="aug-slot-wrapper">
            <div class="augment-slot empty"></div>
            <span class="aug-name-label empty-label">-</span>
          </div>
        `;
      }
    }
    return html;
  }

  function renderItemSlotsHtml(items) {
    let html = '';
    for (let i = 0; i < 7; i++) {
      const item = items[i];
      if (item && item.iconUrl) {
        html += `
          <div class="item-slot" title="${escapeHtml(item.name)}">
            <img src="${item.iconUrl}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.style.display='none'">
          </div>
        `;
      } else {
        html += `<div class="item-slot empty"></div>`;
      }
    }
    return html;
  }

  function renderTeamDetailHtml(participants, isTeamWin) {
    const headerRow = `
      <div class="detail-table-header">
        <span class="th-col th-player">소환사</span>
        <span class="th-col th-kda">KDA</span>
        <span class="th-col th-aug">증강체</span>
        <span class="th-col th-stat dealt">가한 피해</span>
        <span class="th-col th-stat taken">받은 피해</span>
        <span class="th-col th-stat heal">회복·보호</span>
        <span class="th-col th-items">아이템</span>
      </div>
    `;

    const rows = participants.map(p => {
      const augsMini = (p.augments || []).map(aug => `
        <div class="aug-mini-slot ${aug.rarityCode}${aug.source ? ' has-source' : ''}"
             data-aug-id="${aug.id}"
             data-aug-name="${escapeHtml(aug.name)}"
             data-aug-desc="${encodeURIComponent(aug.styledDescription || aug.description || '')}"
             data-aug-rarity="${aug.rarityLabel}"${augSourceAttrs(aug)}
             data-aug-icon="${aug.iconUrl}">
          ${augSourceMark(aug)}
          <img src="${aug.iconUrl}" alt="${escapeHtml(aug.name)}" loading="lazy">
        </div>
      `).join('');

      const itemsMini = (p.items || []).slice(0, 6).map(it => `
        <div class="item-mini-slot" title="${escapeHtml(it?.name)}">
          ${it?.iconUrl ? `<img src="${it.iconUrl}" loading="lazy">` : ''}
        </div>
      `).join('');

      const leaverBadgeHtml = (p.isLeaver || p.causedEarlySurrender)
        ? `<span class="leaver-badge" title="탈주 또는 다시하기 유발">탈주</span>`
        : '';

      return `
        <div class="detail-player-row ${p.isTarget ? 'is-target' : ''}">
          <div class="player-info-cell">
            <img src="${p.champion?.squarePortraitPath || ''}" class="player-champ-icon" alt="${escapeHtml(p.champion?.name)}" loading="lazy">
            <span class="player-name-text${p.gameName && p.tagLine && !p.isTarget ? ' is-searchable' : ''}"
                  title="${escapeHtml(p.gameName && p.tagLine ? `${p.gameName}#${p.tagLine}` : p.summonerName)}"
                  ${p.gameName && p.tagLine ? `data-riot-id="${escapeHtml(`${p.gameName}#${p.tagLine}`)}"` : ''}>
              <span class="player-name-main">${escapeHtml(p.gameName || p.summonerName || '소환사')}</span>${p.tagLine ? `<span class="player-name-tag">#${escapeHtml(p.tagLine)}</span>` : ''}
            </span>
            ${leaverBadgeHtml}
          </div>
          <div class="player-kda-text">${p.kills}/${p.deaths}/${p.assists}</div>
          <div class="player-augments-mini${(p.augments || []).length > 4 ? ` many-${Math.min(p.augments.length, 6)}` : ''}">${augsMini}</div>
          
          <div class="player-stat-cell dealt" title="가한 피해: ${(p.totalDamage || 0).toLocaleString()} (물리 ${(p.physicalDamage || 0).toLocaleString()} / 마법 ${(p.magicDamage || 0).toLocaleString()} / 고정 ${(p.trueDamage || 0).toLocaleString()})">
            <span class="stat-num">${(p.totalDamage || 0).toLocaleString()}</span>
            <div class="mini-bar-bg">
              <div class="mini-bar-multi" style="width:${p.damagePercent || 0}%;">
                <div class="mini-seg phys" style="width:${p.physicalDamagePercent || 0}%;"></div>
                <div class="mini-seg magic" style="width:${p.magicDamagePercent || 0}%;"></div>
                <div class="mini-seg true" style="width:${p.trueDamagePercent || 0}%;"></div>
              </div>
            </div>
          </div>

          <div class="player-stat-cell taken" title="받은 피해: ${(p.totalDamageTaken || 0).toLocaleString()}">
            <span class="stat-num">${(p.totalDamageTaken || 0).toLocaleString()}</span>
            <div class="mini-bar-bg">
              <div class="mini-bar-fill taken" style="width:${p.damageTakenPercent || 0}%;"></div>
            </div>
          </div>

          <div class="player-stat-cell heal" title="회복 및 보호막: ${(p.totalHeal || 0).toLocaleString()}">
            <span class="stat-num">${(p.totalHeal || 0).toLocaleString()}</span>
            <div class="mini-bar-bg">
              <div class="mini-bar-fill heal" style="width:${p.healPercent || 0}%;"></div>
            </div>
          </div>

          <div class="player-items-mini">${itemsMini}</div>
        </div>
      `;
    }).join('');

    return headerRow + rows;
  }

  // 매치 카드 클릭 시 10인 상세 서랍 지연 렌더링(Lazy Render) 후 토글
  window.toggleMatchDetail = function(gameId) {
    const card = document.getElementById(`match-${gameId}`);
    if (!card) return;

    const game = gameByIdMap.get(String(gameId));
    if (game && !game._detailRendered) {
      const drawer = document.getElementById(`detail-${gameId}`);
      if (drawer) {
        const team100Html = renderTeamDetailHtml(game.team100 || [], game.team100Win);
        const team200Html = renderTeamDetailHtml(game.team200 || [], game.team200Win);
        drawer.innerHTML = `
          <div class="detail-drawer-inner">
            <div class="detail-actions">
              <button class="btn-full-stats" data-game-id="${game.gameId}">📊 모든 스탯 자세히 보기</button>
            </div>
            <div class="detail-teams-container">
              <div class="team-block">
                <div class="team-header">
                  <span class="team-title team-blue-title">${game.team100Win ? '승리팀 (블루)' : '패배팀 (블루)'}</span>
                  <span>총 ${game.team100Kills || 0} 킬</span>
                </div>
                ${team100Html}
              </div>
              <div class="team-block">
                <div class="team-header">
                  <span class="team-title team-red-title">${game.team200Win ? '승리팀 (레드)' : '패배팀 (레드)'}</span>
                  <span>총 ${game.team200Kills || 0} 킬</span>
                </div>
                ${team200Html}
              </div>
            </div>
          </div>
        `;
        game._detailRendered = true;
      }
    }

    toggleCardExpanded(card);
  };

  // 펼치기/접기: 카드 폭은 즉시 최종값으로 바꾸고(상세 표 배치가 중간에 바뀌지 않도록),
  // 보이는 영역(clip-path)만 가운데에서 양옆으로 열리듯 애니메이션
  const EXPAND_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
  function toggleCardExpanded(card) {
    if (card._expandAnim) card._expandAnim.cancel();
    const canAnimate = typeof card.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!card.classList.contains('expanded')) {
      const before = card.getBoundingClientRect();
      card.classList.add('expanded');
      const after = card.getBoundingClientRect();
      const side = Math.max(0, (after.width - before.width) / 2);
      if (canAnimate) {
        card._expandAnim = card.animate([
          { clipPath: `inset(0 ${side}px ${after.height - before.height}px ${side}px round 16px)` },
          { clipPath: 'inset(0 0 0 0 round 16px)' }
        ], { duration: 340, easing: EXPAND_EASE });
      }
      return;
    }

    if (!canAnimate) {
      card.classList.remove('expanded');
      return;
    }
    const rect = card.getBoundingClientRect();
    const listWidth = card.parentElement.getBoundingClientRect().width;
    const summaryHeight = card.querySelector('.match-summary-row').getBoundingClientRect().height;
    const side = Math.max(0, (rect.width - listWidth) / 2);
    const anim = card.animate([
      { clipPath: 'inset(0 0 0 0 round 16px)' },
      { clipPath: `inset(0 ${side}px ${rect.height - summaryHeight}px ${side}px round 16px)` }
    ], { duration: 240, easing: EXPAND_EASE });
    card._expandAnim = anim;
    anim.onfinish = () => {
      card.classList.remove('expanded');
      card._expandAnim = null;
    };
  }

  // 상세 서랍에서 다른 소환사 닉네임 클릭 시 해당 소환사 전적 검색
  matchListContainer.addEventListener('click', (e) => {
    const nameEl = e.target.closest('.player-name-text.is-searchable');
    if (!nameEl) return;
    e.stopPropagation();
    const riotId = nameEl.getAttribute('data-riot-id');
    if (!riotId) return;
    summonerSearchInput.value = riotId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    searchSummoner(riotId);
  });

  // 8. 증강체 툴팁 이벤트 (단일 이벤트 위임으로 수천 개 개별 리스너 제거)
  let activeTooltipSlot = null;
  matchListContainer.addEventListener('mouseover', (e) => {
    const slot = e.target.closest('.augment-slot, .aug-mini-slot');
    if (!slot || slot === activeTooltipSlot) return;
    const name = slot.getAttribute('data-aug-name');
    if (!name) return;

    activeTooltipSlot = slot;
    const desc = decodeURIComponent(slot.getAttribute('data-aug-desc') || '');
    const rarity = slot.getAttribute('data-aug-rarity') || '실버';
    const icon = slot.getAttribute('data-aug-icon') || '';

    tooltipAugName.textContent = name;
    tooltipAugDesc.innerHTML = desc || '증강체 효과 설명이 없습니다.';
    const note = decodeURIComponent(slot.getAttribute('data-aug-note') || '');
    if (note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'tooltip-aug-note';
      noteEl.textContent = note;
      tooltipAugDesc.appendChild(noteEl);
    }
    tooltipAugRarity.textContent = rarity;
    tooltipAugRarity.className = `tooltip-rarity-badge badge-${slot.classList.contains('prismatic') ? 'prismatic' : (slot.classList.contains('gold') ? 'gold' : 'silver')}`;
    tooltipAugImg.src = icon;

    positionTooltip(e);
    globalAugmentTooltip.classList.remove('hidden');
  });

  matchListContainer.addEventListener('mousemove', (e) => {
    if (!activeTooltipSlot) return;
    positionTooltip(e);
  });

  matchListContainer.addEventListener('mouseout', (e) => {
    if (!activeTooltipSlot) return;
    const related = e.relatedTarget;
    if (related && activeTooltipSlot.contains(related)) return;
    activeTooltipSlot = null;
    globalAugmentTooltip.classList.add('hidden');
  });

  function positionTooltip(e) {
    const tooltipWidth = 320;
    const tooltipHeight = globalAugmentTooltip.offsetHeight || 150;
    let left = e.clientX + 16;
    let top = e.clientY + 16;

    if (left + tooltipWidth > window.innerWidth) left = e.clientX - tooltipWidth - 16;
    if (top + tooltipHeight > window.innerHeight) top = e.clientY - tooltipHeight - 16;

    globalAugmentTooltip.style.left = `${Math.max(10, left)}px`;
    globalAugmentTooltip.style.top = `${Math.max(10, top)}px`;
  }

  // 9. 증강체 도감 모달 (DOM 1회 캐싱 + 완성 글자 필터링)
  function openAugmentDex() {
    augmentDexModal.classList.remove('hidden');
    renderDexGrid('all', '');
  }

  function closeAugmentDex() {
    augmentDexModal.classList.add('hidden');
  }

  let dexEmptyEl = null;

  function ensureDexCardsBuilt() {
    if (dexCardsInitialized) return;
    const augList = Object.values(allAugmentsMap);
    if (augList.length === 0) return;

    dexGridContainer.innerHTML = '';
    const frag = document.createDocumentFragment();
    dexCardItems = augList.map(aug => {
      const card = document.createElement('div');
      card.className = `dex-card ${aug.rarityCode}`;
      card.innerHTML = `
        <img src="${aug.iconUrl}" alt="${escapeHtml(aug.name)}" class="dex-card-icon" loading="lazy" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'">
        <div class="dex-card-body">
          <div class="dex-card-title-row">
            <span class="dex-card-name">${escapeHtml(aug.name)}</span>
            <span class="dex-card-badge badge-${aug.rarityCode}">${aug.rarityLabel}</span>
          </div>
          <p class="dex-card-desc">${aug.styledDescription || aug.description || '효과 설명 없음'}</p>
        </div>
      `;
      frag.appendChild(card);
      return {
        el: card,
        rarity: aug.rarity,
        searchText: `${aug.name || ''} ${aug.description || ''}`.toLowerCase().replace(/\s+/g, '')
      };
    });

    dexEmptyEl = document.createElement('div');
    dexEmptyEl.className = 'hidden';
    dexEmptyEl.style.cssText = 'grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);';
    dexEmptyEl.textContent = '검색된 증강체가 없습니다.';
    frag.appendChild(dexEmptyEl);

    dexGridContainer.appendChild(frag);
    dexCardsInitialized = true;
  }

  function renderDexGrid(rarityFilter = 'all', searchQuery = '') {
    ensureDexCardsBuilt();
    const cleanQuery = getCompletedAugQuery(searchQuery);

    let visible = 0;
    dexCardItems.forEach(item => {
      const matchRarity = rarityFilter === 'all' || item.rarity === rarityFilter;
      const matchSearch = !cleanQuery || item.searchText.includes(cleanQuery);
      const show = matchRarity && matchSearch;
      item.el.classList.toggle('hidden', !show);
      if (show) visible++;
    });

    if (dexEmptyEl) {
      dexEmptyEl.classList.toggle('hidden', visible > 0);
    }
  }

  // 이벤트 리스너 등록
  btnSearch.addEventListener('click', () => {
    const q = summonerSearchInput.value.trim();
    if (q) searchSummoner(q);
  });

  summonerSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = summonerSearchInput.value.trim();
      if (q) searchSummoner(q);
    }
  });

  // 내 계정 전적 불러오기 (롤 클라이언트 로그인 계정)
  async function loadMyHistory() {
    showLoading(true);
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (!res.ok) {
        if (data.connected === false) {
          alert(data.error || '롤 클라이언트가 실행되어 있지 않습니다. 롤 클라이언트를 켠 후 다시 클릭해주세요.');
          if (data.summoner) {
            loadSummoner(data.summoner);
          }
          return;
        }
        throw new Error(data.error || '내 전적을 불러올 수 없습니다.');
      }

      summonerSearchInput.value = '';
      await loadSummoner(data.summoner);
    } catch (err) {
      alert(err.message);
    } finally {
      showLoading(false);
    }
  }

  btnMyHistory.addEventListener('click', loadMyHistory);

  if (btnReconnectLcu) {
    btnReconnectLcu.addEventListener('click', async () => {
      showLoading(true);
      try {
        await checkLcuStatus();
        if (isLcuConnected) {
          await loadMyHistory();
        } else {
          alert('아직 롤 클라이언트가 실행되지 않았습니다. 롤을 켠 후 다시 눌러주세요.');
        }
      } finally {
        showLoading(false);
      }
    });
  }

  // 북마크 모달 요소
  const btnBookmarkGuide = document.getElementById('btnBookmarkGuide');
  const bookmarkGuideModal = document.getElementById('bookmarkGuideModal');
  const btnCloseBookmarkModal = document.getElementById('btnCloseBookmarkModal');

  if (btnBookmarkGuide && bookmarkGuideModal) {
    btnBookmarkGuide.addEventListener('click', () => {
      bookmarkGuideModal.classList.remove('hidden');
    });
    if (btnCloseBookmarkModal) {
      btnCloseBookmarkModal.addEventListener('click', () => {
        bookmarkGuideModal.classList.add('hidden');
      });
    }
    bookmarkGuideModal.addEventListener('click', (e) => {
      if (e.target === bookmarkGuideModal) {
        bookmarkGuideModal.classList.add('hidden');
      }
    });
  }

  btnAugmentDex.addEventListener('click', openAugmentDex);
  btnCloseDexModal.addEventListener('click', closeAugmentDex);

  augmentDexModal.addEventListener('click', (e) => {
    if (e.target === augmentDexModal) closeAugmentDex();
  });

  dexSearchInput.addEventListener('input', (e) => {
    const activeRarity = document.querySelector('.dex-rarity-filters .filter-chip.active')?.getAttribute('data-rarity') || 'all';
    renderDexGrid(activeRarity, e.target.value.trim());
  });

  dexRarityChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dexRarityChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const rarity = chip.getAttribute('data-rarity');
      renderDexGrid(rarity, dexSearchInput.value.trim());
    });
  });

  // 챔피언 경기 실시간 검색 & 드롭다운 리스너
  if (matchChampionSearchInput) {
    matchChampionSearchInput.addEventListener('focus', () => {
      if (playedChampionsList.length > 0 && champSearchDropdown) {
        renderChampDropdown(matchChampionSearchInput.value.trim());
        champSearchDropdown.classList.remove('hidden');
      }
    });

    matchChampionSearchInput.addEventListener('input', () => {
      selectedExactChamp = '';
      if (champSearchDropdown) {
        renderChampDropdown(matchChampionSearchInput.value.trim());
        champSearchDropdown.classList.remove('hidden');
      }
      applyMatchFilters();
    });

    matchChampionSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && champSearchDropdown) {
        champSearchDropdown.classList.add('hidden');
      } else if (e.key === 'Enter' && champSearchDropdown) {
        champSearchDropdown.classList.add('hidden');
      }
    });
  }

  if (btnClearChampSearch) {
    btnClearChampSearch.addEventListener('click', () => {
      selectedExactChamp = '';
      if (matchChampionSearchInput) {
        matchChampionSearchInput.value = '';
      }
      if (champSearchDropdown) {
        champSearchDropdown.classList.add('hidden');
      }
      applyMatchFilters();
    });
  }

  if (filteredChampBadge) {
    filteredChampBadge.addEventListener('click', () => {
      selectedExactChamp = '';
      if (matchChampionSearchInput) {
        matchChampionSearchInput.value = '';
      }
      if (champSearchDropdown) {
        champSearchDropdown.classList.add('hidden');
      }
      applyMatchFilters();
    });
  }

  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('mousedown', (e) => {
    if (champSearchDropdown && toolbarChampSearchWrapper && !toolbarChampSearchWrapper.contains(e.target)) {
      champSearchDropdown.classList.add('hidden');
    }
  });

  // 증강체 경기 실시간 검색 리스너
  if (matchAugmentSearchInput) {
    matchAugmentSearchInput.addEventListener('input', () => {
      augSearchMineOnly = false;
      applyMatchFilters();
    });
  }
  if (btnClearAugSearch) {
    btnClearAugSearch.addEventListener('click', () => {
      if (matchAugmentSearchInput) {
        matchAugmentSearchInput.value = '';
        matchAugmentSearchInput.focus();
      }
      applyMatchFilters();
    });
  }

  if (btnClearAllRecent) {
    btnClearAllRecent.addEventListener('click', clearAllRecentSearches);
  }

  async function searchSummoner(query) {
    showLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '소환사를 찾을 수 없습니다.');
      loadSummoner(data.summoner);
    } catch (err) {
      alert(err.message);
    } finally {
      showLoading(false);
    }
  }

  function showLoading(isLoading) {
    if (isLoading) {
      loadingIndicator.classList.remove('hidden');
    } else {
      loadingIndicator.classList.add('hidden');
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 업데이트 확인 (새 릴리스가 있으면 버전 옆에 배지 표시)
  const appVersionEl = document.getElementById('appVersion');
  const updateBadge = document.getElementById('updateBadge');
  async function checkForUpdate(force = false) {
    try {
      const res = await fetch(`/api/update-check${force ? '?force=1' : ''}`);
      const info = await res.json();
      if (info.hasUpdate && info.url) {
        updateBadge.href = info.url;
        updateBadge.textContent = `새 버전 v${info.latest}`;
        updateBadge.title = `${info.title || ''} — 클릭하면 다운로드 페이지가 열립니다.`;
        updateBadge.classList.remove('hidden');
      } else {
        updateBadge.classList.add('hidden');
      }
      return info;
    } catch (e) {
      return null;
    }
  }
  if (appVersionEl) {
    let checking = false;
    appVersionEl.addEventListener('click', async () => {
      if (checking) return;
      checking = true;
      const label = appVersionEl.textContent;
      appVersionEl.textContent = '확인 중...';
      const info = await checkForUpdate(true);
      appVersionEl.textContent = !info || info.error ? '확인 실패' : (info.hasUpdate ? label : '최신 버전');
      setTimeout(() => { appVersionEl.textContent = label; checking = false; }, 2000);
    });
  }

  // ===== 통계 모달 (증강별 승률 / 함께한 소환사 / 패치별) =====
  const statsModal = document.getElementById('statsModal');
  const statsBody = document.getElementById('statsBody');
  const statsSubtitle = document.getElementById('statsSubtitle');
  let statsTab = 'augments';

  function winRateCell(wins, total) {
    const rate = total ? Math.round((wins / total) * 100) : 0;
    return `<span class="st-rate ${rate >= 50 ? 'good' : 'bad'}">${rate}%</span><span class="st-wl">${wins}승 ${total - wins}패</span>`;
  }

  function computeStats() {
    const games = currentGames.filter(g => !g.isGap && !g.isRemake && g.targetParticipant);
    const augs = new Map(), allies = new Map(), patches = new Map();
    for (const g of games) {
      const me = g.targetParticipant;
      for (const aug of me.augments || []) {
        const s = augs.get(aug.id) || { aug, picks: 0, wins: 0 };
        s.picks++;
        if (me.win) s.wins++;
        augs.set(aug.id, s);
      }
      for (const p of g.participants || []) {
        if (p.isTarget || p.teamId !== me.teamId || !p.puuid) continue;
        const s = allies.get(p.puuid) || { name: p.gameName || p.summonerName, tag: p.tagLine, games: 0, wins: 0, last: 0 };
        s.games++;
        if (me.win) s.wins++;
        s.last = Math.max(s.last, g.gameCreation || 0);
        allies.set(p.puuid, s);
      }
      const patch = patchOf(g.gameVersion) || '';
      const s = patches.get(patch) || { patch, games: 0, wins: 0 };
      s.games++;
      if (me.win) s.wins++;
      patches.set(patch, s);
    }
    return { total: games.length, augs, allies, patches };
  }

  function renderStats() {
    const { total, augs, allies, patches } = computeStats();
    statsSubtitle.textContent = `${currentSummoner?.gameName || ''} · 저장된 ${total}경기 기준 (다시하기 제외)`;
    document.querySelectorAll('.stats-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === statsTab));
    let rows = '';
    if (statsTab === 'augments') {
      const list = [...augs.values()].sort((x, y) => y.picks - x.picks || y.wins / y.picks - x.wins / x.picks);
      rows = `<div class="st-row st-head"><span>증강체</span><span>선택</span><span>승률</span></div>` + list.map(s => `
        <div class="st-row st-clickable" data-aug-name="${escapeHtml(s.aug.name)}" title="클릭하면 이 증강을 쓴 경기만 보기">
          <span class="st-name"><img src="${s.aug.iconUrl}" class="st-icon ${s.aug.rarityCode}" loading="lazy" alt="">${escapeHtml(s.aug.name)}</span>
          <span>${s.picks}회</span>
          <span>${winRateCell(s.wins, s.picks)}</span>
        </div>`).join('');
    } else if (statsTab === 'allies') {
      const list = [...allies.values()].filter(s => s.games >= 2).sort((x, y) => y.games - x.games || y.last - x.last);
      rows = `<div class="st-row st-head"><span>함께한 소환사 (같은 팀 2판 이상)</span><span>판수</span><span>함께할 때 승률</span></div>` + (list.length ? list.map(s => `
        <div class="st-row st-clickable" data-riot-id="${escapeHtml(s.tag ? `${s.name}#${s.tag}` : s.name)}" title="클릭하면 이 소환사 전적 검색">
          <span class="st-name">${escapeHtml(s.name)}<span class="st-tag">${s.tag ? '#' + escapeHtml(s.tag) : ''}</span></span>
          <span>${s.games}판</span>
          <span>${winRateCell(s.wins, s.games)}</span>
        </div>`).join('') : '<div class="st-empty">같은 팀으로 2판 이상 함께한 소환사가 없습니다.</div>');
    } else if (statsTab === 'unknown') {
      // 이름 데이터가 아직 없는 증강 (새 시즌 등) — 번호를 알려주면 data/overrides.json 에 등록
      const unknown = new Map();
      for (const g of currentGames) {
        if (g.isGap) continue;
        for (const p of g.participants || []) {
          for (const aug of p.augments || []) {
            if (!aug.name.startsWith('증강체 (#')) continue;
            const s = unknown.get(aug.id) || { id: aug.id, count: 0, last: 0, example: '' };
            s.count++;
            if ((g.gameCreation || 0) > s.last) {
              s.last = g.gameCreation || 0;
              s.example = `${formatDate(g.gameCreation)} · ${p.champion?.name || ''} (${p.gameName || p.summonerName || ''})`;
            }
            unknown.set(aug.id, s);
          }
        }
      }
      const list = [...unknown.values()].sort((x, y) => y.last - x.last);
      rows = `<div class="st-row st-head"><span>증강 번호 · 최근 등장 경기</span><span>등장</span><span></span></div>` + (list.length ? list.map(s => `
        <div class="st-row">
          <span class="st-name">#${s.id}<span class="st-tag">${escapeHtml(s.example)}</span></span>
          <span>${s.count}회</span>
          <span></span>
        </div>`).join('') : '<div class="st-empty">이 소환사의 기록에는 이름을 모르는 증강이 없습니다.</div>');
    } else {
      const list = [...patches.values()].sort((x, y) => {
        if (!x.patch) return 1;
        if (!y.patch) return -1;
        return y.patch.localeCompare(x.patch, undefined, { numeric: true });
      });
      rows = `<div class="st-row st-head"><span>패치</span><span>판수</span><span>승률</span></div>` + list.map(s => `
        <div class="st-row">
          <span class="st-name">${s.patch ? s.patch + ' 패치' : '패치 정보 수집 중'}</span>
          <span>${s.games}판</span>
          <span>${winRateCell(s.wins, s.games)}</span>
        </div>`).join('');
    }
    statsBody.innerHTML = rows;
  }

  document.getElementById('btnOpenStats')?.addEventListener('click', () => {
    if (!currentGames.length) return;
    renderStats();
    statsModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseStatsModal')?.addEventListener('click', () => statsModal.classList.add('hidden'));
  statsModal?.addEventListener('click', (e) => {
    if (e.target === statsModal) {
      statsModal.classList.add('hidden');
      return;
    }
    const tab = e.target.closest('.stats-tab');
    if (tab) {
      statsTab = tab.dataset.tab;
      renderStats();
      return;
    }
    const row = e.target.closest('.st-clickable');
    if (!row) return;
    statsModal.classList.add('hidden');
    if (row.dataset.augName) {
      matchAugmentSearchInput.value = row.dataset.augName;
      augSearchMineOnly = true;
      applyMatchFilters(true);
      matchListContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (row.dataset.riotId) {
      summonerSearchInput.value = row.dataset.riotId;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      searchSummoner(row.dataset.riotId);
    }
  });

  // ===== 경기 전체 스탯 창 =====
  // [분류, 롤 스탯 이름, 한글 이름, 표시 형식] — 목록에 없는 스탯도 '기타'에 원래 이름으로 모두 표시
  const STAT_LABELS = [
    ['전투', 'champLevel', '챔피언 레벨'],
    ['전투', 'kills', '처치'],
    ['전투', 'deaths', '사망'],
    ['전투', 'assists', '어시스트'],
    ['전투', 'largestKillingSpree', '최대 연속 처치'],
    ['전투', 'killingSprees', '연속 처치 횟수'],
    ['전투', 'largestMultiKill', '최다 멀티킬'],
    ['전투', 'doubleKills', '더블킬'],
    ['전투', 'tripleKills', '트리플킬'],
    ['전투', 'quadraKills', '쿼드라킬'],
    ['전투', 'pentaKills', '펜타킬'],
    ['전투', 'unrealKills', '언리얼킬'],
    ['전투', 'firstBloodKill', '선취점', 'bool'],
    ['전투', 'firstBloodAssist', '선취점 어시스트', 'bool'],
    ['가한 피해', 'totalDamageDealtToChampions', '챔피언에게 가한 피해'],
    ['가한 피해', 'physicalDamageDealtToChampions', '└ 물리'],
    ['가한 피해', 'magicDamageDealtToChampions', '└ 마법'],
    ['가한 피해', 'trueDamageDealtToChampions', '└ 고정'],
    ['가한 피해', 'totalDamageDealt', '전체 가한 피해 (미니언 포함)'],
    ['가한 피해', 'physicalDamageDealt', '└ 물리'],
    ['가한 피해', 'magicDamageDealt', '└ 마법'],
    ['가한 피해', 'trueDamageDealt', '└ 고정'],
    ['가한 피해', 'largestCriticalStrike', '최대 치명타'],
    ['가한 피해', 'damageDealtToObjectives', '오브젝트 피해'],
    ['가한 피해', 'damageDealtToTurrets', '포탑 피해'],
    ['받은 피해', 'totalDamageTaken', '받은 피해'],
    ['받은 피해', 'physicalDamageTaken', '└ 물리'],
    ['받은 피해', 'magicalDamageTaken', '└ 마법'],
    ['받은 피해', 'trueDamageTaken', '└ 고정'],
    ['받은 피해', 'damageSelfMitigated', '피해 감소량'],
    ['회복·보호', 'totalHeal', '총 회복량'],
    ['회복·보호', 'totalHealsOnTeammates', '아군 회복'],
    ['회복·보호', 'totalDamageShieldedOnTeammates', '아군 보호막'],
    ['회복·보호', 'totalUnitsHealed', '회복시킨 대상 수'],
    ['군중 제어', 'timeCCingOthers', 'CC 점수'],
    ['군중 제어', 'totalTimeCrowdControlDealt', '총 CC 시간', 'sec'],
    ['생존·성장', 'longestTimeSpentLiving', '최장 생존 시간', 'time'],
    ['생존·성장', 'totalTimeSpentDead', '사망 시간 합계', 'time'],
    ['생존·성장', 'goldEarned', '획득 골드'],
    ['생존·성장', 'goldSpent', '사용 골드'],
    ['생존·성장', 'totalMinionsKilled', '미니언 처치'],
    ['생존·성장', 'neutralMinionsKilled', '중립 몬스터 처치'],
    ['생존·성장', 'neutralMinionsKilledTeamJungle', '└ 아군 정글'],
    ['생존·성장', 'neutralMinionsKilledEnemyJungle', '└ 적 정글'],
    ['오브젝트', 'turretKills', '포탑 파괴'],
    ['오브젝트', 'inhibitorKills', '억제기 파괴'],
    ['오브젝트', 'firstTowerKill', '첫 포탑 파괴', 'bool'],
    ['오브젝트', 'firstTowerAssist', '첫 포탑 어시스트', 'bool'],
    ['오브젝트', 'firstInhibitorKill', '첫 억제기 파괴', 'bool'],
    ['오브젝트', 'firstInhibitorAssist', '첫 억제기 어시스트', 'bool'],
    ['시야', 'visionScore', '시야 점수'],
    ['시야', 'wardsPlaced', '와드 설치'],
    ['시야', 'wardsKilled', '와드 제거'],
    ['시야', 'sightWardsBoughtInGame', '와드 구매'],
    ['시야', 'visionWardsBoughtInGame', '제어 와드 구매'],
    ['경기 결과', 'win', '승리', 'bool'],
    ['경기 결과', 'gameEndedInSurrender', '항복으로 종료', 'bool'],
    ['경기 결과', 'gameEndedInEarlySurrender', '조기 항복', 'bool'],
    ['경기 결과', 'causedEarlySurrender', '조기 항복 유발', 'bool'],
    ['경기 결과', 'teamEarlySurrendered', '팀 조기 항복', 'bool'],
    ['경기 결과', 'earlySurrenderAccomplice', '조기 항복 동조', 'bool'],
    ['경기 결과', 'gameEndedInIGNBSurrender', '이탈자 발생 항복으로 종료', 'bool'],
    ['경기 결과', 'causedGameEndFromIGNBSurrender', '이탈로 항복 유발', 'bool'],
    ['경기 결과', 'wasSevereTransgressor', '심각한 비매너 제재', 'bool']
  ];
  const STAT_HIDE_HIGHLIGHT = new Set(['deaths', 'totalTimeSpentDead']);
  const fullStatsModal = document.getElementById('fullStatsModal');
  const fullStatsBody = document.getElementById('fullStatsBody');
  const fullStatsSubtitle = document.getElementById('fullStatsSubtitle');

  function formatStat(value, kind) {
    if (value === undefined || value === null) return '<span class="fs-na">-</span>';
    if (kind === 'bool' || typeof value === 'boolean') return value ? '<span class="fs-yes">✓</span>' : '<span class="fs-na">-</span>';
    if (kind === 'time') return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
    if (kind === 'sec') return `${Number(value).toLocaleString()}초`;
    return Number(value).toLocaleString();
  }

  // 롤이 꺼져 있을 때: 저장된 값(목록 화면 값 + 추가 스탯)으로 대신 표시
  function storedStatsFor(game) {
    return (game.participants || []).map(p => ({
      participantId: p.participantId,
      teamId: p.teamId,
      puuid: p.puuid,
      gameName: p.gameName || p.summonerName,
      tagLine: p.tagLine,
      championId: p.champion?.id,
      stats: {
        champLevel: p.champLevel, kills: p.kills, deaths: p.deaths, assists: p.assists, win: p.win,
        totalDamageDealtToChampions: p.totalDamage, physicalDamageDealtToChampions: p.physicalDamage,
        magicDamageDealtToChampions: p.magicDamage, trueDamageDealtToChampions: p.trueDamage,
        totalDamageTaken: p.totalDamageTaken, goldEarned: p.goldEarned, totalMinionsKilled: p.minionsKilled,
        ...(p.ext || {})
      }
    }));
  }

  function renderFullStats(game, players, offline) {
    const order = [...players].sort((x, y) => x.teamId - y.teamId || x.participantId - y.participantId);
    const champOf = (pl) => (game.participants || []).find(p => p.participantId === pl.participantId)?.champion;
    // 저장된 게임 종료 화면 값(아군 회복/보호막, 사망 시간)도 합침
    for (const pl of order) {
      const saved = (game.participants || []).find(p => p.participantId === pl.participantId);
      if (saved?.ext) for (const [k, v] of Object.entries(saved.ext)) if (pl.stats[k] === undefined) pl.stats[k] = v;
    }
    const known = new Set(STAT_LABELS.map(r => r[1]));
    const extraKeys = [...new Set(order.flatMap(pl => Object.keys(pl.stats)))].filter(k => !known.has(k)).sort();
    const rows = [...STAT_LABELS, ...extraKeys.map(k => ['기타 (원본 이름)', k, k])]
      .filter(([, key]) => order.some(pl => pl.stats[key] !== undefined));

    const head = `<tr><th class="fs-label"></th>${order.map(pl => {
      const ch = champOf(pl);
      return `<th class="fs-player team-${pl.teamId}${pl.puuid && pl.puuid === game.targetParticipant?.puuid ? ' is-target' : ''}" title="${escapeHtml(pl.gameName)}${pl.tagLine ? '#' + escapeHtml(pl.tagLine) : ''}">
        <img src="${ch?.squarePortraitPath || ''}" alt="">
        <span>${escapeHtml(pl.gameName || ch?.name || '')}</span>
      </th>`;
    }).join('')}</tr>`;

    let body = '';
    let currentGroup = '';
    for (const [group, key, label, kind] of rows) {
      if (group !== currentGroup) {
        currentGroup = group;
        body += `<tr class="fs-group"><td colspan="${order.length + 1}">${escapeHtml(group)}</td></tr>`;
      }
      const values = order.map(pl => pl.stats[key]);
      const nums = values.filter(v => typeof v === 'number');
      const max = nums.length ? Math.max(...nums) : null;
      const allSame = nums.length === order.length && nums.every(n => n === nums[0]); // 전원 같은 값이면 강조 안 함
      body += `<tr><td class="fs-label" title="${escapeHtml(key)}">${escapeHtml(label)}</td>${values.map((v, i) =>
        `<td class="team-${order[i].teamId}${!STAT_HIDE_HIGHLIGHT.has(key) && typeof v === 'number' && v > 0 && v === max && !allSame ? ' fs-max' : ''}">${formatStat(v, kind)}</td>`).join('')}</tr>`;
    }

    const minutes = Math.floor((game.gameDuration || 0) / 60);
    fullStatsSubtitle.textContent = `${formatDate(game.gameCreation)} · ${minutes}분 ${(game.gameDuration || 0) % 60}초${game.gameVersion ? ' · ' + game.gameVersion.split('.').slice(0, 2).join('.') + ' 패치' : ''}`;
    fullStatsBody.innerHTML = (offline ? `<div class="fs-notice">${escapeHtml(offline)}</div>` : '') +
      `<table class="fs-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  async function openFullStats(gameId) {
    const game = gameByIdMap.get(String(gameId));
    if (!game) return;
    fullStatsBody.innerHTML = '<div class="fs-loading">불러오는 중...</div>';
    fullStatsSubtitle.textContent = '';
    fullStatsModal.classList.remove('hidden');
    try {
      const res = await fetch(`/api/match/${gameId}/stats`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      renderFullStats(game, data.players, null);
    } catch (e) {
      renderFullStats(game, storedStatsFor(game), '롤 클라이언트에서 불러오지 못해 저장된 스탯만 표시합니다. (롤을 켜면 전체 스탯이 보입니다)');
    }
  }

  matchListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-full-stats');
    if (!btn) return;
    e.stopPropagation();
    openFullStats(btn.dataset.gameId);
  });
  document.getElementById('btnCloseFullStats')?.addEventListener('click', () => fullStatsModal.classList.add('hidden'));
  fullStatsModal?.addEventListener('click', (e) => {
    if (e.target === fullStatsModal) fullStatsModal.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !fullStatsModal.classList.contains('hidden')) fullStatsModal.classList.add('hidden');
  });

  // 실행 시작
  checkLcuStatus();
  checkForUpdate();
  loadAugmentsMeta();
  loadRecentSearches();
  setInterval(checkLcuStatus, 10000);
});
