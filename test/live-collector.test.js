const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
process.env.MAYHEM_DATA_DIR = process.env.MAYHEM_DATA_DIR || path.join(os.tmpdir(), 'mayhem-live-test');
const collector = require('../live-collector');

const frame = (t, level, abil, itemsA, itemsB) => ({
  gameData: { gameTime: t, gameMode: 'CLASSIC', mapNumber: 11 },
  activePlayer: {
    riotIdGameName: '나', riotIdTagLine: 'KR1', level,
    abilities: { Q: { abilityLevel: abil[0] }, W: { abilityLevel: abil[1] }, E: { abilityLevel: abil[2] }, R: { abilityLevel: abil[3] } },
    fullRunes: { keystone: { id: 8229 }, primaryRuneTree: { id: 8200 }, secondaryRuneTree: { id: 8100 }, generalRunes: [{ id: 8229 }, { id: 8226 }], statRunes: [{ id: 5008 }, { id: 5008 }, { id: 5011 }] }
  },
  allPlayers: [
    { riotIdGameName: '나', riotIdTagLine: 'KR1', rawChampionName: 'game_character_displayname_Lux', team: 'ORDER', items: itemsA },
    { riotIdGameName: '상대', riotIdTagLine: 'KR1', rawChampionName: 'game_character_displayname_Ahri', team: 'CHAOS', items: itemsB }
  ]
});

test('정밀 기록: 스킬 순서·아이템 구매 시점·룬 파편', () => {
  collector.startGame('123', frame(5, 1, [1, 0, 0, 0], [], []));
  collector.update(frame(5, 1, [1, 0, 0, 0], [{ itemID: 1056, count: 1 }, { itemID: 2003, count: 2 }], [{ itemID: 1055, count: 1 }]));
  collector.update(frame(70, 2, [1, 0, 1, 0], [{ itemID: 1056, count: 1 }, { itemID: 2003, count: 1 }], [{ itemID: 1055, count: 1 }]));
  collector.update(frame(400, 6, [3, 1, 1, 1], [{ itemID: 3802, count: 1 }], [{ itemID: 1055, count: 1 }, { itemID: 1036, count: 1 }]));
  const rec = collector.record;
  assert.deepEqual(rec.skillOrder.map(s => s.slot), ['Q', 'E', 'Q', 'Q', 'W', 'R']);
  assert.deepEqual(rec.runes.statPerks, [5008, 5008, 5011]);
  const me = rec.players['나#kr1'];
  assert.equal(me.champion, 'Lux');
  assert.deepEqual(me.items.map(i => [i.id, i.t]), [[1056, 5], [2003, 5], [2003, 5], [3802, 400]]);
  assert.deepEqual(rec.players['상대#kr1'].items.map(i => [i.id, i.t]), [[1055, 5], [1036, 400]]);
  collector.record = null;
});
