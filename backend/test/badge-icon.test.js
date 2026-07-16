const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  BADGE_ICON_DATA_PREFIX,
  convertRasterToBadgeIcon,
  isSafeBadgeIcon,
  isSafeGeneratedBadgeIcon,
} = require('../dist/admin/badge-icon-converter');

function asDataUrl(svg) {
  return `${BADGE_ICON_DATA_PREFIX}${Buffer.from(svg, 'utf8').toString('base64')}`;
}

test('el catálogo admite solo las claves SVG conocidas', () => {
  assert.equal(isSafeBadgeIcon('rocket'), true);
  assert.equal(isSafeBadgeIcon('check-circle'), true);
  assert.equal(isSafeBadgeIcon('javascript:alert(1)'), false);
  assert.equal(isSafeBadgeIcon('https://example.com/icon.svg'), false);
});

test('el conversor raster genera únicamente rutas SVG de gramática cerrada', async () => {
  const source = await sharp({
    create: { width: 96, height: 64, channels: 4, background: { r: 12, g: 68, b: 124, alpha: 0.8 } },
  }).png().toBuffer();

  const converted = await convertRasterToBadgeIcon(source, 'image/png');
  assert.equal(converted.width, 48);
  assert.equal(converted.height, 48);
  assert.equal(converted.sourceWidth, 96);
  assert.equal(converted.sourceHeight, 64);
  assert.equal(isSafeGeneratedBadgeIcon(converted.icon), true);

  const svg = Buffer.from(converted.icon.slice(BADGE_ICON_DATA_PREFIX.length), 'base64').toString('utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<path /);
  assert.doesNotMatch(svg, /script|foreignObject|href|onload/i);
});

test('el validador rechaza SVG alterado aunque tenga el prefijo generado', () => {
  const malicious = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" data-isi-badge="1"><script>alert(1)</script></svg>';
  const external = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" data-isi-badge="1"><image href="https://example.com/a.png"/></svg>';
  const outOfBounds = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" data-isi-badge="1"><path fill="#000000" d="M23 0h24v1H23z"/></svg>';
  assert.equal(isSafeGeneratedBadgeIcon(asDataUrl(malicious)), false);
  assert.equal(isSafeGeneratedBadgeIcon(asDataUrl(external)), false);
  assert.equal(isSafeGeneratedBadgeIcon(asDataUrl(outOfBounds)), false);
});

test('el conversor valida firma, MIME y dimensiones antes de vectorizar', async () => {
  await assert.rejects(
    convertRasterToBadgeIcon(Buffer.from('<svg><script/></svg>'), 'image/png'),
    /no coincide/,
  );

  const oversized = await sharp({
    create: { width: 1_025, height: 1, channels: 3, background: '#0C447C' },
  }).png().toBuffer();
  await assert.rejects(convertRasterToBadgeIcon(oversized, 'image/png'), /supera 1024 px/);
});
