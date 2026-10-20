// 테스트가 실제 사용자 데이터 폴더를 건드리지 않도록 임시 폴더 사용
process.env.MAYHEM_DATA_DIR = require('path').join(require('os').tmpdir(), 'mayhem-gg-test');
const test = require('node:test');
const assert = require('node:assert');
const { compareVersions } = require('../update-checker');

test('버전 비교', () => {
  assert.ok(compareVersions('1.2.0', '1.1.0') > 0);
  assert.ok(compareVersions('v1.10.0', '1.9.9') > 0);
  assert.ok(compareVersions('1.1.0', '1.1.1') < 0);
  assert.equal(compareVersions('v1.1.0', '1.1.0'), 0);
  assert.equal(compareVersions('1.1', '1.1.0'), 0);
  assert.ok(compareVersions('2.0.0-beta', '1.9.0') > 0);
});
