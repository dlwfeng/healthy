const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  let now = 0;
  let sequence = 0;
  let scroll;
  const timers = new Map();
  const element = () => ({ classList: new Set() });
  const root = element();
  // Match the classList API while retaining easy assertions.
  root.classList.remove = root.classList.delete.bind(root.classList);
  const document = {
    documentElement: root,
    addEventListener(type, callback, options) {
      assert.equal(type, 'scroll');
      assert.equal(options.capture, true);
      assert.equal(options.passive, true);
      scroll = callback;
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scrollbars.js'), 'utf8'), {
    document,
    setTimeout(callback, delay) {
      timers.set(++sequence, { callback, at: now + delay });
      return sequence;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    root,
    element() {
      const target = element();
      target.classList.remove = target.classList.delete.bind(target.classList);
      return target;
    },
    scroll(target = document) { scroll({ target }); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

test('page thumb starts hidden and hides exactly two seconds after the last scroll', () => {
  const h = harness();
  assert.ok(h.root.classList.has('scrollbars-ready'));
  assert.ok(!h.root.classList.has('scrollbar-visible'));
  h.scroll();
  h.advance(1500);
  h.scroll();
  h.advance(1999);
  assert.ok(h.root.classList.has('scrollbar-visible'));
  h.advance(1);
  assert.ok(!h.root.classList.has('scrollbar-visible'));
});

test('dynamically created nested scrollers have independent hide timers', () => {
  const h = harness();
  const nested = h.element();
  h.scroll();
  h.advance(1000);
  h.scroll(nested);
  h.advance(1000);
  assert.ok(!h.root.classList.has('scrollbar-visible'));
  assert.ok(nested.classList.has('scrollbar-visible'));
  h.advance(1000);
  assert.ok(!nested.classList.has('scrollbar-visible'));
  h.scroll(nested);
  assert.ok(nested.classList.has('scrollbar-visible'));
});
