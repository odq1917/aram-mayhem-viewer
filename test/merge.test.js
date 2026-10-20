// 테스트가 실제 사용자 데이터 폴더를 건드리지 않도록 임시 폴더 사용
process.env.MAYHEM_DATA_DIR = require('path').join(require('os').tmpdir(), 'mayhem-gg-test');
const test = require('node:test');
const assert = require('node:assert');
const historyStore = require('../history-store');
const meta = require('../meta-manager');

const G = (id, t) => ({ gameId: id, gameCreation: t, participants: [] });
const shape = list => list
  .map(x => (x.isGap ? `|gap(${x.olderGameTime}-${x.newerGameTime})|` : x.gameId))
  .join(' ');
const merge = (...args) => shape(historyStore.mergeGames(...args));

test('첫 조회는 실시간 경기만', () => {
  assert.equal(merge([G(3, 300), G(2, 200)], [], 100), '3 2');
});

test('겹치는 구간이 있으면 공백 없이 이어붙임', () => {
  assert.equal(merge([G(4, 400), G(3, 300)], [G(3, 300), G(2, 200)], 250), '4 3 2');
});

test('LCU 목록이 저장 기록보다 전부 최신이면 공백 추가', () => {
  assert.equal(merge([G(9, 900), G(8, 800)], [G(3, 300), G(2, 200)], 700), '9 8 |gap(300-800)| 3 2');
});

test('기존 공백은 이후 병합에서도 유지', () => {
  const saved = historyStore.mergeGames([G(9, 900), G(8, 800)], [G(3, 300), G(2, 200)], 700);
  assert.equal(merge([G(10, 1000), G(9, 900)], saved, 850), '10 9 8 |gap(300-800)| 3 2');
});

test('최근 목록에 증강 경기가 없어도 공백은 맨 위에 기록되고 이후 중복되지 않음', () => {
  const first = historyStore.mergeGames([], [G(3, 300)], 500);
  assert.equal(shape(first), '|gap(300-500)| 3');
  assert.equal(merge([G(7, 700)], first, 600), '7 |gap(300-500)| 3');
});

test('LCU 목록이 공백 구간을 덮으면 공백 제거', () => {
  const cached = [G(7, 700), { isGap: true, olderGameTime: 300, newerGameTime: 700 }, G(3, 300)];
  assert.equal(merge([G(7, 700), G(5, 500)], cached, 250), '7 5 3');
});

test('상세 조회 실패 시(windowOldestTime 없음) 새 공백을 만들지 않음', () => {
  assert.equal(merge([G(9, 900)], [G(3, 300)], null), '9 3');
});

test('사이에 끼는 경기도 시간순 정렬', () => {
  assert.equal(merge([G(5, 500)], [G(6, 600), G(4, 400)], 350), '6 5 4');
});

test('compactGame: 풍부화 포맷을 ID 포맷으로 변환하고 재변환해도 동일', () => {
  const enriched = {
    gameId: 1,
    team100: [{}],
    team200: [{}],
    targetParticipant: {},
    participants: [{
      teamId: 100,
      champion: { id: 22, name: '애쉬' },
      spells: [{ id: 4 }, { id: 32 }],
      items: [{ id: 3031 }, null],
      augments: [{ id: 1005 }],
      augmentIds: [1005]
    }]
  };
  const compact = meta.compactGame(enriched);
  assert.equal(compact.team100, undefined);
  assert.equal(compact.targetParticipant, undefined);
  assert.deepEqual(compact.participants[0], {
    teamId: 100, championId: 22, spellIds: [4, 32], itemIds: [3031, 0], augmentIds: [1005]
  });
  assert.deepEqual(meta.compactGame(compact), compact);
});
