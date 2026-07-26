const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  ListProjectsQueryDto,
  normalizeProjectTags,
  normalizeProjectTechnologies,
  normalizeProjectValueKey,
} = require('../dist/projects/projects.module');

test('tags y tecnologías se deduplican por NFKC, mayúsculas y espacios', () => {
  assert.deepEqual(normalizeProjectTags([' web ', 'Web', 'WEB', 'machine   learning']), [
    'web',
    'machine learning',
  ]);
  assert.deepEqual(normalizeProjectTechnologies([' React ', 'react', 'Node.js', ' node.js ']), [
    { name: 'React', normalizedName: 'react' },
    { name: 'Node.js', normalizedName: 'node.js' },
  ]);
  assert.equal(normalizeProjectValueKey(' Ｗｅｂ  App '), 'web app');
});

test('el filtro público rechaza semestres fuera de 1º a 8º desde la API', async () => {
  const invalid = plainToInstance(ListProjectsQueryDto, { semester: '9', limit: '24' });
  const valid = plainToInstance(ListProjectsQueryDto, { semester: '8', limit: '24' });

  const invalidErrors = await validate(invalid);
  const validErrors = await validate(valid);

  assert.ok(invalidErrors.some((error) => error.property === 'semester'));
  assert.equal(validErrors.length, 0);
  assert.equal(valid.semester, 8);
});

test('una edición publicada crea versión pendiente sin reemplazar la fila pública', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'projects', 'projects.module.ts'), 'utf8');
  assert.match(source, /shouldCreatePublishedVersion[\s\S]*project\.status === 'APPROVED'/);
  assert.match(source, /projectVersion\.create\([\s\S]*status: 'PENDING'/);
  assert.match(source, /publicVersionUnchanged: true/);
  assert.match(source, /pendingVersionId: version\.id/);
  assert.match(source, /publishVersionSnapshot/);
  assert.ok(
    (source.match(/pendingVersion\?\.status === 'PENDING'/g) ?? []).length >= 2,
    'solo un borrador pendiente reemplazado debe pasar a SUPERSEDED; OBSERVED y REJECTED son históricos',
  );
});

test('el esquema separa revisión CAS y estado editorial de versiones', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  assert.match(schema, /enum ProjectVersionStatus \{[\s\S]*PUBLISHED[\s\S]*SUPERSEDED/);
  assert.match(schema, /model ProjectVersion \{[\s\S]*snapshot\s+Json/);
  assert.match(schema, /pendingVersionId\s+String\?\s+@unique/);
  assert.match(schema, /projectVersionId\s+String\?/);
});

test('la migración conserva publicación, identidad histórica y semestres válidos', () => {
  const migration = readFileSync(
    join(__dirname, '..', 'prisma', 'migrations', '20260720120000_integral_review_features', 'migration.sql'),
    'utf8',
  );
  assert.match(migration, /DISABLE TRIGGER "ProjectAuditLog_immutable"/);
  assert.match(migration, /"actorNameSnapshot"/);
  assert.match(migration, /CREATE TABLE "ProjectVersion"/);
  assert.match(migration, /ADD COLUMN "pendingVersionId"/);
  assert.match(migration, /CHECK \("semester" IS NULL OR "semester" BETWEEN 1 AND 8\)/);
});
