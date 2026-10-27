import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const pageUrl = new URL('../../apps/classic-storymaps-site/viewers.html', import.meta.url);
const helperUrl = new URL('../../apps/classic-storymaps-site/assets/js/arcgis-auth-helpers.js', import.meta.url);
const page = readFileSync(pageUrl, 'utf8');
const require = createRequire(import.meta.url);
const pendingState = { state: '0123456789abcdef0123456789abcdef', returnPath: '/viewers/?app=maptour' };

function authContext() {
  const storage = new Map();
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Date,
    AUTH_STORAGE_KEY: 'arcgis_access_token',
    AUTH_EXPIRY_KEY: 'arcgis_access_token_expires',
    AUTH_STATE_KEY: 'arcgis_oauth_state',
    AUTH_CONFIG: { clientId: 'test-client', redirectUri: 'https://site.example/viewers/' },
    document: { cookie: '' },
    alert: (message) => { context.alertMessage = message; },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    window: {
      crypto: {
        getRandomValues: (bytes) => {
          context.randomByteLength = bytes.byteLength;
          return webcrypto.getRandomValues(bytes);
        }
      },
      history: {
        replaceState: (state, title, url) => {
          context.historyUrl = url;
          context.window.location.hash = '';
        }
      },
      location: {
        protocol: 'https:',
        pathname: '/viewers/',
        search: '?app=maptour',
        hash: '',
        assign: (url) => { context.authorizeUrl = url; }
      }
    }
  });
  if (existsSync(helperUrl)) {
    vm.runInContext(readFileSync(helperUrl, 'utf8'), context);
  }
  vm.runInContext(page.slice(page.indexOf('    function getStoredToken()'), page.indexOf('    function setOmniStatus(')), context);
  return context;
}

test('login requests a 120-minute token', () => {
  const context = authContext();
  context.beginArcgisLogin();
  const authorizeUrl = new URL(context.authorizeUrl);
  assert.equal(authorizeUrl.searchParams.get('expiration'), '120');
  assert.equal(authorizeUrl.searchParams.get('client_id'), 'test-client');
  assert.equal(authorizeUrl.searchParams.get('redirect_uri'), context.AUTH_CONFIG.redirectUri);
});

test('a new runtime tab registers a valid catalog cookie with the SDK', () => {
  const { registerCatalogCredential } = require(helperUrl.pathname);
  const registered = [];
  const identity = { registerToken: credential => registered.push(credential) };
  const expires = Date.now() + 60000;
  const cookie = 'esri_auth=' + encodeURIComponent(JSON.stringify({ token: 'synthetic-catalog-session', expires, ssl: true }));
  assert.equal(registerCatalogCredential(identity, cookie), true);
  assert.deepEqual(registered, [{ server: 'https://www.arcgis.com/sharing/rest', token: 'synthetic-catalog-session', expires, ssl: true }]);
});

test('runtime registration rejects absent, expired and malformed catalog cookies', () => {
  const { registerCatalogCredential } = require(helperUrl.pathname);
  const identity = { registerToken: () => assert.fail('Invalid cookie registered') };
  for (const cookie of ['', 'esri_auth=%', 'esri_auth=' + encodeURIComponent(JSON.stringify({ token: 'synthetic-expired', expires: Date.now() - 1 })),
    'esri_auth=' + encodeURIComponent(JSON.stringify({ token: 'synthetic-no-expiry' }))]) {
    assert.equal(registerCatalogCredential(identity, cookie), false);
  }
});

test('pointer preflight does not catch native startup exceptions or complete the loader twice', async () => {
  let plugin;
  let completions = 0;
  const context = {
    URL,
    document: { cookie: '', createElement: () => assert.fail('Native failure rendered as a pointer error') },
    define: (dependencies, factory) => { plugin = factory({}); },
    window: {
      location: { href: 'https://local.example/viewers/cascade/?appid=' + 'a'.repeat(32) },
      ClassicArcgisAuthHelpers: { readCatalogCredential: () => null },
      ClassicStoryGallery: { createClient: () => ({}) },
      ClassicStoryInput: { resolveItem: async () => ({ chain: ['a'.repeat(32)] }) }
    }
  };
  vm.runInNewContext(readFileSync(new URL('../../apps/classic-storymaps-site/assets/js/arcgis-runtime-auth.js', import.meta.url), 'utf8'), context);
  await assert.rejects(plugin.load('story', null, permitted => {
    assert.equal(permitted, true);
    completions++;
    throw new Error('Native startup failure');
  }), /Native startup failure/);
  assert.equal(completions, 1);
});

test('direct subscription failures show the reason while ordinary access failures retain native sign-in', async () => {
  for (const inactive of [true, false]) {
    let plugin;
    const panels = [];
    const completions = [];
    const message = "The source's ArcGIS Online subscription is no longer active.";
    const error = Object.assign(new Error(inactive ? message : 'Denied'), { code: 403, subscriptionInactive: inactive });
    const context = {
      URL,
      document: { cookie: '', readyState: 'complete', body: { appendChild: panel => panels.push(panel) },
        createElement: () => ({ style: {}, setAttribute() {}, append(...children) { this.children = children; } }) },
      define: (dependencies, factory) => { plugin = factory({}); },
      window: {
        location: { href: 'https://local.example/viewers/cascade/?appid=' + 'a'.repeat(32) },
        ClassicArcgisAuthHelpers: { readCatalogCredential: () => null },
        ClassicStoryMapsConfig: { basePath: '/viewers' },
        ClassicStoryGallery: { createClient: () => ({}) },
        ClassicStoryInput: { resolveItem: async () => { throw error; } }
      }
    };
    vm.runInNewContext(readFileSync(new URL('../../apps/classic-storymaps-site/assets/js/arcgis-runtime-auth.js', import.meta.url), 'utf8'), context);
    await plugin.load('story', null, permitted => completions.push(permitted));
    assert.deepEqual(completions, [!inactive]);
    assert.equal(panels.length, inactive ? 1 : 0);
    if (inactive) assert.equal(panels[0].children[1].textContent, message);
  }
});

for (const change of ['sign-out', 'expiry', 'replacement']) {
  test('an open runtime clears inherited credentials on catalog ' + change, () => {
    const helpers = require(helperUrl.pathname);
    const cookie = token => 'esri_auth=' + encodeURIComponent(JSON.stringify({ token, expires: Date.now() + 60000 }));
    const events = new Map();
    const document = { cookie: cookie('synthetic-runtime-session'),
      addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) };
    let registered = 0;
    let cleared = 0;
    let reloaded = 0;
    let poll;
    const context = {
      document,
      define: (dependencies, factory) => {
        assert.deepEqual(Array.from(dependencies), ['esri/IdentityManager']);
        factory({ registerToken: () => { registered++; }, destroyCredentials: () => { cleared++; } });
      },
      window: { ClassicArcgisAuthHelpers: helpers, location: { reload: () => { reloaded++; } },
        setInterval: callback => { poll = callback; return 1; }, clearInterval: id => assert.equal(id, 1),
        addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) }
    };
    vm.runInNewContext(readFileSync(new URL('../../apps/classic-storymaps-site/assets/js/arcgis-runtime-auth.js', import.meta.url), 'utf8'), context);
    assert.equal(registered, 1);
    poll();
    assert.equal(cleared, 0);
    document.cookie = change === 'sign-out' ? '' : change === 'replacement' ? cookie('synthetic-replacement')
      : 'esri_auth=' + encodeURIComponent(JSON.stringify({ token: 'synthetic-runtime-session', expires: Date.now() - 1 }));
    events.get('focus')();
    assert.equal(cleared, 1);
    assert.equal(reloaded, 1);
    assert.equal(events.size, 0);
    assert.equal(helpers.registerCatalogCredential({ registerToken: () => { registered++; } }, document.cookie), change === 'replacement');
    assert.equal(registered, change === 'replacement' ? 2 : 1);
  });
}

test('OAuth return reads expires_in with the token', () => {
  const context = authContext();
  context.sessionStorage.setItem(context.AUTH_STATE_KEY, JSON.stringify(pendingState));
  context.window.location.hash = '#access_token=test-token&expires_in=1800&state=' + pendingState.state;
  const returned = context.getTokenFromHash();
  assert.equal(returned.token, 'test-token');
  assert.equal(returned.expiresIn, 1800);
});

test('cookie lifetime follows expires_in and sign-out clears both stores', () => {
  const context = authContext();
  const started = Date.now();
  context.storeToken('test-token', 1800);
  assert.match(context.document.cookie, /; Max-Age=1800(?:;|$)/);
  const payload = JSON.parse(decodeURIComponent(context.document.cookie.split(';')[0].slice('esri_auth='.length)));
  assert.equal(payload.token, 'test-token');
  assert.ok(payload.expires >= started + 1800 * 1000);
  assert.ok(payload.expires <= Date.now() + 1800 * 1000);
  assert.match(context.document.cookie, /; Secure(?:;|$)/);
  context.clearStoredToken();
  assert.equal(context.sessionStorage.getItem(context.AUTH_STORAGE_KEY), null);
  assert.equal(context.sessionStorage.getItem(context.AUTH_EXPIRY_KEY), null);
  assert.match(context.document.cookie, /esri_auth=;.*Expires=Thu, 01 Jan 1970/);
});

test('expired stored tokens are removed instead of getting a renewed cookie', () => {
  const context = authContext();
  context.sessionStorage.setItem(context.AUTH_STORAGE_KEY, 'expired-token');
  context.sessionStorage.setItem(context.AUTH_EXPIRY_KEY, Date.now() - 1000);
  assert.equal(context.getStoredToken(), null);
  assert.equal(context.sessionStorage.getItem(context.AUTH_STORAGE_KEY), null);
});

test('missing or invalid lifetimes do not create a session', () => {
  for (const expiresIn of [undefined, null, '', 0, -1, Infinity, 'invalid']) {
    const context = authContext();
    context.storeToken('test-token', expiresIn);
    assert.equal(context.getStoredToken(), null);
    assert.doesNotMatch(context.document.cookie, /test-token/);
  }
});

test('catalog source contains no legacy fourteen-day token lifetime', () => {
  assert.equal(/20160|14\s*\*\s*24|1209600/.test(page), false);
});

test('login stores a cryptographically random 128-bit state and the return path', () => {
  const context = authContext();
  context.beginArcgisLogin();
  assert.equal(context.randomByteLength, 16);
  const stored = JSON.parse(context.sessionStorage.getItem(context.AUTH_STATE_KEY));
  assert.match(stored.state, /^[a-f0-9]{32}$/);
  assert.equal(stored.returnPath, '/viewers/?app=maptour');
  assert.equal(new URL(context.authorizeUrl).searchParams.get('state'), stored.state);
  assert.equal(context.getTokenFromHash(), null);
  assert.equal(context.sessionStorage.getItem(context.AUTH_STATE_KEY), JSON.stringify(stored));
  context.beginArcgisLogin();
  const next = JSON.parse(context.sessionStorage.getItem(context.AUTH_STATE_KEY));
  assert.notEqual(next.state, stored.state);
});

test('matching callback returns the token and path and consumes state and hash once', () => {
  const context = authContext();
  context.sessionStorage.setItem(context.AUTH_STATE_KEY, JSON.stringify(pendingState));
  const hash = '#access_token=test-token&expires_in=1800&state=' + pendingState.state;
  context.window.location.hash = hash;
  const returned = context.getTokenFromHash();
  assert.equal(returned.returnPath, pendingState.returnPath);
  assert.equal(returned.token, 'test-token');
  assert.equal(context.sessionStorage.getItem(context.AUTH_STATE_KEY), null);
  assert.equal(context.window.location.hash, '');
  context.window.location.hash = hash;
  assert.equal(context.getTokenFromHash(), null);
});

for (const [label, stored, hash] of [
  ['missing returned state', JSON.stringify(pendingState), '#access_token=test-token&expires_in=1800'],
  ['mismatched state', JSON.stringify(pendingState), '#access_token=test-token&expires_in=1800&state=other'],
  ['missing stored state', null, '#access_token=test-token&expires_in=1800&state=' + pendingState.state],
  ['malformed stored state', '{invalid', '#access_token=test-token&expires_in=1800&state=' + pendingState.state],
  ['legacy token parameter', JSON.stringify(pendingState), '#token=test-token&expires_in=1800'],
  ['legacy token even with matching state', JSON.stringify(pendingState), '#token=test-token&expires_in=1800&state=' + pendingState.state]
]) {
  test('callback rejects ' + label + ' and clears pending state and hash', () => {
    const context = authContext();
    if (stored) context.sessionStorage.setItem(context.AUTH_STATE_KEY, stored);
    context.window.location.hash = hash;
    assert.equal(context.getTokenFromHash(), null);
    assert.equal(context.sessionStorage.getItem(context.AUTH_STATE_KEY), null);
    assert.equal(context.window.location.hash, '');
  });
}

test('login does not redirect when session storage cannot retain state', () => {
  const context = authContext();
  context.sessionStorage.setItem = () => { throw new Error('storage disabled'); };
  context.beginArcgisLogin();
  assert.equal(context.authorizeUrl, undefined);
  assert.ok(context.alertMessage);
});

test('catalog startup restores only the stored return path after validation', () => {
  const context = authContext();
  const stored = { ...pendingState, returnPath: '/viewers/?appid=local-test-id' };
  context.sessionStorage.setItem(context.AUTH_STATE_KEY, JSON.stringify(stored));
  context.window.location.hash = '#access_token=test-token&expires_in=1800&state=' + stored.state;
  context.setAuthUi = () => {};
  const startup = page.slice(page.indexOf('    const tokenFromHash = getTokenFromHash();'), page.indexOf('    omniForm.addEventListener('));
  vm.runInContext(startup, context);
  assert.equal(context.historyUrl, stored.returnPath);
  assert.equal(context.getStoredToken(), 'test-token');
  assert.equal(context.sessionStorage.getItem(context.AUTH_STATE_KEY), null);
});

test('pure OAuth parser accepts matching access_token returns and rejects malformed returns', () => {
  const { parseAuthReturn } = require(helperUrl.pathname);
  const hash = '#access_token=test-token&expires_in=1800&state=' + pendingState.state;
  assert.deepEqual(parseAuthReturn(hash, pendingState), {
    token: 'test-token', expiresIn: 1800, returnPath: pendingState.returnPath
  });
  for (const invalidHash of [
    '#token=test-token',
    '#access_token=test-token&expires_in=1800',
    '#access_token=test-token&expires_in=1800&state=other',
    '#access_token=test-token&state=' + pendingState.state,
    '#access_token=test-token&expires_in=-1&state=' + pendingState.state,
    '#access_token=test-token&expires_in=invalid&state=' + pendingState.state,
    '#error=access_denied&state=' + pendingState.state
  ]) {
    assert.equal(parseAuthReturn(invalidHash, pendingState), null);
  }
  assert.equal(parseAuthReturn(hash, null), null);
  assert.equal(parseAuthReturn(hash, { ...pendingState, returnPath: '//foreign.example/' }), null);
  assert.equal(parseAuthReturn(hash, { ...pendingState, returnPath: '/\\foreign.example/' }), null);
});
