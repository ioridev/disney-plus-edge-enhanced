import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const MODE_1080 = '1080p-hevc-sdk-playready';
const MODE_UHD = '4k-hdr10-sdk-playready';
const MODE_UHD_HEVC = '4k-hevc-sdk-playready';
const MODE = process.argv[2] ?? MODE_1080;
const IS_UHD = [MODE_UHD, MODE_UHD_HEVC].includes(MODE);
assert.ok([MODE_1080, MODE_UHD, MODE_UHD_HEVC].includes(MODE),
  `usage: node tests/test-sdk-playready-flow.mjs <${MODE_1080}|${MODE_UHD}|${MODE_UHD_HEVC}>`);
const NATIVE_CAP_MODE = '1080p-hevc-native-cap';
const SCRIPT_VERSION = '0.5.0';
const TICKET_KEY = `ioridev.disneyplus4k.once.v${SCRIPT_VERSION}`;
const STORAGE_KEY = 'ioridev.disneyplus4k.mode.v1';
const CHECKPOINT_KEY = 'ioridev.disneyplus4k.checkpoint.v1';
const DOCUMENT_URL = 'https://www.disneyplus.com/ja-jp/play/sdk-playready-flow-test';
const PLAYBACK_SESSION_URL = `https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/26.10.0-jasmine/all_browser_es6/playback-session.js`;
const PLAYREADY_IDS = [
  'com.microsoft.playready.recommendation.3000',
  'com.microsoft.playready.recommendation',
  'com.microsoft.playready',
];
const FLOW_CONFIG = {
  initDataTypes: ['cenc'],
  sessionTypes: ['temporary', 'persistent-license'],
  persistentState: 'optional',
  distinctiveIdentifier: 'required',
  videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: '2000'}],
  audioCapabilities: [{contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: '3000'}],
};

const makeStorage = (entries = []) => {
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
  location: {href: DOCUMENT_URL, pathname: '/ja-jp/play/sdk-playready-flow-test'},
  document: {documentElement: null, currentScript: null, querySelectorAll: () => []},
  MutationObserver: class { observe() {} disconnect() {} },
  addEventListener: (name, callback, capture) => listeners.set(name, {callback, capture}),
  setInterval: () => 0,
  setTimeout: () => 0,
});

// Keep all fixture objects and promises in the VM realm. Only EME call shapes,
// policy strings and native identity are observed; no key/license material is
// created, copied or logged.
vm.runInContext(`
  globalThis.nativeRequestCalls = [];
  globalThis.nativeCreateMediaKeysCalls = [];
  globalThis.nativeCreateSessionCalls = [];
  globalThis.nativeSessionListenerCalls = [];
  globalThis.sdkCalls = [];
  globalThis.sdkSessionCalls = [];
  globalThis.nativeRequestPromise = Promise.resolve(null);
  globalThis.nativeMediaKeysPromise = Promise.resolve(null);
  globalThis.nativeSession = null;
  globalThis.makeFlowConfig = function makeFlowConfig(identifier = 'required') {
    const value = ${JSON.stringify(FLOW_CONFIG)};
    value.distinctiveIdentifier = identifier;
    value.marker = {keep: true};
    return value;
  };

  class TestSession {
    constructor() {
      this.closed = Promise.resolve();
      this.keyStatuses = {forEach() {}};
    }
    addEventListener(...args) {
      nativeSessionListenerCalls.push({thisValue: this, args: [args[0]]});
    }
  }
  class TestMediaKeys {
    createSession(...args) {
      nativeCreateSessionCalls.push({thisValue: this, args});
      if (globalThis.nativeSessionError) throw globalThis.nativeSessionError;
      return nativeSession;
    }
  }
  class TestAccess {
    constructor() {
      this.keySystem = '';
      this.configuration = null;
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
      if (globalThis.nativeRequestError) throw globalThis.nativeRequestError;
      nativeAccess.keySystem = args[0];
      nativeAccess.configuration = args[1]?.[0] || null;
      return nativeRequestPromise;
    }
  }

  class TestPlaybackSession {
    constructor(...args) {
      sdkSessionCalls.push({thisValue: this, args});
    }
  }
  globalThis.sdkNativeSession = TestPlaybackSession;
  globalThis.sdkSessionExport = {};
  Object.defineProperty(globalThis.sdkSessionExport, 'PlaybackSession', {
    get() { return TestPlaybackSession; }, enumerable: true, configurable: true,
  });
  class TestPlaybackService {
    createPlaybackSession(...args) {
      sdkCalls.push({thisValue: this, args});
      const Session = globalThis['playback-session']?.PlaybackSession;
      if (typeof Session !== 'function') throw new Error('session SDK was not published');
      const sessionOptions = {
        playbackServiceVersion: '26.10.0-jasmine',
        mediaCapabilities: {
          videoResolutions: ['SD', 'HD', 'FHD'],
          audioResolutions: ['STEREO', '5.1'],
          nested: {keep: 'native-capability'},
        },
      };
      globalThis.sdkNativeSessionOptions = sessionOptions;
      globalThis.sdkConstructedSession = new Session(sessionOptions, {marker: 'native-session'});
      return Promise.resolve({sdk: true});
    }
  }
  Object.defineProperty(TestPlaybackService, 'version', {value: '26.10.0-jasmine', configurable: true});
  globalThis.sdkNativeCreate = TestPlaybackService.prototype.createPlaybackSession;
  globalThis.sdkInstance = new TestPlaybackService();
  globalThis.sdkExport = {PlaybackService: TestPlaybackService};
  Object.defineProperty(globalThis, 'playback-service', {
    value: sdkExport, configurable: true, enumerable: true, writable: true,
  });

  globalThis.MediaKeySession = TestSession;
  globalThis.MediaKeys = TestMediaKeys;
  globalThis.MediaKeySystemAccess = TestAccess;
  globalThis.navigator = new TestNavigator();
  globalThis.nativeAccess = new TestAccess();
  globalThis.nativeKeys = new TestMediaKeys();
  globalThis.nativeSession = new TestSession();
  globalThis.nativeRequestPromise = Promise.resolve(nativeAccess);
  globalThis.nativeMediaKeysPromise = Promise.resolve(nativeKeys);
  globalThis.inputMarker = {marker: 'request'};
  globalThis.sessionMarker = {marker: 'session'};
`, context);

const checkpointStartedAt = Date.now();
vm.runInContext(source, context);
const modeStartCheckpoint = JSON.parse(localStorage.getItem(CHECKPOINT_KEY));
assert.equal(modeStartCheckpoint.version, SCRIPT_VERSION, 'mode-start checkpoint records the current script version');
assert.equal(modeStartCheckpoint.mode, MODE, 'mode-start checkpoint records the selected SDK PlayReady mode');
const modeStartStep = modeStartCheckpoint.steps.find(({phase}) => phase === 'test-start');
assert.ok(modeStartStep, 'mode-start checkpoint records test-start');
assert.ok(Number.isSafeInteger(modeStartStep.time)
  && modeStartStep.time >= checkpointStartedAt - 1000
  && modeStartStep.time <= Date.now(), 'mode-start checkpoint time is bounded to this document');
const planRealm = vm.createContext({URL, __DP4K_TEST__: true});
vm.runInContext(source, planRealm);
vm.runInContext(`globalThis.makeFlowConfig = function makeFlowConfig(identifier = 'required') {
  const value = ${JSON.stringify(FLOW_CONFIG)};
  value.distinctiveIdentifier = identifier;
  value.marker = {keep: true};
  return value;
};`, planRealm);
const api = planRealm.__DP4K_INTERNALS__;
assert.equal(api.TEST_TICKET_KEY, TICKET_KEY, 'runtime fixture targets the current one-shot ticket');
assert.equal(sessionStorage.getItem(TICKET_KEY), null, 'the current ticket is consumed before EME use');
assert.equal(localStorage.getItem(STORAGE_KEY), 'original', 'SDK PlayReady mode is never persisted as restart mode');

const fromRealmJson = (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
const fromPlanRealmJson = (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, planRealm));
if (IS_UHD) {
  const preApplicationRequestCount = vm.runInContext('nativeRequestCalls.length', context);
  const preApplicationEme = vm.runInContext(`globalThis.preApplicationEme = navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{}]); preApplicationEme`, context);
  assert.equal(vm.runInContext('preApplicationEme instanceof Promise', context), true,
    'UHD pre-application EME gate rejects through a Promise');
  await assert.rejects(preApplicationEme, error => error?.name === 'AbortError',
    'UHD pre-application native EME is stopped');
  assert.equal(vm.runInContext('nativeRequestCalls.length', context), preApplicationRequestCount,
    'UHD pre-application EME never reaches native EME');
  vm.runInContext(`document.currentScript = {src: ${JSON.stringify(PLAYBACK_SESSION_URL)}}; globalThis['playback-session'] = sdkSessionExport;`, context);
  await vm.runInContext(`sdkInstance.createPlaybackSession({clientParameters:{configOverrides:{'hive-dmp':{engine:{}}}}})`, context);
  assert.equal(vm.runInContext('sdkCalls.length', context), 1,
    'UHD SDK service is created once after the session namespace is published');
  assert.equal(vm.runInContext('sdkSessionCalls.length', context), 1,
    'UHD SDK service constructs one playback session');
  assert.deepEqual(fromRealmJson(`(() => {
    const call = sdkSessionCalls[0];
    return {
      nativeThis: call.thisValue instanceof sdkNativeSession,
      argCount: call.args.length,
      marker: call.args[1].marker,
      playbackServiceVersion: call.args[0].playbackServiceVersion,
      videoResolutions: call.args[0].mediaCapabilities.videoResolutions,
      audioResolutions: call.args[0].mediaCapabilities.audioResolutions,
    };
  })()`), {
    nativeThis: true,
    argCount: 2,
    marker: 'native-session',
    playbackServiceVersion: '26.10.0-jasmine',
    videoResolutions: ['SD', 'HD', 'FHD', 'UHD'],
    audioResolutions: ['STEREO', '5.1'],
  }, 'UHD SDK constructor receives the per-session UHD policy copy');
}
const expectedModePlan = IS_UHD ? {
  label: MODE === MODE_UHD ? '4K HDR10（SDKのPlayReady選択）' : '4K HEVC・HDR要求なし（SDKのPlayReady選択）',
  scenario: MODE === MODE_UHD ? 'tv-drm-ctr-h265-hdr10-atmos' : 'tv-drm-ctr-h265-atmos',
  resolution: '3840x2160',
  sdkMaxHeight: 2160,
  sdkRecommendationFlow: true,
  sdkUhdPolicy: true,
} : {
  label: '1080p HEVC（SDKのPlayReady選択）',
  scenario: 'tv-drm-ctr-h265-atmos',
  resolution: '1920x1080',
  sdkMaxHeight: 1080,
  sdkRecommendationFlow: true,
};
assert.deepEqual(fromPlanRealmJson(`__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(MODE)}]`), expectedModePlan,
  `${MODE}: selected SDK PlayReady mode plan is exact`);
const makeFlowConfig = (distinctiveIdentifier = 'required') => {
  const config = JSON.parse(JSON.stringify(FLOW_CONFIG));
  config.distinctiveIdentifier = distinctiveIdentifier;
  config.marker = {keep: true};
  return config;
};

// The direct planner must alter only the DI policy for the three public
// PlayReady candidate strings, preserving the caller's realm/object graph.
for (const keySystem of PLAYREADY_IDS) {
  const result = fromPlanRealmJson(`(() => {
    const configurations = [${JSON.stringify(makeFlowConfig())}];
    const before = JSON.stringify(configurations);
    const planned = __DP4K_INTERNALS__.planEmeRequest(${JSON.stringify(keySystem)}, configurations, ${JSON.stringify(MODE)});
    return {
      changed: planned.changed,
      blocked: planned.blocked === true,
      keySystem: planned.keySystem,
      sameArray: planned.configurations === configurations,
      source: JSON.stringify(configurations),
      before,
      planned: planned.configurations,
    };
  })()`);
  const expected = makeFlowConfig('not-allowed');
  assert.equal(result.changed, true, `${keySystem}: SDK PlayReady mode constrains DI`);
  assert.equal(result.blocked, false, `${keySystem}: valid config is not blocked`);
  assert.equal(result.keySystem, keySystem, `${keySystem}: key string is unchanged`);
  assert.equal(result.sameArray, false, `${keySystem}: DI constraint uses a copied configuration array`);
  assert.equal(result.source, result.before, `${keySystem}: source configuration remains unchanged`);
  assert.deepEqual(result.planned, [expected], `${keySystem}: only DI changes in the forwarded configuration`);
}

vm.runInContext(`globalThis.unchangedConfig = {
  initDataTypes: ['cenc'], sessionTypes: ['temporary'], persistentState: 'not-allowed',
  distinctiveIdentifier: 'not-allowed', videoCapabilities: [{contentType: 'video/mp4'}],
};`, planRealm);
for (const [label, keySystem, mode] of [
  ['Widevine', 'com.widevine.alpha', MODE],
  ['existing native-cap PlayReady', PLAYREADY_IDS[0], NATIVE_CAP_MODE],
]) {
  const result = fromPlanRealmJson(`(() => {
    const configurations = [unchangedConfig];
    const planned = __DP4K_INTERNALS__.planEmeRequest(${JSON.stringify(keySystem)}, configurations, ${JSON.stringify(mode)});
    return {changed: planned.changed, blocked: planned.blocked === true, keySystem: planned.keySystem,
      sameArray: planned.configurations === configurations};
  })()`);
  assert.equal(result.changed, false, `${label}: EME input is unchanged`);
  assert.notEqual(result.blocked, true, `${label}: unchanged input is not blocked`);
  assert.equal(result.keySystem, keySystem, `${label}: key string is unchanged`);
  assert.equal(result.sameArray, true, `${label}: configuration array identity is unchanged`);
}

const invalidConfigCases = [
  ['null configurations', 'null'],
  ['object configurations', '({})'],
  ['empty configurations', '[]'],
  ['null configuration', '[null]'],
  ['configuration array', '[[]]'],
  ['configuration class instance', '[new (class Config {})()]'],
  ['configuration hole', '(() => { const value = []; value.length = 1; return value; })()'],
  ['oversized configurations', 'Array.from({length:17}, () => makeFlowConfig())'],
  ['index accessor', '(() => { const value = [makeFlowConfig()]; let calls = 0; Object.defineProperty(value, \'0\', {get() { calls++; return makeFlowConfig(); }}); value.getterCalls = () => calls; return value; })()'],
  ['DI accessor', '(() => { const value = [makeFlowConfig()]; let calls = 0; Object.defineProperty(value[0], \'distinctiveIdentifier\', {get() { calls += 1; return \'required\'; }, configurable: true}); value.getterCalls = () => calls; return value; })()'],
  ['configuration symbol accessor', '(() => { const value = [makeFlowConfig()]; Object.defineProperty(value[0], Symbol(\'accessor\'), {get() { return true; }, configurable: true}); return value; })()'],
];
for (const [label, expression] of invalidConfigCases) {
  const result = fromPlanRealmJson(`(() => {
    const configurations = (${expression});
    const fingerprint = (value) => {
      if (value === null || typeof value !== 'object') return String(value);
      return Reflect.ownKeys(value).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return [String(key), descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
          ? typeof descriptor.value : 'accessor'];
      });
    };
    const before = fingerprint(configurations);
    const planned = __DP4K_INTERNALS__.planEmeRequest(${JSON.stringify(PLAYREADY_IDS[0])}, configurations, ${JSON.stringify(MODE)});
    return {
      changed: planned.changed,
      blocked: planned.blocked === true,
      same: planned.configurations === configurations,
      before,
      after: fingerprint(configurations),
      getterCalls: configurations?.getterCalls ? configurations.getterCalls() : 0,
    };
  })()`);
  assert.deepEqual(result, {
    changed: false,
    blocked: true,
    same: true,
    before: result.before,
    after: result.before,
    getterCalls: 0,
  }, `${label}: unknown config fails closed without reading or mutating it`);
}

const allowedPhases = new Set([
  'test-start', 'cdm-create-start', 'cdm-create-ok', 'cdm-attach-ok', 'cdm-detach',
  'session-event', 'keys-pending', 'keys-usable', 'keys-other', 'media-error',
  'generateRequest-start', 'generateRequest-ok', 'update-start', 'update-ok',
  'video-metadata', 'video-playing', 'video-waiting-for-key', 'page-exit',
]);
const makeInputConfigExpression = (identifier = 'required') => `(() => {
  const value = ${JSON.stringify(makeFlowConfig(identifier))};
  return [value];
})()`;

// Runtime wrapper: each candidate keeps its input key/policy fields, while
// only distinctiveIdentifier is constrained before the native request.
const runtimeShapes = [];
for (const keySystem of PLAYREADY_IDS) {
  const expression = `(() => {
    const configurations = ${makeInputConfigExpression()};
    const before = JSON.stringify(configurations);
    globalThis.nativeRequestPromise = Promise.resolve(nativeAccess);
    globalThis.runtimeInput = configurations;
    globalThis.runtimeBefore = before;
    globalThis.requestResult = navigator.requestMediaKeySystemAccess(${JSON.stringify(keySystem)}, configurations, inputMarker);
    return requestResult;
  })()`;
  const returned = vm.runInContext(expression, context);
  assert.equal(vm.runInContext('requestResult === nativeRequestPromise', context), true,
    `${keySystem}: native request Promise identity is preserved`);
  await returned;
  const observed = fromRealmJson(`(() => {
    const call = nativeRequestCalls.at(-1);
    const configuration = call.args[1][0];
    return {
      nativeThis: call.thisValue === navigator,
      argCount: call.args.length,
      keySystem: call.args[0],
      configurationsCopied: call.args[1] !== runtimeInput,
      markerSame: call.args[2] === inputMarker,
      initDataTypes: configuration.initDataTypes,
      sessionTypes: configuration.sessionTypes,
      persistentState: configuration.persistentState,
      distinctiveIdentifier: configuration.distinctiveIdentifier,
      videoRobustness: configuration.videoCapabilities[0].robustness,
      audioRobustness: configuration.audioCapabilities[0].robustness,
      sourceUnchanged: JSON.stringify(runtimeInput) === runtimeBefore,
    };
  })()`);
  runtimeShapes.push(observed);
}
for (const [keySystem, observed] of PLAYREADY_IDS.map((keySystem, index) => [keySystem, runtimeShapes[index]])) {
  assert.deepEqual(observed, {
    nativeThis: true,
    argCount: 3,
    keySystem,
    configurationsCopied: true,
    markerSame: true,
    initDataTypes: ['cenc'],
    sessionTypes: ['temporary', 'persistent-license'],
    persistentState: 'optional',
    distinctiveIdentifier: 'not-allowed',
    videoRobustness: '2000',
    audioRobustness: '3000',
    sourceUnchanged: true,
  }, `${keySystem}: runtime changes DI only`);
}

// The ordinary key-system path remains fully native.
vm.runInContext(`(() => {
  const configurations = ${makeInputConfigExpression('not-allowed')};
  globalThis.widevineInput = configurations;
  globalThis.widevineBefore = JSON.stringify(configurations);
  globalThis.nativeRequestPromise = Promise.resolve(nativeAccess);
  globalThis.widevineResult = navigator.requestMediaKeySystemAccess('com.widevine.alpha', configurations, inputMarker);
})()`, context);
assert.equal(vm.runInContext('widevineResult === nativeRequestPromise', context), true,
  'Widevine request Promise identity is preserved');
await vm.runInContext('widevineResult', context);
const widevineObserved = fromRealmJson(`(() => {
  const call = nativeRequestCalls.at(-1);
  return {
    nativeThis: call.thisValue === navigator,
    keySystem: call.args[0],
    configurationsSame: call.args[1] === widevineInput,
    markerSame: call.args[2] === inputMarker,
    sourceUnchanged: JSON.stringify(widevineInput) === widevineBefore,
  };
})()`);
assert.deepEqual(widevineObserved, {
  nativeThis: true,
  keySystem: 'com.widevine.alpha',
  configurationsSame: true,
  markerSame: true,
  sourceUnchanged: true,
}, 'Widevine remains untouched');

// Native SDK PlayReady flow uses the persistent session type it was given;
// this helper does not rewrite createSession arguments or native returns.
// Re-select a PlayReady access: the preceding isolation test used Widevine.
await vm.runInContext(`navigator.requestMediaKeySystemAccess(${JSON.stringify(PLAYREADY_IDS[0])}, [makeFlowConfig()])`, context);
assert.equal(vm.runInContext('nativeAccess.keySystem', context), PLAYREADY_IDS[0], 'session checks use actual PlayReady metadata');
vm.runInContext(`globalThis.mediaKeysResult = nativeAccess.createMediaKeys({marker:'media-keys'});`, context);
assert.equal(vm.runInContext('mediaKeysResult === nativeMediaKeysPromise', context), true,
  'createMediaKeys Promise identity is preserved');
await vm.runInContext('mediaKeysResult', context);
vm.runInContext('globalThis.keys = nativeKeys;', context);
vm.runInContext('globalThis.sessionResult = keys.createSession(\'persistent-license\', sessionMarker);', context);
const sessionObserved = fromRealmJson(`(() => {
  const call = nativeCreateSessionCalls.at(-1);
  return {nativeThis: call.thisValue === keys, argCount: call.args.length, first: call.args[0], markerSame: call.args[1] === sessionMarker,
    resultSame: sessionResult === nativeSession};
})()`);
assert.deepEqual(sessionObserved, {
  nativeThis: true,
  argCount: 2,
  first: 'persistent-license',
  markerSame: true,
  resultSame: true,
}, 'persistent-license createSession arguments and native return are preserved');

assert.equal(vm.runInContext(`(() => {
  const variants = [[], [undefined], ['temporary'], ['persistent-license'], ['invalid-type'], ['temporary', sessionMarker]];
  return variants.every(args => {
    const result = Reflect.apply(keys.createSession, keys, args);
    const call = nativeCreateSessionCalls.at(-1);
    return result === nativeSession && call.thisValue === keys && call.args.length === args.length
      && args.every((value, index) => call.args[index] === value);
  });
})()`, context), true, 'SDK mode preserves omitted/undefined/temporary/persistent/invalid and extra session arguments');

// A non-enumerable data field is still a WebIDL dictionary member. Keep its
// descriptor/value instead of dropping it through object spread.
assert.equal(vm.runInContext(`(() => {
  const input = Object.assign(Object.create(null), makeFlowConfig());
  const marker = Symbol('kept');
  Object.defineProperty(input, 'sessionTypes', {value:['persistent-license'], enumerable:false, configurable:false, writable:false});
  Object.defineProperty(input, marker, {value:{keep:true}, enumerable:false});
  Object.freeze(input);
  const result = navigator.requestMediaKeySystemAccess(${JSON.stringify(PLAYREADY_IDS[0])}, [input]);
  const output = nativeRequestCalls.at(-1).args[1][0];
  return result === nativeRequestPromise && Object.getPrototypeOf(output) === null
    && input.distinctiveIdentifier === 'required' && output.distinctiveIdentifier === 'not-allowed'
    && Reflect.ownKeys(input).every(key => {
      const before = Object.getOwnPropertyDescriptor(input, key);
      const after = Object.getOwnPropertyDescriptor(output, key);
      return before.enumerable === after.enumerable && before.configurable === after.configurable
        && before.writable === after.writable
        && (key === 'distinctiveIdentifier' || before.value === after.value);
    });
})()`, context), true, 'DI-only copying preserves frozen/non-enumerable/symbol fields and nested references');

const nativeThrown = vm.runInContext("globalThis.nativeRequestError = new TypeError('native EME failure')", context);
assert.throws(() => vm.runInContext(`navigator.requestMediaKeySystemAccess(${JSON.stringify(PLAYREADY_IDS[0])}, [makeFlowConfig()])`, context),
  error => error === nativeThrown, 'native EME synchronous exception identity is preserved');
vm.runInContext('nativeRequestError = null', context);
const nativeRejected = vm.runInContext("globalThis.nativeRejection = new DOMException('native refusal', 'NotSupportedError'); nativeRequestPromise = Promise.reject(nativeRejection); globalThis.rejectedResult = navigator.requestMediaKeySystemAccess('com.microsoft.playready', [makeFlowConfig()]); rejectedResult", context);
assert.equal(vm.runInContext('rejectedResult === nativeRequestPromise', context), true, 'native rejected Promise identity is preserved');
await assert.rejects(nativeRejected, error => error === context.nativeRejection, 'native rejection reason is preserved');
vm.runInContext('nativeRequestPromise = Promise.resolve(nativeAccess)', context);
const sessionThrown = vm.runInContext("globalThis.nativeSessionError = new TypeError('native session failure')", context);
assert.throws(() => vm.runInContext("keys.createSession('invalid-type')", context), error => error === sessionThrown,
  'native createSession exception identity is preserved');
vm.runInContext('nativeSessionError = null', context);

// Unsupported shapes are rejected as a Promise before native EME is reached.
const requestCountBeforeBlocked = vm.runInContext('nativeRequestCalls.length', context);
vm.runInContext(`(() => {
  const configurations = [makeFlowConfig()];
  let getterCalls = 0;
  Object.defineProperty(configurations[0], 'distinctiveIdentifier', {
    get() { getterCalls += 1; return 'required'; }, configurable: true,
  });
  globalThis.blockedGetterCalls = () => getterCalls;
  globalThis.blockedResult = navigator.requestMediaKeySystemAccess(${JSON.stringify(PLAYREADY_IDS[0])}, configurations, inputMarker);
})()`, context);
assert.equal(vm.runInContext('blockedResult instanceof Promise', context), true,
  'unknown DI accessor is rejected as a Promise');
await assert.rejects(vm.runInContext('blockedResult', context), (error) => error?.name === 'NotSupportedError',
  'unknown DI accessor rejects with NotSupportedError');
assert.equal(vm.runInContext('blockedGetterCalls()', context), 0, 'blocked DI accessor is never invoked');
assert.equal(vm.runInContext('nativeRequestCalls.length', context), requestCountBeforeBlocked,
  'blocked config never reaches native requestMediaKeySystemAccess');

vm.runInContext(`(() => {
  const configurations = [];
  configurations.length = 1;
  globalThis.blockedHoleResult = navigator.requestMediaKeySystemAccess(${JSON.stringify(PLAYREADY_IDS[1])}, configurations);
})()`, context);
await assert.rejects(vm.runInContext('blockedHoleResult', context), (error) => error?.name === 'NotSupportedError',
  'configuration hole rejects with NotSupportedError');
assert.equal(vm.runInContext('nativeRequestCalls.length', context), requestCountBeforeBlocked,
  'configuration hole never reaches native requestMediaKeySystemAccess');

const checkpointRaw = localStorage.getItem(CHECKPOINT_KEY);
assert.notEqual(checkpointRaw, null, 'the experimental checkpoint is written');
const checkpoint = JSON.parse(checkpointRaw);
assert.deepEqual(Object.keys(checkpoint).sort(), ['mode', 'steps', 'version'],
  'checkpoint contains only version/mode/stages');
assert.equal(checkpoint.version, SCRIPT_VERSION, 'checkpoint version matches the script');
assert.equal(checkpoint.mode, MODE, 'checkpoint proves this SDK PlayReady mode started');
assert.ok(Array.isArray(checkpoint.steps) && checkpoint.steps.length > 0 && checkpoint.steps.length <= 8,
  'checkpoint is a bounded stage tail');
const checkpointCheckedAt = Date.now();
for (const step of checkpoint.steps) {
  assert.deepEqual(Object.keys(step).sort(), ['phase', 'time'], 'checkpoint stage has only phase/time');
  assert.equal(allowedPhases.has(step.phase), true, `checkpoint phase is allowlisted: ${step.phase}`);
  assert.equal(Number.isSafeInteger(step.time), true, 'checkpoint time is a safe integer');
  assert.ok(step.time >= checkpointStartedAt - 1000 && step.time <= checkpointCheckedAt,
    'checkpoint time is limited to this document');
}
assert.equal(checkpoint.steps.some(({phase}) => phase === 'session-event'), true,
  'checkpoint records the native persistent session event');
console.log(`SDK PlayReady flow (${MODE}): three PlayReady candidates constrain DI only; native EME/session identity, unsupported-shape rejection, non-PlayReady isolation, and one-document checkpoint passed`);
