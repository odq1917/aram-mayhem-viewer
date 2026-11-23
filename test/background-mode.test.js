const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 실제 시작 프로그램 폴더 대신 임시 폴더에서만 확인
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mayhem-bg-'));
process.env.APPDATA = tmp;
process.env.MAYHEM_DATA_DIR = path.join(tmp, 'data');
const bg = require('../background-mode');

test('백그라운드 수집: 켜면 시작 스크립트 생성, 끄면 삭제', { skip: process.platform !== 'win32' }, () => {
  const appDir = path.join(tmp, '한글 폴더', 'app');
  let st = bg.setEnabled(true, appDir);
  assert.equal(st.enabled, true);
  assert.equal(st.registered, true);
  const file = path.join(tmp, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', bg.STARTUP_NAME);
  const buf = fs.readFileSync(file);
  assert.deepEqual([...buf.slice(0, 2)], [0xFF, 0xFE]);
  const text = buf.slice(2).toString('utf16le');
  assert.ok(text.includes(path.join(appDir, 'launcher.vbs')));
  st = bg.setEnabled(false, appDir);
  assert.equal(st.enabled, false);
  assert.equal(fs.existsSync(file), false);
});
