const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function navigation() {
  const code = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const navMatch = code.match(/const navigation = (\[[\s\S]*?\];)/);
  assert.ok(navMatch, 'navigation array must be declared');
  return new Function(`return ${navMatch[1].replace(/;$/, '')}`)();
}

test('health assistant group holds memory and feedback after a divider', () => {
  const groups = navigation();
  const assistant = groups.find((group) => group.label === '健康助手');
  assert.ok(assistant, '健康助手 group must exist');
  assert.equal(assistant.divider, true, '健康助手 group must specify divider: true');
  assert.deepEqual(
    assistant.children.map(([id]) => id),
    ['memory', 'feedback'],
  );
  assert.ok(
    groups.findIndex((group) => group.label === '饮食营养') <
      groups.indexOf(assistant),
    '健康助手 must be placed after 饮食营养',
  );
});

test('feedback is nested in the health assistant group, not a top-level item', () => {
  const groups = navigation();
  assert.equal(groups.some((group) => group.page === 'feedback'), false);
  const assistant = groups.find((group) => group.label === '健康助手');
  const feedback = assistant.children.find(([id]) => id === 'feedback');
  assert.ok(feedback, 'feedback destination must exist');
  assert.equal(feedback[1], '意见反馈');
});

test('mobile navigation renders top-level destinations without a divider', () => {
  const groups = navigation();
  const mobileNav = groups
    .map(
      (group) =>
        `<a href="#${group.page}" class="nav-btn" data-goto="${group.page}">${group.label}</a>`,
    )
    .join('');

  assert.doesNotMatch(mobileNav, /nav-divider/);
  assert.match(mobileNav, /data-goto="home"/);
  assert.doesNotMatch(mobileNav, /data-goto="feedback"/);
});
