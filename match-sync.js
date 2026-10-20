const lcu = require('./lcu-connector');
const meta = require('./meta-manager');
const historyStore = require('./history-store');

// 협곡 랭크/일반, 봇전, 연습 모드 등 증강이 없는 큐와 아레나는 상세 조회 생략
const NON_AUGMENT_QUEUES = [420, 440, 400, 430, 490, 830, 840, 850, 870, 880, 890, 3140];
const isSkippedQueue = g => NON_AUGMENT_QUEUES.includes(g.queueId) || meta.isArenaGame(g);

// 게임 종료 화면(EOG)에만 있는 값 → 경기 상세 ext 에 병합 (gameId → { puuid → 값 })
const EOG_EXTRA_KEYS = ['totalDamageShieldedOnTeammates', 'totalHealsOnTeammates', 'totalTimeSpentDead'];
const eogCache = new Map();

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

// 같은 소환사 기록 파일을 동시에 쓰지 않도록 소환사별 직렬화
const locks = new Map();
function withLock(puuid, fn) {
  const prev = locks.get(puuid) || Promise.resolve();
  const run = prev.then(fn);
  // 잠금 체인에는 실패를 삼킨 promise만 보관 (실패는 호출자가 run 으로 받음 → 처리 안 된 거부로 서버가 죽지 않도록)
  const settled = run.catch(() => {});
  locks.set(puuid, settled);
  settled.then(() => {
    if (locks.get(puuid) === settled) locks.delete(puuid);
  });
  return run;
}

function rememberEog(block) {
  if (!block?.gameId || !Array.isArray(block.teams)) return false;
  const byPuuid = {};
  for (const team of block.teams) {
    for (const player of team.players || []) {
      if (!player.puuid) continue;
      byPuuid[player.puuid] = Object.fromEntries(
        EOG_EXTRA_KEYS.map(k => [k, Number(player.stats?.[k]) || 0])
      );
    }
  }
  eogCache.set(String(block.gameId), byPuuid);
  while (eogCache.size > 20) eogCache.delete(eogCache.keys().next().value);
  return true;
}

function applyEog(game) {
  const eog = game && eogCache.get(String(game.gameId));
  if (!eog) return game;
  for (const p of game.participants || []) {
    if (eog[p.puuid]) p.ext = { ...(p.ext || {}), ...eog[p.puuid] };
  }
  return game;
}

async function fetchEnriched(gameId, puuid) {
  const detail = await lcu.getGameDetail(gameId);
  return applyEog(meta.enrichGameData(detail, puuid));
}

// LCU 최근 경기 목록을 받아 저장 기록과 병합 (새 경기 + 추가 스탯 없는 경기 보충)
function syncMatches(puuid) {
  return withLock(puuid, async () => {
    const historyRes = await lcu.getMatchList(puuid, 0, 40);
    const rawGames = historyRes?.games?.games || [];
    const windowOldestTime = rawGames.length ? Math.min(...rawGames.map(g => g.gameCreation || Infinity)) : null;
    const candidateGames = rawGames.filter(g => !isSkippedQueue(g));

    const existing = historyStore.getHistory(puuid);
    const prevIds = new Set(existing.games.filter(g => !g.isGap).map(g => String(g.gameId)));
    const completeIds = new Set(existing.games
      .filter(g => !g.isGap && g.participants?.[0]?.ext &&
        !(eogCache.has(String(g.gameId)) && g.participants[0].ext.totalHealsOnTeammates === undefined))
      .map(g => String(g.gameId)));
    const toFetch = candidateGames.filter(g => !completeIds.has(String(g.gameId)));

    let failed = 0;
    const enriched = await mapLimit(toFetch, 6, async (g) => {
      try {
        return await fetchEnriched(g.gameId, puuid);
      } catch (e) {
        failed++;
        return null;
      }
    });
    const newGames = enriched.filter(Boolean);
    const newCount = newGames.filter(g => !prevIds.has(String(g.gameId))).length;

    // 상세 조회 실패 경기가 있으면 공백 판정을 보수적으로 (다음 조회 때 다시 시도됨)
    const record = historyStore.saveHistory(puuid, null, newGames, failed ? null : windowOldestTime);
    const liveIds = new Set(candidateGames.map(g => String(g.gameId)));
    const liveCount = record.games.filter(g => !g.isGap && liveIds.has(String(g.gameId))).length;
    return { record, newCount, liveCount };
  });
}

// LCU 목록 밖의 오래된 저장 경기도 gameId로 상세 조회가 가능 → 추가 스탯/패치 버전 보충
// (실패한 경기는 extUnavailable 로 표시해 매번 재시도하지 않음)
async function backfillHistory(puuid, { onProgress } = {}) {
  const pending = historyStore.getHistory(puuid).games
    .filter(g => !g.isGap && !g.participants?.[0]?.ext && !g.extUnavailable)
    .map(g => g.gameId);
  if (pending.length === 0) return 0;

  let done = 0;
  const CHUNK = 40;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    const replacements = new Map();
    await mapLimit(chunk, 4, async (gameId) => {
      try {
        const game = await fetchEnriched(gameId, puuid);
        if (game) replacements.set(String(gameId), game);
      } catch (e) {
        if (!/timeout|ECONN|not running/i.test(e.message)) {
          replacements.set(String(gameId), { extUnavailable: true });
        }
      }
    });
    await withLock(puuid, async () => historyStore.patchGames(puuid, replacements));
    done += chunk.length;
    if (onProgress) onProgress(done, pending.length);
  }
  return pending.length;
}

module.exports = { syncMatches, backfillHistory, rememberEog, mapLimit };
