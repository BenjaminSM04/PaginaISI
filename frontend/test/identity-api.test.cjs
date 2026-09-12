const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, filename);
  return mod.exports;
}
const { resolveTheme, themeCss, contrastRatio, hslChannels } = load('lib/theme.ts');

test('el formulario normaliza el correo institucional y rechaza dominios parecidos y contraseñas truncadas', () => {
  const { registrationSchema } = load('lib/registration-schema.ts');
  const payload = { fullName: 'Estudiante Univalle', username: 'estudiante', email: ' Persona@UNIVALLE.EDU ', password: 'Una frase larga privada', confirm: 'Una frase larga privada' };
  assert.equal(registrationSchema.parse(payload).email, 'persona@univalle.edu');
  for (const email of ['persona@gmail.com', 'persona@evilunivalle.edu', 'persona@univalle.edu.evil.com', 'persona@est.univalle.edu']) assert.equal(registrationSchema.safeParse({ ...payload, email }).success, false);
  assert.equal(registrationSchema.safeParse({ ...payload, password: '🙂'.repeat(19), confirm: '🙂'.repeat(19) }).success, false);
});

test('defaults keep readable text and semantic colors on both page and card backgrounds', () => {
  for (const [mode, palette] of Object.entries(resolveTheme())) {
    for (const background of ['background', 'surface']) {
      for (const color of ['primary', 'accent', 'text', 'muted', 'success', 'warning', 'danger', 'info', 'gold']) {
        assert.ok(contrastRatio(palette[color], palette[background]) >= 4.5, `${mode}.${color} on ${background}`);
      }
    }
  }
});

test('changing brand colors updates tokens and derived interactions while preserving semantic states', () => {
  const defaults = resolveTheme();
  const changed = resolveTheme({ light: { primary: '#663399' } });
  assert.equal(changed.light.danger, defaults.light.danger);
  assert.equal(changed.dark.primary, defaults.dark.primary);
  const css = themeCss(changed);
  assert.ok(css.includes('--primary:' + hslChannels('#663399')));
  for (const token of ['primary-hover', 'primary-active', 'primary-foreground', 'ring', 'hero']) assert.ok(css.includes('--' + token + ':'));
  assert.ok(css.includes(':root.dark'));
  assert.ok(!themeCss({ light: { primary: '</style><script>' } }).includes('<script>'));
});

test('browser API uses same-origin URLs including login, refresh, rules, ranking and applications', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(url.endsWith('/refresh') ? { accessToken: 'refreshed' } : { ok: true });
  };
  try {
    const { api } = load('lib/api.ts');
    for (const endpoint of ['/institution/public', '/points/rules', '/applications', '/ranking']) await api.get(endpoint);
    await api.post('/auth/login', { identifier: 'test', password: 'fixture' });
    assert.equal(await api.refresh(), true);
    assert.equal(calls.length, 6);
    for (const call of calls) { assert.ok(call.url.startsWith('/api/')); assert.equal(call.credentials, 'include'); }
  } finally { global.fetch = original; }
});

test('concurrent unauthorized requests share one refresh and retry with the new bearer', async () => {
  const original = global.fetch;
  let refreshes = 0;
  global.fetch = async (url, options) => {
    if (url === '/api/auth/refresh') { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ accessToken: 'new' }); }
    return Response.json({}, { status: options.headers.Authorization === 'Bearer new' ? 200 : 401 });
  };
  try {
    const { api } = load('lib/api.ts');
    await Promise.all([api.get('/applications'), api.get('/auth/me')]);
    assert.equal(refreshes, 1);
  } finally { global.fetch = original; }
});

test('internal destination reads runtime configuration and refuses paths/credentials', () => {
  const previous = process.env.API_INTERNAL_URL;
  const { apiInternalOrigin } = load('lib/api-origin.ts');
  try {
    process.env.API_INTERNAL_URL = 'http://api:4000'; assert.equal(apiInternalOrigin(), 'http://api:4000');
    process.env.API_INTERNAL_URL = 'http://replacement:4567'; assert.equal(apiInternalOrigin(), 'http://replacement:4567');
    for (const value of ['http://api:4000/api', 'http://user:password@api:4000', 'file:///etc/passwd']) {
      process.env.API_INTERNAL_URL = value; assert.throws(apiInternalOrigin);
    }
  } finally { if (previous === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = previous; }
});

test('un código de login incorrecto no renueva ni elimina una sesión del navegador', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async url => { calls.push(url); return Response.json({ message: 'Código incorrecto' }, { status: 401 }); };
  try {
    const { api, setAccessToken, getAccessToken, setSessionExpiredHandler } = load('lib/api.ts');
    setAccessToken('previous'); let expired = false; setSessionExpiredHandler(() => { expired = true; });
    await assert.rejects(() => api.post('/auth/two-factor/verify', { challengeToken: 'fixture', code: '123456' }), /Código incorrecto/);
    assert.deepEqual(calls, ['/api/auth/two-factor/verify']);
    assert.equal(getAccessToken(), 'previous'); assert.equal(expired, false);
  } finally { global.fetch = original; }
});

test('la configuración 2FA renueva un bearer vencido pero conserva la sesión ante errores de validación', async () => {
  const original = global.fetch;
  let refreshes = 0, expired = false;
  global.fetch = async (url, options) => {
    if (url.endsWith('/refresh')) { refreshes++; return Response.json({ accessToken: 'renewed' }); }
    return Response.json({ message: 'La contraseña actual no es correcta' }, { status: options.headers.Authorization === 'Bearer renewed' ? 400 : 401 });
  };
  try {
    const { api, setAccessToken, getAccessToken, setSessionExpiredHandler } = load('lib/api.ts');
    setAccessToken('expired'); setSessionExpiredHandler(() => { expired = true; });
    await assert.rejects(() => api.post('/auth/two-factor/setup', { password: 'incorrecta' }), /contraseña actual/);
    assert.equal(refreshes, 1); assert.equal(expired, false); assert.equal(getAccessToken(), 'renewed');
  } finally { global.fetch = original; }
});
