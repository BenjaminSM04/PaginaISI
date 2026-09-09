// Integration of the REAL production Next server with a deliberately simulated API.
// This checks transport, not PostgreSQL data or real account authentication.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const fs = require('node:fs');
let backend, web, origin, output = '';
const calls = [];
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };

before(async () => {
  backend = http.createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    calls.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(body).toString() });
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/auth/')) res.setHeader('set-cookie', ['isi_refresh=fixture; Path=/api/auth; HttpOnly; SameSite=Lax', 'second=fixture; Path=/']);
    if (req.url === '/api/institution/public') res.end(JSON.stringify({ institutionName: 'Universidad Privada del Valle', shortName: 'Univalle', careerName: 'Ingeniería de Sistemas', institutionalLogoUrl: '/branding/univalle-logo.png', theme: { light: { primary: '#663399' } } }));
    else res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  const apiPort = await listen(backend);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  // The destination changes on every run, proving it was not frozen in the build.
  web = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  web.stdout.on('data', chunk => { output += chunk; }); web.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 150; i++) {
    if (web.exitCode !== null) throw new Error(output);
    try { if ((await fetch(origin + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Next did not start: ' + output);
}, { timeout: 40000 });

after(async () => {
  if (web && web.exitCode === null) { web.kill(); await once(web, 'exit'); }
  if (backend) { backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); }
});

test('public API paths preserve URL and query through the runtime proxy', async () => {
  for (const endpoint of ['/api/points/rules', '/api/institution/public', '/api/applications', '/api/ranking?period=all']) {
    const response = await fetch(origin + endpoint); assert.equal(response.status, 200, endpoint);
    assert.equal(calls.at(-1).url, endpoint);
  }
});

test('login and refresh forward cookie, origin, bearer, JSON and both Set-Cookie headers', async () => {
  for (const endpoint of ['/api/auth/login', '/api/auth/refresh']) {
    const response = await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer fixture', cookie: 'isi_refresh=previous', origin }, body: JSON.stringify({ identifier: 'fixture' }) });
    assert.equal(response.status, 200);
    const received = calls.at(-1);
    assert.equal(received.headers.cookie, 'isi_refresh=previous');
    assert.equal(received.headers.origin, origin);
    assert.equal(received.headers.authorization, 'Bearer fixture');
    assert.deepEqual(JSON.parse(received.body), { identifier: 'fixture' });
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.match(response.headers.getSetCookie()[0], /Path=\/api\/auth; HttpOnly/);
  }
});

test('multipart logos and uploaded assets keep their paths and bodies', async () => {
  const form = new FormData(); form.set('file', new Blob(['logo fixture'], { type: 'image/png' }), 'logo.png');
  assert.equal((await fetch(origin + '/api/institution/admin/logos/institutional', { method: 'POST', body: form })).status, 200);
  assert.match(calls.at(-1).headers['content-type'], /multipart\/form-data; boundary=/);
  assert.match(calls.at(-1).body, /logo fixture/);
  assert.equal((await fetch(origin + '/uploads/logo.webp')).status, 200);
  assert.equal(calls.at(-1).url, '/uploads/logo.webp');
});

test('ranking, login, fallback logo, navigation and manifest are served with same-origin CSP', async () => {
  for (const route of ['/ranking', '/login', '/branding/univalle-logo.png', '/manifest.webmanifest']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    if (route === '/ranking') {
      const html = await response.text();
      assert.ok(html.includes('Univalle')); assert.ok(html.includes('data-institution-defaults'));
      assert.ok(!html.includes('http://localhost:4000'));
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self';/);
    }
  }
});

test('production browser chunks contain no localhost API destination', () => {
  const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  for (const file of files(path.join(__dirname, '../.next/static')).filter(file => file.endsWith('.js'))) {
    assert.ok(!fs.readFileSync(file, 'utf8').includes('http://localhost:4000'), file);
  }
});
