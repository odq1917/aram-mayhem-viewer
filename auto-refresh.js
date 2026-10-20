const fs = require('fs');
const lcu = require('./lcu-connector');
const historyStore = require('./history-store');
const { syncMatches, backfillHistory, rememberEog } = require('./match-sync');
const { WATCHLIST_FILE } = require('./data-dir');

const POLL_MS = 10 * 1000;
const IN_GAME_PHASES = new Set(['InProgress', 'WaitingForStats', 'PreEndOfGame', 'Reconnect']);
// 경기 직후엔 LCU 전적에 아직 반영되지 않을 수 있어 몇 번 다시 시도
const GAME_END_RETRY_DELAYS = [3 * 1000, 60 * 1000, 3 * 60 * 1000];

const WATCHLIST_TEMPLATE = [
  '# MAYHEM.GG 자동 갱신 목록',
  '# 여기에 적은 소환사는 전적 검색기를 켤 때와 게임이 끝날 때마다 함께 갱신됩니다.',
  '# (롤 클라이언트는 최근 약 40경기만 보여주므로, 자주 보는 친구를 적어 두면 오래된 경기도 계속 쌓입니다)',
  '# 한 줄에 한 명씩 "닉네임#태그" 형식으로 적어 주세요. # 으로 시작하는 줄은 무시됩니다.',
  '#',
  '# 예) 하하 죽어라#KR1',
  ''
].join('\r\n');

class AutoRefresher {
  constructor() {
    this.prevPhase = null;
    this.startupDone = false;
    this.running = null;
    this.puuidCache = new Map(); // Riot ID(소문자) → puuid
    this.state = {
      lastRunAt: 0,
      reason: null,
      updated: {},       // puuid → 새로 추가된 경기 수
      backfill: { running: false, done: 0, total: 0, finishedAt: 0, updated: [] }
    };
    this.retryTimers = [];
  }

  // ---------- 자동 갱신 목록 파일 ----------
  ensureWatchlistFile() {
    if (!fs.existsSync(WATCHLIST_FILE)) fs.writeFileSync(WATCHLIST_FILE, WATCHLIST_TEMPLATE, 'utf8');
  }

  readWatchlist() {
    this.ensureWatchlistFile();
    return fs.readFileSync(WATCHLIST_FILE, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('#'));
  }

  setWatched(riotId, watched) {
    this.ensureWatchlistFile();
    const norm = s => s.toLowerCase().replace(/\s+/g, '');
    const lines = fs.readFileSync(WATCHLIST_FILE, 'utf8').split(/\r?\n/);
    const kept = lines.filter(line => line.trim().startsWith('#') || norm(line) !== norm(riotId));
    while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
    if (watched) kept.push(riotId);
    fs.writeFileSync(WATCHLIST_FILE, kept.join('\r\n') + '\r\n', 'utf8');
    return this.readWatchlist();
  }

  isWatched(riotId) {
    const norm = s => s.toLowerCase().replace(/\s+/g, '');
    return this.readWatchlist().some(line => norm(line) === norm(riotId));
  }

  async resolvePuuid(riotId) {
    const key = riotId.toLowerCase().replace(/\s+/g, '');
    if (this.puuidCache.has(key)) return this.puuidCache.get(key);
    const summoner = await lcu.searchSummoner(riotId);
    this.puuidCache.set(key, summoner.puuid);
    return summoner.puuid;
  }

  // ---------- 갱신 실행 ----------
  // 내 계정 + 자동 갱신 목록을 순서대로 갱신 (동시에 하나만 실행)
  refreshAll(reason) {
    if (this.running) return this.running;
    this.running = (async () => {
      const updated = {};
      const targets = [];
      try {
        const me = await lcu.getCurrentSummoner();
        if (me?.puuid) targets.push(me.puuid);
      } catch (e) {}
      for (const riotId of this.readWatchlist()) {
        try {
          targets.push(await this.resolvePuuid(riotId));
        } catch (e) {
          console.warn(`[AutoRefresh] '${riotId}' 소환사를 찾지 못했습니다.`);
        }
      }
      for (const puuid of [...new Set(targets)]) {
        try {
          const { newCount } = await syncMatches(puuid);
          updated[puuid] = newCount;
        } catch (e) {
          console.warn(`[AutoRefresh] ${puuid} 갱신 실패:`, e.message);
        }
      }
      this.state.lastRunAt = Date.now();
      this.state.reason = reason;
      this.state.updated = updated;
      const total = Object.values(updated).reduce((a, b) => a + b, 0);
      console.log(`[AutoRefresh] ${reason}: ${Object.keys(updated).length}명 갱신, 새 경기 ${total}개`);
      return updated;
    })().finally(() => { this.running = null; });
    return this.running;
  }

  // 저장된 모든 소환사의 오래된 경기에 추가 스탯 보충 (한 번만, 백그라운드)
  async runBackfill() {
    const bf = this.state.backfill;
    if (bf.running) return;
    bf.running = true;
    try {
      for (const puuid of historyStore.listSavedPuuids()) {
        const count = await backfillHistory(puuid, {
          onProgress: (done, total) => { bf.done = done; bf.total = total; }
        });
        if (count > 0) {
          bf.updated.push(puuid);
          console.log(`[Backfill] ${puuid} 경기 ${count}개 추가 스탯 보충`);
        }
      }
    } catch (e) {
      console.warn('[Backfill] 중단:', e.message);
    } finally {
      bf.running = false;
      bf.finishedAt = Date.now();
    }
  }

  async onGameEnded() {
    try {
      rememberEog(await lcu.getEndOfGameStats());
    } catch (e) {}
    this.retryTimers.forEach(clearTimeout);
    this.retryTimers = [];
    let found = false;
    for (const delay of GAME_END_RETRY_DELAYS) {
      this.retryTimers.push(setTimeout(async () => {
        if (found) return;
        const updated = await this.refreshAll('game-end');
        if (Object.values(updated).some(n => n > 0)) found = true;
      }, delay));
    }
  }

  async tick() {
    let phase = null;
    try {
      if (!(await lcu.getAuth())) {
        this.prevPhase = null;
        return;
      }
      phase = await lcu.getGameflowPhase();
    } catch (e) {
      return;
    }

    if (!this.startupDone) {
      this.startupDone = true;
      await this.refreshAll('startup');
      this.runBackfill();
    }

    const wasInGame = IN_GAME_PHASES.has(this.prevPhase);
    if (phase === 'EndOfGame' && this.prevPhase !== 'EndOfGame' && this.prevPhase !== null) {
      this.onGameEnded();
    } else if (wasInGame && !IN_GAME_PHASES.has(phase) && phase !== 'EndOfGame') {
      // 종료 화면을 건너뛴 경우 (바로 로비로 이동 등)
      this.onGameEnded();
    }
    this.prevPhase = phase;
  }

  start() {
    this.ensureWatchlistFile();
    const loop = async () => {
      await this.tick();
      setTimeout(loop, POLL_MS).unref();
    };
    loop();
  }
}

module.exports = new AutoRefresher();
