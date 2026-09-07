import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const MODE = '1080p-hevc-native-cap';
const SCRIPT_VERSION = '0.4.0';
const TICKET_KEY = `ioridev.disneyplus4k.once.v${SCRIPT_VERSION}`;
const STORAGE_KEY = 'ioridev.disneyplus4k.mode.v1';
const CHECKPOINT_KEY = 'ioridev.disneyplus4k.checkpoint.v1';
const DOCUMENT_URL = 'https://www.disneyplus.com/ja-jp/play/native-cap-test';

const makeStorage = (entries) => {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const localStorage = makeStorage([[STORAGE_KEY, 'original']]);
const sessionStorage = makeStorage([[
  TICKET_KEY,
  JSON.stringify({version: SCRIPT_VERSION, mode: MODE, documentUrl: DOCUMENT_URL, createdAt: Date.now() - 100}),
]]);
const listeners = new Map();
const context = vm.createContext({
  URL,
  DOMException,
  console,
  localStorage,
  sessionStorage,
  performance: {getEntriesByType: () => [{type: 'reload'}]},
  location: {href: DOCUMENT_URL, pathname: '/ja-jp/play/native-cap-test'},
  document: {documentElement: null, querySelectorAll: () => []},
  MutationObserver: class { observe() {} disconnect() {} },
  addEventListener: (name, callback, capture) => listeners.set(name, {callback, capture}),
  setInterval: () => 0,
  setTimeout: () => 0,
});

// Keep all EME fixture objects in the VM realm. The test records only API
// shapes/arguments; it never records key IDs, challenges, or license bytes.
vm.runInContext(`
  globalThis.nativeRequestCalls = [];
  globalThis.nativeCreateMediaKeysCalls = [];
  globalThis.nativeCreateSessionCalls = [];
  globalThis.nativeSessionListenerCalls = [];
  globalThis.nativeRequestPromise = Promise.resolve(null);
  globalThis.nativeMediaKeysPromise = Promise.resolve(null);
  globalThis.nativeSession = null;

  class TestSession {
    constructor() {
      this.closed = Promise.resolve();
      this.keyStatuses = {forEach() {}};
    }
    addEventListener(...args) {
      nativeSessionListenerCalls.push({thisValue: this, args});
    }
  }
  class TestMediaKeys {
    createSession(...args) {
      nativeCreateSessionCalls.push({thisValue: this, args});
      return nativeSession;
    }
  }
  class TestAccess {
    constructor(keySystem, configuration) {
      this.keySystem = keySystem;
      this.configuration = configuration;
    }
    getConfiguration() { return this.configuration; }
    createMediaKeys(...args) {
      nativeCreateMediaKeysCalls.push({thisValue: this, args});
      return nativeMediaKeysPromise;
    }
  }
  class TestNavigator {
    requestMediaKeySystemAccess(...args) {
      nativeRequestCalls.push({thisValue: this, args});
      return nativeRequestPromise;
    }
  }

  globalThis.MediaKeySession = TestSession;
  globalThis.MediaKeys = TestMediaKeys;
  globalThis.MediaKeySystemAccess = TestAccess;
  globalThis.navigator = new TestNavigator();
  globalThis.nativeAccess = new TestAccess('com.microsoft.playready', null);
  globalThis.nativeKeys = new TestMediaKeys();
  globalThis.nativeSession = new TestSession();
  globalThis.nativeRequestPromise = Promise.resolve(nativeAccess);
  globalThis.nativeMediaKeysPromise = Promise.resolve(nativeKeys);
  globalThis.inputKeySystem = 'com.microsoft.playready';
  globalThis.inputConfigurations = [{
    initDataTypes: ['cenc'],
    sessionTypes: ['temporary', 'persistent-license'],
    persistentState: 'optional',
    distinctiveIdentifier: 'not-allowed',
    videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: '2000'}],
    audioCapabilities: [{contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: '3000'}],
  }];
  globalThis.inputMarker = {marker: 'request'};
  globalThis.sessionMarker = {marker: 'session'};
  nativeAccess.configuration = inputConfigurations[0];
`, context);

const checkpointStartedAt = Date.now();
vm.runInContext(source, context);
assert.equal(sessionStorage.getItem(TICKET_KEY), null, 'the current ticket is consumed before EME use');
assert.equal(localStorage.getItem(STORAGE_KEY), 'original', 'the native-cap mode is never persisted as restart mode');
const fromRealmJson = (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));

const configurationSnapshot = vm.runInContext('JSON.stringify(inputConfigurations)', context);
vm.runInContext(`
  globalThis.requestResult = navigator.requestMediaKeySystemAccess(inputKeySystem, inputConfigurations, inputMarker);
  globalThis.accessReady = requestResult.then((value) => { globalThis.access = value; return value; });
`, context);
assert.equal(
  vm.runInContext('requestResult === nativeRequestPromise', context),
  true,
  'native request Promise identity is preserved',
);
await vm.runInContext('requestResult', context);
await vm.runInContext('accessReady', context);

const requestShape = fromRealmJson(`(() => {
  const call = nativeRequestCalls.at(-1);
  const configuration = call.args[1][0];
  return {
    nativeThis: call.thisValue === navigator,
    argCount: call.args.length,
    keySystem: call.args[0],
    configurationsSame: call.args[1] === inputConfigurations,
    markerSame: call.args[2] === inputMarker,
    sessionTypes: configuration.sessionTypes,
    persistentState: configuration.persistentState,
    distinctiveIdentifier: configuration.distinctiveIdentifier,
    videoRobustness: configuration.videoCapabilities[0].robustness,
    audioRobustness: configuration.audioCapabilities[0].robustness,
  };
})()`);
assert.deepEqual(requestShape, {
  nativeThis: true,
  argCount: 3,
  keySystem: 'com.microsoft.playready',
  configurationsSame: true,
  markerSame: true,
  sessionTypes: ['temporary', 'persistent-license'],
  persistentState: 'optional',
  distinctiveIdentifier: 'not-allowed',
  videoRobustness: '2000',
  audioRobustness: '3000',
}, 'native-cap request forwards key and policy fields unchanged');
assert.equal(vm.runInContext('JSON.stringify(inputConfigurations)', context), configurationSnapshot,
  'native-cap request does not mutate the source configuration');

vm.runInContext('globalThis.mediaKeysResult = access.createMediaKeys({marker: \'media-keys\'});', context);
assert.equal(vm.runInContext('mediaKeysResult === nativeMediaKeysPromise', context), true,
  'createMediaKeys Promise identity is preserved');
await vm.runInContext('mediaKeysResult', context);
const cdmCheckpoint = JSON.parse(localStorage.getItem(CHECKPOINT_KEY));
assert.equal(cdmCheckpoint.version, SCRIPT_VERSION, 'CDM checkpoint version matches the script');
assert.equal(cdmCheckpoint.mode, MODE, 'CDM checkpoint proves the intended native-cap mode started');
assert.equal(cdmCheckpoint.steps.some(({phase}) => phase === 'cdm-create-start'), true,
  'checkpoint records the native CDM request');
assert.equal(cdmCheckpoint.steps.some(({phase}) => phase === 'cdm-create-ok'), true,
  'checkpoint records native CDM creation success');
vm.runInContext('globalThis.keys = nativeKeys;', context);

const sessionCases = [
  ['omitted', 'keys.createSession()', 0, undefined, undefined],
  ['explicit undefined', 'keys.createSession(undefined)', 1, undefined, undefined],
  ['undefined plus extra', 'keys.createSession(undefined, sessionMarker)', 2, undefined, true],
  ['temporary', 'keys.createSession(\'temporary\')', 1, 'temporary', undefined],
  ['persistent-license', 'keys.createSession(\'persistent-license\')', 1, 'persistent-license', undefined],
  ['null', 'keys.createSession(null)', 1, null, undefined],
  ['unknown', 'keys.createSession(\'unknown-session\')', 1, 'unknown-session', undefined],
];
for (const [label, expression, expectedLength, expectedFirst, markerAtSecond] of sessionCases) {
  vm.runInContext(`globalThis.sessionResult = ${expression};`, context);
  const observed = vm.runInContext(`(() => {
    const call = nativeCreateSessionCalls.at(-1);
    return {
      nativeThis: call.thisValue === keys,
      resultSame: sessionResult === nativeSession,
      length: call.args.length,
      first: call.args[0],
      markerAtSecond: call.args[1] === sessionMarker,
    };
  })()`, context);
  assert.equal(observed.nativeThis, true, `${label}: native this is preserved`);
  assert.equal(observed.resultSame, true, `${label}: native return value is preserved`);
  assert.equal(observed.length, expectedLength, `${label}: omitted argument count is preserved`);
  assert.equal(observed.first, expectedFirst, `${label}: session type is unchanged`);
  assert.equal(observed.markerAtSecond, Boolean(markerAtSecond), `${label}: trailing arguments are preserved`);
}

assert.equal(vm.runInContext('nativeRequestCalls.length', context), 1, 'only one request is recorded');
assert.equal(vm.runInContext('nativeCreateSessionCalls.length', context), sessionCases.length,
  'each createSession call reaches the native fixture');
assert.equal(vm.runInContext('nativeSessionListenerCalls.some((entry) => entry.args[0] === "message")', context), true,
  'the diagnostic observer may attach without changing native session arguments');

// The EME fixture above is only meaningful if the document actually booted the
// intended one-shot mode. Validate the durable diagnostic checkpoint separately
// from the native-call shape, while keeping its contract limited to allowlisted
// version/mode/stage/timestamp fields.
const checkpointRaw = localStorage.getItem(CHECKPOINT_KEY);
assert.notEqual(checkpointRaw, null, 'the experimental startup checkpoint is written');
const checkpoint = JSON.parse(checkpointRaw);
assert.deepEqual(Object.keys(checkpoint).sort(), ['mode', 'steps', 'version'],
  'checkpoint contains only the durable diagnostic fields');
assert.equal(checkpoint.version, SCRIPT_VERSION, 'checkpoint version matches the script');
assert.equal(checkpoint.mode, MODE, 'checkpoint proves the intended native-cap mode started');
assert.ok(Array.isArray(checkpoint.steps) && checkpoint.steps.length > 0, 'checkpoint has at least one stage');
assert.ok(checkpoint.steps.length <= 8, 'checkpoint keeps only the bounded diagnostic tail');
const allowedPhases = new Set([
  'test-start', 'cdm-create-start', 'cdm-create-ok', 'cdm-attach-ok', 'cdm-detach',
  'session-event', 'keys-pending', 'keys-usable', 'keys-other', 'media-error',
  'generateRequest-start', 'generateRequest-ok', 'update-start', 'update-ok',
  'video-metadata', 'video-playing', 'video-waiting-for-key', 'page-exit',
]);
const checkpointCheckedAt = Date.now();
for (const step of checkpoint.steps) {
  assert.deepEqual(Object.keys(step).sort(), ['phase', 'time'],
    'checkpoint stages contain only phase and time');
  assert.equal(typeof step.phase, 'string', 'checkpoint phase is a string');
  assert.equal(allowedPhases.has(step.phase), true, `checkpoint phase is allowlisted: ${step.phase}`);
  assert.equal(Number.isSafeInteger(step.time), true, 'checkpoint time is a safe integer');
  assert.ok(step.time >= checkpointStartedAt - 1000 && step.time <= checkpointCheckedAt,
    'checkpoint time is limited to this test document');
}
// The production checkpoint is an eight-entry ring buffer; the repeated
// createSession cases may legitimately evict the earliest `test-start` entry.
assert.equal(checkpoint.steps.some(({phase}) => phase === 'session-event'), true,
  'checkpoint records the native session event');
console.log('native DRM cap: new mode leaves EME key/policy/session arguments and native returns unchanged; no key/license material recorded');
