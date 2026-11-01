const os = require('os');
const path = require('path');
process.env.MAYHEM_DATA_DIR = path.join(os.tmpdir(), 'mayhem-gg-sanitize');
const test = require('node:test');
const assert = require('node:assert');
const { sanitizeDescriptionHtml: clean, safeIconUrl } = require('../meta-manager');

test('설명 HTML은 툴팁용 태그만 남김', () => {
  assert.strictEqual(clean('<span class="stat-ad">공격력</span><br><b>x</b>'), '<span class="stat-ad">공격력</span><br><b>x</b>');
  assert.strictEqual(clean('<span style="color:#f87171;">a</span>'), '<span style="color:#f87171;">a</span>');
  assert.strictEqual(clean('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(clean('<span onclick="x()">a</span>'), '&lt;span onclick="x()"&gt;a</span>');
  assert.strictEqual(clean('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(clean(clean('<i>a</i> <x>')), '<i>a</i> &lt;x&gt;');
});

test('아이콘은 CommunityDragon / Data Dragon 주소만 허용', () => {
  const ok = 'https://raw.communitydragon.org/latest/a/b.png';
  assert.strictEqual(safeIconUrl(ok), ok);
  assert.strictEqual(safeIconUrl('https://ddragon.leagueoflegends.com/cdn/x.png'), 'https://ddragon.leagueoflegends.com/cdn/x.png');
  assert.strictEqual(safeIconUrl('javascript:alert(1)', 'F'), 'F');
  assert.strictEqual(safeIconUrl('https://raw.communitydragon.org/a.png" onerror="x', 'F'), 'F');
  assert.strictEqual(safeIconUrl('https://evil.example/a.png', 'F'), 'F');
});
