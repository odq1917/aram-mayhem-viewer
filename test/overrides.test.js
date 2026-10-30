const fs = require('fs');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mayhem-gg-overrides-'));
process.env.MAYHEM_DATA_DIR = root;
const test = require('node:test');
const assert = require('node:assert');
const meta = require('../meta-manager');

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'overrides.json'), 'utf8'));
const remotePath = path.join(root, 'cache', 'overrides.json');
const writeRemote = o => {
  fs.mkdirSync(path.dirname(remotePath), { recursive: true });
  fs.writeFileSync(remotePath, JSON.stringify(o));
};

test('받은 최신본이 없거나 깨졌으면 배포본 사용', () => {
  assert.strictEqual(meta.loadOverrides()._revision, shipped._revision);
  fs.mkdirSync(path.dirname(remotePath), { recursive: true });
  fs.writeFileSync(remotePath, '{ broken');
  assert.strictEqual(meta.loadOverrides()._revision, shipped._revision);
});

test('리비전이 같거나 높으면 받은 최신본, 낮으면 배포본 사용', () => {
  writeRemote({ _revision: shipped._revision, augments: { 1: { name: '같음' } } });
  assert.strictEqual(meta.loadOverrides().augments[1].name, '같음');
  writeRemote({ _revision: shipped._revision - 1, augments: { 1: { name: '예전' } } });
  assert.strictEqual(meta.loadOverrides()._revision, shipped._revision);
  fs.rmSync(remotePath);
});

test('설명 HTML은 툴팁용 태그만 남김', () => {
  const clean = meta.sanitizeDescriptionHtml;
  assert.strictEqual(clean('<span class="stat-ad">공격력</span><br><b>x</b>'), '<span class="stat-ad">공격력</span><br><b>x</b>');
  assert.strictEqual(clean('<span style="color:#f87171;">a</span>'), '<span style="color:#f87171;">a</span>');
  assert.strictEqual(clean('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(clean('<span onclick="x()">a</span>'), '&lt;span onclick="x()"&gt;a</span>');
  assert.strictEqual(clean('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});
