const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { InstitutionController, InstitutionService, UpdateInstitutionDto, normalizeTheme } = require('../dist/institution/institution.module');

test('theme accepts partial palettes and rejects CSS injection, unknown keys and malformed structures', () => {
  assert.deepEqual(normalizeTheme({ light: { primary: '#ABCDEF' }, dark: { danger: '#112233' } }), { light: { primary: '#abcdef' }, dark: { danger: '#112233' } });
  assert.deepEqual(normalizeTheme(null), {});
  for (const value of [[], 'red', { light: [] }, { sepia: {} }, { light: { bogus: '#112233' } }, { dark: { primary: 'red;}</style><script>' } }, { light: { primary: null } }]) {
    assert.throws(() => normalizeTheme(value));
  }
});

test('HTTP DTO rejects dimensions outside responsive limits, null and cropping fits', async () => {
  for (const values of [{ logoMaxHeight: 1000 }, { logoMaxWidth: 0 }, { logoMaxWidth: null }, { logoMaxHeight: 42.5 }, { logoObjectFit: 'cover' }]) {
    assert.ok((await validate(Object.assign(new UpdateInstitutionDto(), values))).length);
  }
  assert.equal((await validate(Object.assign(new UpdateInstitutionDto(), { logoMaxHeight: 64, logoMaxWidth: 180, logoObjectFit: 'contain' }))).length, 0);
});

test('public identity is read-only to anonymous visitors; changes/uploads require ADMIN', () => {
  assert.equal(Reflect.getMetadata('isPublic', InstitutionController.prototype.getPublic), true);
  for (const method of ['getAdmin', 'update', 'uploadLogo']) assert.deepEqual(Reflect.getMetadata('roles', InstitutionController.prototype[method]), ['ADMIN']);
});

test('dark logos and favicon use the existing upload transaction and cleanup on failure', async () => {
  for (const [kind, field] of [['institutional-dark', 'institutionalLogoDarkUrl'], ['career-dark', 'careerLogoDarkUrl'], ['favicon', 'faviconUrl']]) {
    const removed = [];
    const service = new InstitutionService({}, {}, {
      upload: async () => ({ id: 'new', url: '/uploads/new.webp' }),
      removeRecordAndObject: async id => removed.push(id),
    });
    service.update = async (_actor, dto) => { assert.deepEqual(dto, { [field]: '/uploads/new.webp' }); throw new Error('rollback'); };
    await assert.rejects(() => service.uploadLogo({ id: 'admin' }, kind, { mimetype: 'image/png' }), /rollback/);
    assert.deepEqual(removed, ['new']);
  }
});
