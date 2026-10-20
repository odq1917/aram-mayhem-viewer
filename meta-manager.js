const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./data-dir');

// 배열 데이터를 id 기준으로 합침 (뒤쪽이 우선)
function mergeById(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) if (entry && entry.id !== undefined) map.set(entry.id, entry);
  }
  return map.size ? [...map.values()] : null;
}

// 경기 상세에 함께 저장하는 추가 스탯 (LCU stats 필드명 그대로)
const EXTRA_STAT_KEYS = [
  'damageSelfMitigated',        // 피해 감소량
  'timeCCingOthers',            // CC 점수(초)
  'totalTimeCrowdControlDealt', // 총 CC 시간
  'totalDamageDealt',           // 챔피언 외 포함 총 피해
  'damageDealtToTurrets',       // 포탑 피해
  'physicalDamageTaken',
  'magicalDamageTaken',
  'trueDamageTaken',
  'totalUnitsHealed',
  'largestCriticalStrike',
  'largestMultiKill',
  'largestKillingSpree',
  'doubleKills',
  'tripleKills',
  'quadraKills',
  'pentaKills',
  'longestTimeSpentLiving',
  'goldSpent',
  'firstBloodKill',
  'firstBloodAssist'
];

// 아레나(사투의 전장)는 이 전적 검색기에서 다루지 않음 (증강 규칙이 달라 통계를 흐림)
function isArenaGame(game) {
  if (!game) return false;
  return game.isArena === true ||
    game.gameMode === 'CHERRY' ||
    game.mapId === 30 ||
    (game.queueId >= 1700 && game.queueId < 1800) ||
    (typeof game.subType === 'string' && game.subType.toUpperCase().includes('CHERRY')) ||
    (typeof game.gameModeName === 'string' && game.gameModeName.includes('아레나'));
}

const RARITY_LABELS = { kSilver: '실버', kGold: '골드', kPrismatic: '프리즘' };
const RARITY_CODES = { kSilver: 'silver', kGold: 'gold', kPrismatic: 'prismatic' };
const DEFAULT_AUG_ICON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg';
const CACHE_REFRESH_MS = 12 * 60 * 60 * 1000; // 게임 데이터(증강·아이템 등) 12시간마다 다시 받기

class MetaManager {
  constructor() {
    this.cacheDir = path.join(__dirname, 'cache');
    this.augments = {};
    this.champions = {};
    this.items = {};
    this.spells = {};
    this.perks = {};
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    await Promise.all([
      this.loadAugments(),
      this.loadChampions(),
      this.loadItems(),
      this.loadSpells(),
      this.loadPerks()
    ]);

    this.initialized = true;
    console.log(`[MetaManager] 메타데이터 초기화 완료! (증강체 ${Object.keys(this.augments).length}개 로드됨)`);
  }

  // 배포본에 들어 있는 기본 데이터(cache/) + 사용자 데이터 폴더의 갱신본(cache/)을 id 기준으로 합쳐서 사용
  // - 최신 데이터에서 빠진 예전 증강/아이템도 지난 경기 표시를 위해 계속 보관
  // - 갱신본이 없거나 12시간 넘게 지났으면 백그라운드로 다시 받아 합친 뒤 onUpdate 로 반영
  async fetchWithCache(filename, url, onUpdate) {
    const readJson = p => {
      try {
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
      } catch (e) {
        return null;
      }
    };
    const userCacheDir = path.join(DATA_DIR, 'cache');
    const userPath = path.join(userCacheDir, filename);
    const merged = mergeById(readJson(path.join(this.cacheDir, filename)), readJson(userPath));

    const stale = !fs.existsSync(userPath) || Date.now() - fs.statSync(userPath).mtimeMs > CACHE_REFRESH_MS;
    if (stale || !merged) {
      const refresh = (async () => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const fresh = mergeById(merged, await res.json());
          fs.mkdirSync(userCacheDir, { recursive: true });
          fs.writeFileSync(userPath, JSON.stringify(fresh), 'utf8');
          return fresh;
        } catch (err) {
          console.warn(`[MetaManager] ${filename} 갱신 실패 (${err.message}) → 기존 데이터 사용`);
          return null;
        }
      })();
      if (!merged) return await refresh; // 처음 실행이고 기본 데이터도 없으면 기다림
      refresh.then(fresh => {
        if (fresh && onUpdate) {
          onUpdate(fresh);
          console.log(`[MetaManager] ${filename} 최신 데이터 반영`);
        }
      });
    }
    return merged;
  }

  // 1. 증강체 목록 로드 (CommunityDragon + 나무위키 아수라장 효과 사전 결합)
  async loadAugments() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/cherry-augments.json';
    this.buildAugments(await this.fetchWithCache('cherry-augments.json', url, fresh => this.buildAugments(fresh)));
  }

  buildAugments(list) {

    // 나무위키 아수라장 전용 효과 사전 로드
    let dict = {};
    const dictPath = path.join(__dirname, 'data', 'augments_dict.json');
    if (fs.existsSync(dictPath)) {
      try {
        dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
      } catch (e) {}
    }

    // 이름 -> CDragon 아이콘 경로 맵 빌드
    const nameToIcon = {};
    if (Array.isArray(list)) {
      list.forEach(aug => {
        let iconUrl = '';
        if (aug.augmentSmallIconPath) {
          const cleanPath = aug.augmentSmallIconPath
            .toLowerCase()
            .replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        const n = (aug.nameTRA || aug.augmentNameId || '').trim();
        if (n && iconUrl) {
          nameToIcon[n] = iconUrl;
          nameToIcon[n.replace(/\s+/g, '')] = iconUrl;
        }

        // 인게임 ID 조회를 위해 this.augments에도 기본 매핑
        const dictItem = dict[n] || dict[n.replace(/\s+/g, '')];
        const rarity = dictItem?.rarity || aug.rarity || 'kSilver';
        let rarityLabel = '실버';
        let rarityCode = 'silver';
        if (rarity === 'kGold') {
          rarityLabel = '골드';
          rarityCode = 'gold';
        } else if (rarity === 'kPrismatic') {
          rarityLabel = '프리즘';
          rarityCode = 'prismatic';
        }

        const rawDesc = (dictItem?.rawDescription || aug.descTRA || aug.tooltipTRA || '효과 설명이 등록되지 않았습니다.').replace(/\[\d+\]/g, '').trim();
        const styledDesc = (dictItem?.styledDescription || rawDesc).replace(/\[\d+\]/g, '').trim();

        this.augments[aug.id] = {
          id: aug.id,
          name: n,
          description: rawDesc,
          styledDescription: styledDesc,
          rarity,
          rarityLabel,
          rarityCode,
          iconUrl: iconUrl || 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'
        };
      });
    }

    // 도감 전용 순수 아수라장 증강체 딕셔너리 생성 (나무위키 사전에 있는 것만 등록)
    this.dexAugments = {};
    for (const [name, dictItem] of Object.entries(dict)) {
      const rarity = dictItem.rarity || 'kSilver';
      let rarityLabel = '실버';
      let rarityCode = 'silver';
      if (rarity === 'kGold') {
        rarityLabel = '골드';
        rarityCode = 'gold';
      } else if (rarity === 'kPrismatic') {
        rarityLabel = '프리즘';
        rarityCode = 'prismatic';
      }

      const iconUrl = nameToIcon[name] || nameToIcon[name.replace(/\s+/g, '')] || 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg';

      this.dexAugments[name] = {
        name,
        description: (dictItem.rawDescription || '').replace(/\[\d+\]/g, '').trim(),
        styledDescription: (dictItem.styledDescription || '').replace(/\[\d+\]/g, '').trim(),
        rarity,
        rarityLabel,
        rarityCode,
        iconUrl
      };
    }

    // data/overrides.json 에 직접 등록한 증강 (새 시즌 미등록 증강, 등급/아이콘 정정 등)
    for (const [id, o] of Object.entries(this.loadOverrides().augments || {})) {
      const base = this.augments[id] || {};
      const rarity = o.rarity || base.rarity || 'kSilver';
      const desc = (o.description || base.description || '효과 설명이 등록되지 않았습니다.').replace(/\[\d+\]/g, '').trim();
      const merged = {
        id: Number(id),
        name: o.name || base.name || `증강체 (#${id})`,
        description: desc,
        styledDescription: o.styledDescription || (o.description ? desc.replace(/\n/g, '<br>') : base.styledDescription) || desc,
        rarity,
        rarityLabel: RARITY_LABELS[rarity] || '실버',
        rarityCode: RARITY_CODES[rarity] || 'silver',
        iconUrl: o.iconUrl || base.iconUrl || DEFAULT_AUG_ICON
      };
      this.augments[id] = merged;
      this.dexAugments[merged.name] = merged;
    }
  }

  // 2. 챔피언 목록 로드
  async loadChampions() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/champion-summary.json';
    this.buildChampions(await this.fetchWithCache('champion-summary.json', url, fresh => this.buildChampions(fresh)));
  }

  buildChampions(list) {
    if (Array.isArray(list)) {
      list.forEach(champ => {
        if (champ.id === -1) return;
        const iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champ.id}.png`;
        this.champions[champ.id] = {
          id: champ.id,
          name: champ.name,
          alias: champ.alias,
          squarePortraitPath: iconUrl
        };
      });
    }
  }

  // 3. 아이템 목록 로드
  async loadItems() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/items.json';
    this.buildItems(await this.fetchWithCache('items.json', url, fresh => this.buildItems(fresh)));
  }

  buildItems(list) {
    if (Array.isArray(list)) {
      list.forEach(item => {
        let iconUrl = '';
        if (item.iconPath) {
          const cleanPath = item.iconPath.toLowerCase().replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        this.items[item.id] = {
          id: item.id,
          name: item.name,
          description: item.description,
          iconUrl: iconUrl || `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${item.id}.png`
        };
      });
    }

    // data/overrides.json 에 직접 등록한 아이템
    for (const [id, o] of Object.entries(this.loadOverrides().items || {})) {
      const base = this.items[id] || {};
      this.items[id] = { ...base, id: Number(id), ...o };
    }
  }

  // 4. 소환사 주문 로드
  async loadSpells() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/summoner-spells.json';
    this.buildSpells(await this.fetchWithCache('summoner-spells.json', url, fresh => this.buildSpells(fresh)));
  }

  buildSpells(list) {
    if (Array.isArray(list)) {
      list.forEach(spell => {
        let iconUrl = '';
        if (spell.iconPath) {
          const cleanPath = spell.iconPath.toLowerCase().replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        this.spells[spell.id] = {
          id: spell.id,
          name: spell.name,
          description: spell.description,
          iconUrl
        };
      });
    }
  }

  // 5. 룬 로드
  async loadPerks() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/perks.json';
    this.buildPerks(await this.fetchWithCache('perks.json', url, fresh => this.buildPerks(fresh)));
  }

  buildPerks(list) {
    if (Array.isArray(list)) {
      list.forEach(perk => {
        let iconUrl = '';
        if (perk.iconPath) {
          const cleanPath = perk.iconPath.toLowerCase().replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        this.perks[perk.id] = {
          id: perk.id,
          name: perk.name,
          iconUrl
        };
      });
    }
  }

  loadOverrides() {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'overrides.json'), 'utf8'));
    } catch (e) {
      return {};
    }
  }

  // 증강체 정보 조회
  getAugment(id) {
    if (!id || id <= 0) return null;
    return this.augments[id] || {
      id,
      name: `증강체 (#${id})`,
      description: '알 수 없는 증강체',
      styledDescription: '알 수 없는 증강체',
      rarity: 'kSilver',
      rarityLabel: '실버',
      rarityCode: 'silver',
      iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'
    };
  }

  // 챔피언 정보 조회
  getChampion(id) {
    return this.champions[id] || {
      id,
      name: `챔피언 #${id}`,
      alias: 'Unknown',
      squarePortraitPath: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`
    };
  }

  // 아이템 정보 조회
  getItem(id) {
    if (!id || id <= 0) return null;
    return this.items[id] || {
      id,
      name: `아이템 #${id}`,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${id}.png`
    };
  }

  // 스펠 정보 조회
  getSpell(id) {
    return this.spells[id] || {
      id,
      name: `스펠 #${id}`,
      iconUrl: ''
    };
  }

  // 저장/전송용 경량 포맷: 챔피언·아이템·스펠·증강체는 ID만 남기고 팀 중복 배열 제거
  // (풍부화된 게임/이미 압축된 게임 모두 입력 가능 → 기존 저장 파일 자동 마이그레이션)
  compactGame(game) {
    if (!game || game.isGap) return game;
    const { team100, team200, targetParticipant, participants = [], ...rest } = game;
    return {
      ...rest,
      participants: participants.map(p => {
        const { champion, spells, items, augments, ...pRest } = p;
        return {
          ...pRest,
          championId: pRest.championId ?? champion?.id ?? 0,
          spellIds: pRest.spellIds || (spells || []).map(s => s?.id || 0),
          itemIds: pRest.itemIds || (items || []).map(it => it?.id || 0),
          augmentIds: pRest.augmentIds || (augments || []).map(a => a?.id).filter(Boolean)
        };
      })
    };
  }

  // 게임 목록에 등장하는 메타데이터만 추려서 반환 (클라이언트가 ID → 객체로 복원)
  buildMetaFor(games) {
    const out = { champions: {}, items: {}, spells: {}, augments: {} };
    for (const g of games) {
      if (!g || g.isGap) continue;
      for (const p of g.participants || []) {
        if (!out.champions[p.championId]) out.champions[p.championId] = this.getChampion(p.championId);
        for (const id of p.spellIds || []) {
          if (id && !out.spells[id]) {
            const { id: sid, name, iconUrl } = this.getSpell(id);
            out.spells[id] = { id: sid, name, iconUrl };
          }
        }
        for (const id of p.itemIds || []) {
          if (id > 0 && !out.items[id]) {
            const { id: iid, name, iconUrl } = this.getItem(id);
            out.items[id] = { id: iid, name, iconUrl };
          }
        }
        for (const id of p.augmentIds || []) {
          if (id > 0 && !out.augments[id]) out.augments[id] = this.getAugment(id);
        }
      }
    }
    return out;
  }

  // 게임 상세 데이터 풍부화(Enrichment)
  enrichGameData(game, targetPuuid = null) {
    if (!game || isArenaGame(game)) return null;

    // 솔랭(420), 자랭(440), 일반(400, 430), 봇전(830-850) 등은 명확히 제외
    const standardExcludes = [420, 440, 400, 430, 830, 840, 850, 490];
    if (standardExcludes.includes(game.queueId)) {
      return null;
    }

    // 참가자 ID 매핑
    const participantIdentities = game.participantIdentities || [];
    const idToSummoner = {};
    participantIdentities.forEach(pi => {
      idToSummoner[pi.participantId] = {
        summonerName: pi.player?.summonerName || pi.player?.gameName || '소환사',
        gameName: pi.player?.gameName || '',
        tagLine: pi.player?.tagLine || '',
        puuid: pi.player?.puuid || '',
        profileIcon: pi.player?.profileIcon || 0
      };
    });

    let maxDamage = 0;
    let maxDamageTaken = 0;
    let maxHeal = 0;
    let targetParticipant = null;

    // 참가자 정보 가공
    const participants = (game.participants || []).map(p => {
      const stats = p.stats || {};
      const summoner = idToSummoner[p.participantId] || {};
      const champ = this.getChampion(p.championId);

      // 증강체 추출 (playerAugment1~6 또는 stats.playerAugment 배열)
      const augmentIds = [];
      for (let i = 1; i <= 6; i++) {
        const augId = stats[`playerAugment${i}`] || (stats.playerAugments && stats.playerAugments[i - 1]);
        if (augId && augId > 0) {
          augmentIds.push(augId);
        }
      }
      const augments = augmentIds.map(id => this.getAugment(id)).filter(Boolean);

      // 아이템 추출 (item0 ~ item6)
      const items = [];
      for (let i = 0; i <= 6; i++) {
        const itemId = stats[`item${i}`];
        items.push(this.getItem(itemId));
      }

      // 스펠 추출
      const spell1 = this.getSpell(p.spell1Id);
      const spell2 = this.getSpell(p.spell2Id);

      const totalDamage = stats.totalDamageDealtToChampions || 0;
      const physicalDamage = stats.physicalDamageDealtToChampions || 0;
      const magicDamage = stats.magicDamageDealtToChampions || 0;
      const trueDamage = stats.trueDamageDealtToChampions || 0;
      const totalDamageTaken = stats.totalDamageTaken || 0;
      const totalHeal = (stats.totalHeal || 0) + (stats.totalDamageShieldedOnTeammates || 0);

      // 물리/마법/고정 비율 계산
      const physicalDamagePercent = totalDamage > 0 ? Math.round((physicalDamage / totalDamage) * 100) : 0;
      const magicDamagePercent = totalDamage > 0 ? Math.round((magicDamage / totalDamage) * 100) : 0;
      const trueDamagePercent = totalDamage > 0 ? Math.max(0, 100 - physicalDamagePercent - magicDamagePercent) : 0;

      if (totalDamage > maxDamage) maxDamage = totalDamage;
      if (totalDamageTaken > maxDamageTaken) maxDamageTaken = totalDamageTaken;
      if (totalHeal > maxHeal) maxHeal = totalHeal;

      const participantData = {
        participantId: p.participantId,
        teamId: p.teamId,
        summonerName: summoner.summonerName,
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        puuid: summoner.puuid,
        champion: champ,
        champLevel: stats.champLevel || 1,
        win: stats.win === true || stats.win === 1,
        kills: stats.kills || 0,
        deaths: stats.deaths || 0,
        assists: stats.assists || 0,
        kda: stats.deaths === 0 ? ((stats.kills + stats.assists)).toFixed(2) : ((stats.kills + stats.assists) / stats.deaths).toFixed(2),
        totalDamage,
        physicalDamage,
        magicDamage,
        trueDamage,
        physicalDamagePercent,
        magicDamagePercent,
        trueDamagePercent,
        totalDamageTaken,
        totalHeal,
        goldEarned: stats.goldEarned || 0,
        minionsKilled: (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0),
        spells: [spell1, spell2],
        items,
        augments,
        augmentIds,
        isLeaver: Boolean(stats.leaver || stats.causedEarlySurrender),
        causedEarlySurrender: Boolean(stats.causedEarlySurrender),
        earlySurrender: Boolean(stats.earlySurrender || stats.gameEndedInEarlySurrender),
        isTarget: targetPuuid ? summoner.puuid === targetPuuid : false,
        // 추가 스탯 (LCU는 최근 약 40경기만 제공하므로 지금부터 모아 둠)
        ext: Object.fromEntries(EXTRA_STAT_KEYS.map(k => [k, Number(stats[k]) || 0]))
      };

      if (participantData.isTarget) {
        targetParticipant = participantData;
      }

      return participantData;
    });

    // 다시하기(Remake) 여부 판별 (5분 미만 조기 종료 또는 earlySurrender 플래그 감지)
    const isRemake = Boolean(
      game.gameEndedInEarlySurrender === true ||
      participants.some(p => p.causedEarlySurrender || p.earlySurrender) ||
      (game.gameDuration > 0 && game.gameDuration < 240)
    );

    if (targetParticipant) {
      targetParticipant.isRemake = isRemake;
    }

    // 딜량/받은피해/회복 비율 및 1위 표시
    participants.forEach(p => {
      p.isRemake = isRemake;
      p.damagePercent = maxDamage > 0 ? Math.round((p.totalDamage / maxDamage) * 100) : 0;
      p.damageTakenPercent = maxDamageTaken > 0 ? Math.round((p.totalDamageTaken / maxDamageTaken) * 100) : 0;
      p.healPercent = maxHeal > 0 ? Math.round((p.totalHeal / maxHeal) * 100) : 0;
      p.isHighestDamage = p.totalDamage === maxDamage && maxDamage > 0;
    });

    // 팀 분리 (100: 블루팀, 200: 레드팀)
    const team100 = participants.filter(p => p.teamId === 100);
    const team200 = participants.filter(p => p.teamId === 200);

    // 팀 총 킬수 계산 (킬관여율 계산용)
    const team100Kills = team100.reduce((sum, p) => sum + p.kills, 0);
    const team200Kills = team200.reduce((sum, p) => sum + p.kills, 0);

    participants.forEach(p => {
      const teamKills = p.teamId === 100 ? team100Kills : team200Kills;
      p.killParticipation = teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
    });

    // [중요] 증강체 모드(아수라장) 유효성 검증
    // 1. 전체 참가자의 증강체 획득 총합 계산
    const totalAugmentsCount = participants.reduce((sum, p) => sum + (p.augments?.length || 0), 0);

    // 2. 공식 아수라장 큐(2400, 2450)가 아니면서 증강체가 0개인 판은 배제
    const isOfficialAugmentQueue = [2400, 2450].includes(game.queueId);
    if (totalAugmentsCount === 0 && !isOfficialAugmentQueue) {
      return null;
    }

    // 3. 사용자 지정 게임(CUSTOM_GAME)인데 증강체가 0개이거나 맵이 칼바람(12)이 아니면 배제
    if (game.gameType === 'CUSTOM_GAME' && (totalAugmentsCount === 0 || game.mapId !== 12)) {
      return null;
    }

    // 모드 판별 (아수라장 클래식 vs 아수라장)
    // 아수라장 클래식 판별 (KIWI_JADE / 큐 2450 / CLASSIC)
    const isMayhemClassic = (
      game.isMayhemClassic === true ||
      game.gameMode === 'KIWI_JADE' ||
      game.queueId === 2450 ||
      game.gameType === 'CLASSIC' || 
      game.gameMode === 'CLASSIC' || 
      (game.subType && typeof game.subType === 'string' && game.subType.toUpperCase().includes('CLASSIC')) ||
      (game.gameModeName && typeof game.gameModeName === 'string' && game.gameModeName.includes('클래식'))
    );

    const modeName = isMayhemClassic ? '아수라장 클래식' : '아수라장';

    return {
      gameId: game.gameId,
      gameCreation: game.gameCreation,
      gameDuration: game.gameDuration,
      gameVersion: game.gameVersion,
      gameMode: game.gameMode,
      gameType: game.gameType,
      queueId: game.queueId,
      isAramMayhem: true,
      isMayhemClassic,
      isRemake,
      modeName,
      mapId: game.mapId,
      targetParticipant,
      participants,
      team100,
      team200,
      team100Win: team100.length > 0 && team100[0].win,
      team200Win: team200.length > 0 && team200[0].win,
      team100Kills,
      team200Kills
    };
  }
}

module.exports = new MetaManager();
module.exports.isArenaGame = isArenaGame;
