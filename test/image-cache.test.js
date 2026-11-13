const test = require('node:test');
const assert = require('node:assert');
const { rewriteJson, validPath } = require('../image-cache');

test('validPath: 이미지 확장자·안전한 경로만 허용', () => {
  assert.ok(validPath('latest/plugins/a/b.png'));
  assert.ok(validPath('cdn/14.24.1/img/item/1001.png'));
  assert.ok(!validPath('latest/../secret.png'));
  assert.ok(!validPath('latest//a.png'));
  assert.ok(!validPath('latest/a.json'));
  assert.ok(!validPath('latest/a b.png'));
});

test('rewriteJson: JSON 안 CDN 이미지 주소만 로컬 경로로', () => {
  const src = JSON.stringify({
    a: 'https://raw.communitydragon.org/latest/plugins/x/y.png',
    b: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/1001.png',
    c: 'https://raw.communitydragon.org/latest/plugins/x/y.json',
    d: 'https://example.com/x.png'
  });
  const out = JSON.parse(rewriteJson(src));
  assert.strictEqual(out.a, '/img/cd/latest/plugins/x/y.png');
  assert.strictEqual(out.b, '/img/dd/cdn/14.24.1/img/item/1001.png');
  assert.strictEqual(out.c, 'https://raw.communitydragon.org/latest/plugins/x/y.json');
  assert.strictEqual(out.d, 'https://example.com/x.png');
});
