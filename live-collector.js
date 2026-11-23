const fs = require('fs');
const path = require('path');
const https = require('https');
const lcu = require('./lcu-connector');
const { DATA_DIR } = require('./data-dir');

// 게임 중 정밀 기록 수집기
// - 게임이 진행 중일 때 롤 게임 클라이언트의 공식 로컬 API(https://127.0.0.1:2999/liveclientdata)를 몇 초마다 읽음
// - 경기 기록(LCU)에 없는 정보만 따로 저장: 아이템 구매 시점(10명), 내 스킬 찍은 순서, 내 룬 파편
// - DATA_DIR/live/<gameId>.json 에 저장 → 경기 상세의 '빌드'·'룬' 탭에서 사용
// - 게임 파일을 읽거나 고치지 않고, 라이엇이 제공하는 로컬 API만 읽음

const LIVE_DIR = path.join(DATA_DIR, 'live');
const IDLE_POLL_MS = 5000;   // 게임 중인지 확인 주기
const OFFLINE_POLL_MS = 15000; // 롤 클라이언트가 꺼져 있을 때 확인 주기
const GAME_POLL_MS = 2000;   // 게임 중 데이터 수집 주기
const SAVE_EVERY_MS = 10000; // 게임 중 중간 저장 주기
const SLOTS = ['Q', 'W', 'E', 'R'];
const agent = new https.Agent({ rejectUnauthorized: false }); // 게임 클라이언트 자체 인증서 (127.0.0.1 전용)

function fetchLiveData() {
  return new Promise((resolve, reject) => {
    const req = https.get({
      host: '127.0.0.1',
      port: 2999,
      path: '/liveclientdata/allgamedata',
      agent,
      timeout: 1500
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const normKey = s => String(s || '').toLowerCase().replace(/\s+/g, '');
const riotIdOf = p => (p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagLine || ''}` : (p.riotId || p.summonerName || ''));
// "game_character_displayname_Lux" → "Lux" (챔피언 alias 와 비교용)
const aliasOf = p => String(p.rawChampionName || '').replace(/^game_character_displayname_/i, '');

function liveFile(gameId) {
  return path.join(LIVE_DIR, `${String(gameId).replace(/\D/g, '')}.json`);
}

function readLive(gameId) {
  if (!/^\d{1,20}$/.test(String(gameId))) return null;
  try {
    return JSON.parse(fs.readFileSync(liveFile(gameId), 'utf8'));
  } catch (e) {
    return null;
  }
}

function listLiveIds() {
  try {
    return fs.readdirSync(LIVE_DIR).filter(f => /^\d+\.json$/.test(f)).map(f => f.slice(0, -5));
  } catch (e) {
    return [];
  }
}

class LiveCollector {
  constructor() {
    this.record = null;      // 현재 게임 기록
    this.itemCounts = {};    // riotId → { itemId: 개수 }
    this.abilityLevels = null;
    this.lastSaveAt = 0;
    this.dirty = false;
    this.status = { collecting: false, gameId: null, lastPollAt: 0, savedGames: 0 };
  }

  startGame(gameId, data) {
    const me = data.activePlayer || {};
    const gameTime = Number(data.gameData?.gameTime) || 0;
    this.record = {
      version: 1,
      gameId: String(gameId),
      collectedAt: Date.now(),
      firstGameTime: Math.round(gameTime),
      partial: gameTime > 90, // 게임 시작 후 한참 지나 수집을 시작한 경우
      gameMode: data.gameData?.gameMode || '',
      mapNumber: data.gameData?.mapNumber || 0,
      me: { riotId: riotIdOf(me), key: normKey(riotIdOf(me)) },
      runes: null,
      skillOrder: [],
      players: {}
    };
    this.itemCounts = {};
    this.abilityLevels = null;
    this.status.collecting = true;
    this.status.gameId = String(gameId);
  }

  update(data) {
    const rec = this.record;
    const t = Math.round(Number(data.gameData?.gameTime) || 0);
    const me = data.activePlayer || {};

    // 내 룬 (룬 파편 포함)
    const fr = me.fullRunes;
    if (fr && !rec.runes) {
      rec.runes = {
        keystone: fr.keystone?.id || 0,
        primaryStyle: fr.primaryRuneTree?.id || 0,
        subStyle: fr.secondaryRuneTree?.id || 0,
        perkIds: (fr.generalRunes || []).map(r => r.id).filter(Boolean),
        statPerks: (fr.statRunes || []).map(r => r.id).filter(Boolean)
      };
      this.dirty = true;
    }

    // 내 스킬 찍은 순서 (스킬 레벨이 오를 때마다 기록)
    const ab = me.abilities || {};
    const levels = Object.fromEntries(SLOTS.map(k => [k, Number(ab[k]?.abilityLevel) || 0]));
    if (this.abilityLevels) {
      for (const k of SLOTS) {
        for (let n = this.abilityLevels[k]; n < levels[k]; n++) {
          rec.skillOrder.push({ slot: k, champLevel: Number(me.level) || 0, t });
          this.dirty = true;
        }
      }
    } else if (!rec.partial) {
      // 처음 본 시점에 이미 찍혀 있는 스킬 (게임 시작 직후)
      for (const k of SLOTS) {
        for (let n = 0; n < levels[k]; n++) rec.skillOrder.push({ slot: k, champLevel: Number(me.level) || 1, t });
      }
      if (SLOTS.some(k => levels[k] > 0)) this.dirty = true;
    }
    this.abilityLevels = levels;

    // 10명 아이템: 새로 생긴 아이템(개수 증가)을 구매 시점으로 기록
    for (const p of data.allPlayers || []) {
      const riotId = riotIdOf(p);
      const key = normKey(riotId);
      if (!key) continue;
      if (!rec.players[key]) {
        rec.players[key] = { riotId, champion: aliasOf(p), team: p.team || '', items: [] };
        this.dirty = true;
      }
      const counts = {};
      for (const it of p.items || []) {
        const id = Number(it.itemID) || 0;
        if (id > 0) counts[id] = (counts[id] || 0) + Math.max(1, Number(it.count) || 1);
      }
      const prev = this.itemCounts[key];
      for (const [id, n] of Object.entries(counts)) {
        const added = n - (prev ? (prev[id] || 0) : 0);
        for (let i = 0; i < added; i++) {
          rec.players[key].items.push({ id: Number(id), t: prev ? t : rec.firstGameTime });
          this.dirty = true;
        }
      }
      this.itemCounts[key] = counts;
    }
    rec.lastGameTime = t;
    this.status.lastPollAt = Date.now();
  }

  save(force = false) {
    if (!this.record || (!this.dirty && !force)) return;
    if (!force && Date.now() - this.lastSaveAt < SAVE_EVERY_MS) return;
    try {
      fs.mkdirSync(LIVE_DIR, { recursive: true });
      const file = liveFile(this.record.gameId);
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.record), 'utf8');
      fs.renameSync(tmp, file);
      this.lastSaveAt = Date.now();
      this.dirty = false;
    } catch (e) {
      console.warn('[LiveCollector] 저장 실패:', e.message);
    }
  }

  endGame() {
    if (!this.record) return;
    this.save(true);
    console.log(`[LiveCollector] 게임 ${this.record.gameId} 정밀 기록 저장 (스킬 ${this.record.skillOrder.length}회, 플레이어 ${Object.keys(this.record.players).length}명)`);
    this.status.savedGames++;
    this.record = null;
    this.status.collecting = false;
    this.status.gameId = null;
  }

  async tick() {
    let phase = null;
    try {
      if (!(await lcu.getAuth())) {
        if (this.record) this.endGame();
        return OFFLINE_POLL_MS;
      }
      phase = await lcu.getGameflowPhase();
    } catch (e) {
      if (this.record) this.endGame();
      return IDLE_POLL_MS;
    }

    if (phase !== 'InProgress') {
      if (this.record) this.endGame();
      return IDLE_POLL_MS;
    }

    let data;
    try {
      data = await fetchLiveData();
    } catch (e) {
      return GAME_POLL_MS; // 로딩 화면 등 아직 게임 API가 열리지 않음
    }
    if (!data?.activePlayer || !data?.gameData) return GAME_POLL_MS;

    if (!this.record) {
      let gameId = null;
      try {
        gameId = (await lcu.getGameflowSession())?.gameData?.gameId;
      } catch (e) {}
      if (!gameId) return GAME_POLL_MS;
      this.startGame(gameId, data);
    }
    this.update(data);
    this.save();
    return GAME_POLL_MS;
  }

  start() {
    const loop = async () => {
      let delay = IDLE_POLL_MS;
      try {
        delay = await this.tick();
      } catch (e) {
        console.warn('[LiveCollector] 오류:', e.message);
      }
      setTimeout(loop, delay).unref();
    };
    loop();
  }
}

const collector = new LiveCollector();
module.exports = collector;
module.exports.readLive = readLive;
module.exports.listLiveIds = listLiveIds;
module.exports.LIVE_DIR = LIVE_DIR;
