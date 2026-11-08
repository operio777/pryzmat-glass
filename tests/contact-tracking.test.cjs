const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sharedScript = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const pages = fs.readdirSync(root, { recursive: true })
  .filter(name => path.basename(name) === 'index.html' && !name.startsWith('.git'));
const rentalPage = path.join('wynajem-myjki-do-okien', 'index.html');
const destination = 'AW-18460273766/7fAVCMOn3I8dEObYxeJE';

// Execute only local scripts in an isolated DOM stub: no Google requests,
// dialler, mail client, browser storage or real conversion events.
function loadPage(name) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  const listeners = new Map();
  const context = {
    location: { href: `https://pryzmat-glass.pl/${name.split(path.sep).join('/').replace(/index\.html$/, '')}` },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener(type, callback) {
        const existing = listeners.get(type) || [];
        existing.push(callback);
        listeners.set(type, existing);
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attributes, code] of scripts) {
    if (!/\bsrc=|application\/ld\+json/.test(attributes) && /gtag\(/.test(code)) {
      vm.runInContext(code, context, { filename: name });
    }
  }
  vm.runInContext(sharedScript, context, { filename: 'assets/app.js' });
  return {
    context,
    events: () => context.dataLayer.map(args => Array.from(args)).filter(args => args[0] === 'event'),
    dispatch(type, event) {
      for (const listener of listeners.get(type) || []) listener(event);
    }
  };
}

function click(href, isTrusted = true) {
  const link = { getAttribute: () => href, textContent: ' Zapytaj o wycenę ' };
  return {
    isTrusted,
    target: {
      closest(selector) {
        if (selector === 'a[href^="tel:"]' && href.startsWith('tel:')) return link;
        if (selector === 'a[href^="mailto:"]' && href.startsWith('mailto:')) return link;
        return null;
      }
    },
    preventDefault() { assert.fail('Tracking must not prevent contact navigation'); },
    stopPropagation() { assert.fail('Tracking must not stop event propagation'); }
  };
}

test('every page loads one tag, preserves both IDs and includes contact measurement once', () => {
  assert.ok(pages.length >= 14);
  for (const name of pages) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1, name);
    for (const id of ['G-3W2B2K7RCH', 'AW-18460273766']) {
      assert.equal((html.match(new RegExp(`gtag\\('config',\\s*'${id}'`, 'g')) || []).length, 1, `${name}: ${id}`);
    }
    assert.equal(html.split(destination).length - 1, 1, `${name}: conversion destination`);
    assert.equal((html.match(/<script\s+src="[^"]*assets\/app\.js"/g) || []).length, 1, `${name}: shared script`);
  }
});

test('initialisation, scroll and non-contact clicks do not generate contact events', () => {
  for (const name of pages) {
    const page = loadPage(name);
    assert.equal(page.events().length, 0, name);
    page.dispatch('scroll', { isTrusted: true });
    page.dispatch('click', click('/mycie-okien/'));
    assert.equal(page.events().length, 0, name);
  }
});

test('one real phone click yields one GA4 phone_click and one Ads conversion on every page', () => {
  for (const name of pages) {
    const page = loadPage(name);
    page.dispatch('click', click('tel:+48535937367'));
    const calls = page.events();
    assert.equal(calls.length, 2, name);
    assert.equal(calls[0][1], 'phone_click', name);
    assert.equal(calls[0][2].phone_number, '+48535937367', name);
    assert.equal(calls[0][2].page_location, page.context.location.href, name);
    assert.equal(calls[1][1], 'conversion', name);
    assert.equal(calls[1][2].send_to, destination, name);
  }
});

test('synthetic phone clicks never generate Ads conversions', () => {
  for (const name of pages) {
    const page = loadPage(name);
    page.dispatch('click', click('tel:+48535937367', false));
    assert.equal(page.events().filter(call => call[1] === 'conversion').length, 0, name);
  }
});

test('real email clicks send one GA4-only event with source page but no message contents', () => {
  for (const name of pages) {
    const page = loadPage(name);
    page.dispatch('click', click('mailto:biuro.pryzmatglass@gmail.com?subject=Private&body=Private'));
    const calls = page.events();
    assert.equal(calls.length, 1, name);
    assert.equal(calls[0][1], 'email_click', name);
    assert.equal(calls[0][2].send_to, 'G-3W2B2K7RCH', name);
    assert.equal(calls[0][2].page_location, page.context.location.href, name);
    assert.equal(calls[0][2].link_text, 'Zapytaj o wycenę', name);
    assert.ok(!JSON.stringify(calls).includes('Private'), name);
  }
});

test('synthetic email clicks are not counted', () => {
  const page = loadPage(rentalPage);
  page.dispatch('click', click('mailto:biuro.pryzmatglass@gmail.com', false));
  assert.equal(page.events().length, 0);
});

test('new contact handlers tolerate unavailable or throwing gtag and non-element targets', () => {
  const page = loadPage(rentalPage);
  for (const unavailable of [undefined, () => { throw new Error('Blocked analytics'); }]) {
    page.context.gtag = unavailable;
    assert.doesNotThrow(() => page.dispatch('click', click('tel:+48535937367')));
    assert.doesNotThrow(() => page.dispatch('click', click('mailto:biuro.pryzmatglass@gmail.com')));
    assert.doesNotThrow(() => page.dispatch('click', { isTrusted: true, target: null }));
    assert.doesNotThrow(() => page.dispatch('click', { isTrusted: true, target: {} }));
  }
});
