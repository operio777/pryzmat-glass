const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sharedScript = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');

// Only script nodes and DOM events are mocked; no external SDK is executed.
function loadVideoControls() {
  const attachedScripts = [];
  const createdScripts = [];
  const buttonListeners = new Map();
  const button = {
    disabled: false,
    hidden: false,
    addEventListener(type, handler) { buttonListeners.set(type, handler); }
  };
  const status = { textContent: 'Odtwarzacz Facebooka wczyta się po kliknięciu.' };
  const document = {
    querySelector(selector) {
      if (selector === '#load-project-video') return button;
      if (selector === '#project-video-status') return status;
      return null;
    },
    addEventListener() {},
    createElement(tag) {
      assert.equal(tag, 'script');
      const script = {
        remove() {
          const index = attachedScripts.indexOf(script);
          if (index !== -1) attachedScripts.splice(index, 1);
        }
      };
      createdScripts.push(script);
      return script;
    },
    body: { appendChild(script) { attachedScripts.push(script); } }
  };
  const context = { document };
  context.window = context;
  vm.runInNewContext(sharedScript, context, { filename: 'assets/app.js' });
  return {
    button,
    status,
    attachedScripts,
    createdScripts,
    // Invoke the handler even when disabled to verify its double-click guard.
    click() { buttonListeners.get('click')(); }
  };
}

test('homepage and shared script do not load Facebook SDK before a click', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const eagerScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)];
  assert.ok(!eagerScripts.some(([, src]) => src.includes('connect.facebook.net')));
  const page = loadVideoControls();
  assert.equal(page.createdScripts.length, 0);
  assert.equal(page.attachedScripts.length, 0);
  assert.equal(page.button.disabled, false);
});

test('one video click loads a single asynchronous SDK and repeated clicks do not duplicate it', () => {
  const page = loadVideoControls();
  page.click();
  assert.equal(page.createdScripts.length, 1);
  assert.equal(page.attachedScripts.length, 1);
  assert.equal(page.button.disabled, true);
  assert.match(page.status.textContent, /Wczytywanie/);
  const script = page.attachedScripts[0];
  assert.equal(new URL(script.src).origin, 'https://connect.facebook.net');
  assert.equal(script.async, true);
  page.click();
  page.click();
  assert.equal(page.createdScripts.length, 1);
  assert.equal(page.attachedScripts.length, 1);
});

test('successful SDK load hides the button and retains the fallback explanation', () => {
  const page = loadVideoControls();
  page.click();
  page.attachedScripts[0].onload();
  assert.equal(page.button.hidden, true);
  assert.equal(page.button.disabled, true);
  assert.match(page.status.textContent, /linku do filmu na Facebooku/);
  page.click();
  assert.equal(page.createdScripts.length, 1);
});

test('failed SDK load removes its node and enables a single clean retry', () => {
  const page = loadVideoControls();
  page.click();
  const firstScript = page.attachedScripts[0];
  firstScript.onerror();
  assert.equal(page.attachedScripts.length, 0);
  assert.equal(page.button.disabled, false);
  assert.equal(page.button.hidden, false);
  assert.match(page.status.textContent, /spróbować ponownie/);
  page.click();
  page.click();
  assert.equal(page.createdScripts.length, 2);
  assert.equal(page.attachedScripts.length, 1);
  assert.notEqual(page.attachedScripts[0], firstScript);
  page.attachedScripts[0].onload();
  assert.equal(page.button.hidden, true);
});
