const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSync } = require('class-validator');

const { ArticleReviewDto } = require('../dist/articles/articles.module');
const { ReviewDto: ProjectReviewDto } = require('../dist/projects/projects.module');

test('aprobar un artículo no exige la versión exclusiva de proyectos', () => {
  const articleReview = Object.assign(new ArticleReviewDto(), { decision: 'APPROVED' });
  const errors = validateSync(articleReview, { whitelist: true, forbidNonWhitelisted: true });

  assert.deepEqual(errors, []);
});

test('la revisión de proyectos conserva el control de concurrencia', () => {
  const projectReview = Object.assign(new ProjectReviewDto(), { decision: 'APPROVED' });
  const errors = validateSync(projectReview, { whitelist: true, forbidNonWhitelisted: true });

  assert.ok(errors.some((error) => error.property === 'expectedVersion'));
});
