const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const frontend = (...parts) => join(__dirname, '..', '..', 'frontend', 'src', ...parts);
const source = (...parts) => readFileSync(frontend(...parts), 'utf8');
const backendSource = (...parts) => readFileSync(join(__dirname, '..', 'src', ...parts), 'utf8');

test('login y registro se renderizan bajo la guarda exclusiva de visitantes', () => {
  for (const page of ['login', 'registro']) {
    const file = source('app', page, 'page.tsx');
    assert.match(file, /import \{ GuestOnly \}/);
    assert.match(file, /<GuestOnly>/);
  }
  const navigation = source('lib', 'navigation.ts');
  assert.match(navigation, /AUTH_ENTRY_PATHS/);
  assert.match(navigation, /safeAuthCallback/);
  assert.match(navigation, /candidate\.startsWith\('\/\/'\)/);
});

test('la carga de imágenes ofrece preview inmediato, reemplazo, retiro y libera object URLs', () => {
  const upload = source('components', 'media-upload-button.tsx');
  assert.match(upload, /URL\.createObjectURL\(file\)/);
  assert.match(upload, /URL\.revokeObjectURL/);
  assert.match(upload, /previewUrl\?: string \| null/);
  assert.match(upload, /onRemove\?: \(\) => void/);
  assert.match(upload, /validMime[\s\S]*validExtension/);
  assert.match(upload, /file\.size[\s\S]*maxSizeBytes/);

  for (const path of [
    ['app', 'proyectos', 'nuevo', 'page.tsx'],
    ['app', 'proyectos', 'editar', '[id]', 'page.tsx'],
  ]) {
    const form = source(...path);
    assert.match(form, /previewUrl=\{coverUrl\}/);
    assert.match(form, /onRemove=\{\(\) => setValue\('coverUrl', ''/);
  }
});

test('selectores remotos envían búsqueda y paginación y mantienen debounce y teclado', () => {
  const selectors = source('components', 'remote-selectors.tsx');
  assert.match(selectors, /q: request\.query/);
  assert.match(selectors, /page: String\(request\.page\)/);
  assert.match(selectors, /limit: String\(request\.limit\)/);

  for (const component of ['remote-combobox.tsx', 'remote-multi-combobox.tsx']) {
    const combobox = source('components', 'ui', component);
    assert.match(combobox, /debounceMs = 300/);
    assert.match(combobox, /ArrowDown/);
    assert.match(combobox, /aria-activedescendant/);
    assert.match(combobox, /Cargar más resultados/);
  }
});

test('la vista previa de revisión reutiliza el detalle público con la versión enviada', () => {
  const review = source('app', 'revision', 'page.tsx');
  const detail = source('components', 'project-detail-view.tsx');
  const publicPage = source('app', 'proyectos', '[slug]', 'page.tsx');
  assert.match(review, /\/projects\/\$\{previewId\}\/review-preview/);
  assert.match(review, /<ProjectDetailView[\s\S]*preview/);
  assert.match(publicPage, /<ProjectDetailView project=\{project\}/);
  assert.match(detail, /reviewActions/);
});

test('la navegación de retorno usa historial de origen seguro y fallback interno', () => {
  const back = source('components', 'back-button.tsx');
  assert.match(back, /previous\.origin === current\.origin/);
  assert.match(back, /router\.back\(\)/);
  assert.match(back, /safeInternalPath\(fallbackHref/);
});

test('noticias expandibles cargan el cuerpo bajo demanda y las listas no lo transfieren', () => {
  const newsBackend = backendSource('news', 'news.module.ts');
  const listProjection = /const NEWS_PUBLIC_LIST_SELECT = \{([\s\S]*?)\} satisfies Prisma\.NewsSelect/.exec(newsBackend);
  assert.ok(listProjection, 'debe existir una proyección pública específica');
  assert.doesNotMatch(listProjection[1], /\bcontent\s*:/);
  assert.match(newsBackend, /select: NEWS_PUBLIC_LIST_SELECT/);

  const tabs = source('components', 'news-view-tabs.tsx');
  assert.match(tabs, /queryKey: \['news', 'detail', item\.slug\]/);
  assert.match(tabs, /enabled: expanded && !item\.content/);
  assert.match(tabs, /aria-expanded=\{expanded\}/);
});

test('los accesos privados de eventos comparten caché y la aíslan por usuario', () => {
  const actions = source('components', 'actions.tsx');
  const meeting = source('components', 'event-meeting-link.tsx');
  assert.match(actions, /useQuery\(\{/);
  assert.match(actions, /\['event-access', slug, user\?\.id \?\? 'guest'\]/);
  assert.match(meeting, /\['event-access', slug, user\?\.id \?\? 'guest'\]/);
});
