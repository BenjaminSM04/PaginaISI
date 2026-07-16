const test = require('node:test');
const assert = require('node:assert/strict');

const { preferenceKeyForType } = require('../dist/notifications/notifications.module');

test('cada notificación respeta la categoría de preferencia correcta', () => {
  assert.equal(preferenceKeyForType('CONTENT_REVIEW'), 'contentReview');
  assert.equal(preferenceKeyForType('FORUM_ANSWER'), 'forumActivity');
  assert.equal(preferenceKeyForType('FORUM_ACCEPTED'), 'forumActivity');
  assert.equal(preferenceKeyForType('EVENT_REGISTRATION'), 'eventRegistrations');
  assert.equal(preferenceKeyForType('MENTORSHIP_ENROLLMENT'), 'mentorships');
  assert.equal(preferenceKeyForType('SYSTEM'), null);
});
