const fs = require('fs');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mayhem-gg-datadir-'));
process.env.MAYHEM_DATA_DIR = path.join(root, 'userdata');
const test = require('node:test');
const assert = require('node:assert');
const { migrateLegacyData, backupDaily, DATA_DIR, HISTORY_DIR, RECENT_SEARCHES_FILE } = require('../data-dir');

const games = n => JSON.stringify({ games: Array.from({ length: n }, (_, i) => ({ gameId: i })) });

test('구버전 프로그램 폴더 기록을 사용자 데이터 폴더로 이전', () => {
  const app = path.join(root, 'app');
  fs.mkdirSync(path.join(app, 'data', 'history'), { recursive: true });
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(app, 'data', 'history', 'a.json'), games(5));
  fs.writeFileSync(path.join(app, 'data', 'history', 'b.json'), games(2));
  fs.writeFileSync(path.join(HISTORY_DIR, 'b.json'), games(9)); // 이미 더 많은 기록이 있으면 유지
  fs.writeFileSync(path.join(app, 'data', 'recent_searches.json'), JSON.stringify([{ puuid: 'x', searchedAt: 1 }]));

  const result = migrateLegacyData(app);

  assert.equal(result.movedFiles, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, 'a.json'))).games.length, 5);
  assert.equal(JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, 'b.json'))).games.length, 9);
  assert.ok(!fs.existsSync(path.join(app, 'data', 'history')), '원래 폴더는 이름이 바뀌어 백업으로 남음');
  assert.ok(fs.readdirSync(path.join(app, 'data')).some(f => f.startsWith('history_moved_')));
  assert.equal(JSON.parse(fs.readFileSync(RECENT_SEARCHES_FILE))[0].puuid, 'x');

  // 두 번째 실행은 아무 것도 하지 않음
  assert.deepEqual(migrateLegacyData(app), { movedFiles: 0, mergedSearches: 0 });
});

test('하루 한 번 전적 백업, 최근 3일치만 보관', () => {
  const root = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  for (const d of ['2000-01-01', '2000-01-02', '2000-01-03']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const dest = backupDaily(3);
  assert.ok(dest && fs.existsSync(path.join(dest, 'history', 'a.json')), '오늘자 백업에 기록 포함');
  assert.equal(backupDaily(3), null, '같은 날 두 번째는 건너뜀');
  assert.deepEqual(fs.readdirSync(root).sort().slice(0, 2), ['2000-01-02', '2000-01-03']);
  assert.equal(fs.readdirSync(root).length, 3);
});
