import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const MODE_HDR10 = '4k-hdr10-sdk-playready';
const MODE_SDR = '4k-hevc-sdk-playready';
const SDK_MODE = process.argv[2] ?? MODE_HDR10;
assert.ok([MODE_HDR10, MODE_SDR].includes(SDK_MODE),
  `usage: node tests/test-sdk-resolution-policy.mjs <${MODE_HDR10}|${MODE_SDR}>`);
const SDK_VERSION = '26.10.0-jasmine';
const SCRIPT_VERSION = '0.5.1';
const TICKET_KEY = `ioridev.disneyplus4k.once.v${SCRIPT_VERSION}`;
const DOCUMENT_URL = 'https://www.disneyplus.com/ja-jp/play/sdk-resolution-policy-test';
const PLAYBACK_SCENARIO = SDK_MODE === MODE_HDR10 ? 'tv-drm-ctr-h265-hdr10-atmos' : 'tv-drm-ctr-h265-atmos';
const PLAYBACK_URL = `https://disney.playback.edge.bamgrid.com/v7/playback/${PLAYBACK_SCENARIO}`;
const SESSION_SDK_URL = `https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/${SDK_VERSION}/all_browser_es6/playback-session.js`;

const makeStorage = (entries = []) => {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const planRealm = vm.createContext({URL, __DP4K_TEST__: true});
vm.runInContext(source, planRealm);
const planApi = planRealm.__DP4K_INTERNALS__;
const jsonIn = (realm, expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, realm));

assert.equal(planApi.MODE_PLANS[SDK_MODE].sdkUhdPolicy, true, 'the UHD SDK mode exposes the resolution policy');
assert.equal(planApi.MODE_PLANS[SDK_MODE].sdkMaxHeight, 2160, 'the UHD SDK mode keeps the 2160 cap');

{
  const result = jsonIn(planRealm, `(() => {
    const drm = {keySystem: 'com.microsoft.playready', robustness: 'SW_SECURE_DECODE'};
    const nested = {keep: true};
    const options = {
      playbackServiceVersion: ${JSON.stringify(SDK_VERSION)},
      mediaCapabilities: {videoResolutions: ['SD', 'HD', 'FHD'], drm, nested},
      unrelated: {keep: 'root'},
    };
    const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, ${JSON.stringify(SDK_MODE)});
    return {
      changed: output.changed,
      valid: output.valid,
      before: output.before,
      after: output.after,
      rootCopied: output.options !== options,
      capabilityCopied: output.options.mediaCapabilities !== options.mediaCapabilities,
      resolutionsCopied: output.options.mediaCapabilities.videoResolutions !== options.mediaCapabilities.videoResolutions,
      drmPreserved: output.options.mediaCapabilities.drm === drm,
      nestedPreserved: output.options.mediaCapabilities.nested === nested,
      unrelatedPreserved: output.options.unrelated === options.unrelated,
      source: options.mediaCapabilities.videoResolutions,
      planned: output.options.mediaCapabilities.videoResolutions,
      sourceDmr: options.mediaCapabilities.drm,
      plannedDmr: output.options.mediaCapabilities.drm,
    };
  })()`);
  assert.deepEqual(result, {
    changed: true,
    valid: true,
    before: ['SD', 'HD', 'FHD'],
    after: ['SD', 'HD', 'FHD', 'UHD'],
    rootCopied: true,
    capabilityCopied: true,
    resolutionsCopied: true,
    drmPreserved: true,
    nestedPreserved: true,
    unrelatedPreserved: true,
    source: ['SD', 'HD', 'FHD'],
    planned: ['SD', 'HD', 'FHD', 'UHD'],
    sourceDmr: {keySystem: 'com.microsoft.playready', robustness: 'SW_SECURE_DECODE'},
    plannedDmr: {keySystem: 'com.microsoft.playready', robustness: 'SW_SECURE_DECODE'},
  }, 'planSdkResolutionPolicy appends UHD only to a session copy and preserves native DRM data');
}

{
  const result = jsonIn(planRealm, `(() => {
    const options = {playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}, mediaCapabilities: {
      videoResolutions: ['SD', 'HD', 'FHD', 'UHD'],
    }};
    const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, ${JSON.stringify(SDK_MODE)});
    return {same: output.options === options, changed: output.changed, valid: output.valid,
      before: output.before, after: output.after,
      count: output.options.mediaCapabilities.videoResolutions.filter((value) => value === 'UHD').length};
  })()`);
  assert.deepEqual(result, {
    same: true, changed: false, valid: true,
    before: ['SD', 'HD', 'FHD', 'UHD'], after: ['SD', 'HD', 'FHD', 'UHD'], count: 1,
  }, 'an already-UHD list is valid and receives no duplicate or copy');
}

{
  const result = jsonIn(planRealm, `(() => {
    const symbol = Symbol('private-data');
    const drm = Object.freeze({keySystem: 'com.microsoft.playready', persistentState: 'optional'});
    const capabilities = Object.create(null);
    Object.defineProperty(capabilities, 'videoResolutions', {
      value: Object.freeze(['SD', 'HD', 'FHD']), enumerable: false, writable: false, configurable: false,
    });
    Object.defineProperty(capabilities, 'drm', {
      value: drm, enumerable: false, writable: false, configurable: false,
    });
    Object.defineProperty(capabilities, symbol, {
      value: {secret: true}, enumerable: false, writable: false, configurable: false,
    });
    Object.freeze(capabilities);
    const options = Object.create(null);
    Object.defineProperty(options, 'playbackServiceVersion', {
      value: ${JSON.stringify(SDK_VERSION)}, enumerable: false, writable: false, configurable: false,
    });
    Object.defineProperty(options, 'mediaCapabilities', {
      value: capabilities, enumerable: false, writable: false, configurable: false,
    });
    Object.defineProperty(options, symbol, {
      value: {rootSecret: true}, enumerable: false, writable: false, configurable: false,
    });
    Object.freeze(options);
    const sourceOptionDescriptor = Object.getOwnPropertyDescriptor(options, 'mediaCapabilities');
    const sourceCapabilityDescriptor = Object.getOwnPropertyDescriptor(capabilities, 'videoResolutions');
    const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, ${JSON.stringify(SDK_MODE)});
    const outputOptionDescriptor = Object.getOwnPropertyDescriptor(output.options, 'mediaCapabilities');
    const outputCapabilityDescriptor = Object.getOwnPropertyDescriptor(output.options.mediaCapabilities, 'videoResolutions');
    const symbols = Object.getOwnPropertySymbols(output.options);
    const capabilitySymbols = Object.getOwnPropertySymbols(output.options.mediaCapabilities);
    return {
      changed: output.changed, valid: output.valid,
      rootProto: Object.getPrototypeOf(output.options) === null,
      capabilityProto: Object.getPrototypeOf(output.options.mediaCapabilities) === null,
      sourceFrozen: Object.isFrozen(options) && Object.isFrozen(capabilities) && Object.isFrozen(capabilities.videoResolutions),
      rootDescriptor: [outputOptionDescriptor.enumerable, outputOptionDescriptor.writable, outputOptionDescriptor.configurable],
      sourceRootDescriptor: [sourceOptionDescriptor.enumerable, sourceOptionDescriptor.writable, sourceOptionDescriptor.configurable],
      capabilityDescriptor: [outputCapabilityDescriptor.enumerable, outputCapabilityDescriptor.writable, outputCapabilityDescriptor.configurable],
      sourceCapabilityDescriptor: [sourceCapabilityDescriptor.enumerable, sourceCapabilityDescriptor.writable, sourceCapabilityDescriptor.configurable],
      rootSymbolPreserved: symbols.length === 1 && output.options[symbol].rootSecret === true,
      capabilitySymbolPreserved: capabilitySymbols.length === 1 && output.options.mediaCapabilities[symbol].secret === true,
      drmPreserved: output.options.mediaCapabilities.drm === drm,
      values: output.options.mediaCapabilities.videoResolutions,
    };
  })()`);
  assert.deepEqual(result, {
    changed: true, valid: true, rootProto: true, capabilityProto: true, sourceFrozen: true,
    rootDescriptor: [false, false, false], sourceRootDescriptor: [false, false, false],
    capabilityDescriptor: [false, false, false], sourceCapabilityDescriptor: [false, false, false],
    rootSymbolPreserved: true, capabilitySymbolPreserved: true, drmPreserved: true,
    values: ['SD', 'HD', 'FHD', 'UHD'],
  }, 'frozen null-prototype records retain descriptors, symbols, and unrelated references');
}

for (const expression of [
  `Object.create(class C {}.prototype)`,
  `new (class C {})()`,
  `null`,
  `[]`,
  `42`,
  `undefined`,
]) {
  const result = vm.runInContext(
    `(() => { const value = ${expression}; const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(value, ${JSON.stringify(SDK_MODE)}); return [output.options === value, output.changed, output.valid]; })()`,
    planRealm,
  );
  assert.deepEqual([...result], [true, false, false], `class/null/array/non-record option ${expression} fails closed`);
}

{
  const getterResults = jsonIn(planRealm, `(() => {
    const results = [];
    let optionCalls = 0;
    const optionGetter = {};
    Object.defineProperty(optionGetter, 'playbackServiceVersion', {get() { optionCalls += 1; return ${JSON.stringify(SDK_VERSION)}; }});
    Object.defineProperty(optionGetter, 'mediaCapabilities', {value: {videoResolutions: ['SD', 'HD', 'FHD']}});
    const optionResult = __DP4K_INTERNALS__.planSdkResolutionPolicy(optionGetter, ${JSON.stringify(SDK_MODE)});
    results.push({same: optionResult.options === optionGetter, valid: optionResult.valid, calls: optionCalls});

    let capabilityCalls = 0;
    const capabilityGetter = {playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}};
    Object.defineProperty(capabilityGetter, 'mediaCapabilities', {value: {get videoResolutions() {
      capabilityCalls += 1; return ['SD', 'HD', 'FHD'];
    }}});
    const capabilityResult = __DP4K_INTERNALS__.planSdkResolutionPolicy(capabilityGetter, ${JSON.stringify(SDK_MODE)});
    results.push({same: capabilityResult.options === capabilityGetter, valid: capabilityResult.valid, calls: capabilityCalls});

    let indexCalls = 0;
    const values = ['SD', 'HD', 'FHD'];
    Object.defineProperty(values, '1', {get() { indexCalls += 1; return 'HD'; }, configurable: true});
    const indexOptions = {playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}, mediaCapabilities: {videoResolutions: values}};
    const indexResult = __DP4K_INTERNALS__.planSdkResolutionPolicy(indexOptions, ${JSON.stringify(SDK_MODE)});
    results.push({same: indexResult.options === indexOptions, valid: indexResult.valid, calls: indexCalls});
    return results;
  })()`);
  assert.deepEqual(getterResults, [
    {same: true, valid: false, calls: 0},
    {same: true, valid: false, calls: 0},
    {same: true, valid: false, calls: 0},
  ], 'accessor records and resolution entries are rejected without invoking getters');
}

const invalidLists = [
  {label: 'unknown enum', expression: `['SD', 'HD', 'FHD', '8K']`},
  {label: 'hole', expression: `['SD', 'HD', , 'FHD']`},
  {label: 'duplicate', expression: `['SD', 'HD', 'FHD', 'FHD']`},
  {label: 'extra key', expression: `(() => { const value = ['SD', 'HD', 'FHD']; value.extra = 'unexpected'; return value; })()`},
  {label: 'extra symbol', expression: `(() => { const value = ['SD', 'HD', 'FHD']; value[Symbol('extra')] = true; return value; })()`},
  {label: 'empty', expression: `[]`},
  {label: 'oversized', expression: `Array.from({length: 17}, () => 'FHD')`},
  {label: 'without required FHD', expression: `['SD', 'HD']`},
];
for (const {label, expression} of invalidLists) {
  const result = vm.runInContext(
    `(() => { const values = ${expression}; const options = {playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}, mediaCapabilities: {videoResolutions: values}}; const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, ${JSON.stringify(SDK_MODE)}); return [output.options === options, output.changed, output.valid]; })()`,
    planRealm,
  );
  assert.deepEqual([...result], [true, false, false], `${label} resolution list is rejected unchanged`);
}

{
  const result = vm.runInContext(
    `(() => { const options = {playbackServiceVersion: '26.10.0-other', mediaCapabilities: {videoResolutions: ['SD', 'HD', 'FHD']}}; const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, ${JSON.stringify(SDK_MODE)}); return [output.options === options, output.changed, output.valid]; })()`,
    planRealm,
  );
  assert.deepEqual([...result], [true, false, false], 'known SDK version mismatch fails closed');
}

{
  const result = vm.runInContext(
    `(() => { const options = {playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}, mediaCapabilities: {videoResolutions: ['SD', 'HD', 'FHD']}}; const output = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, 'original'); return [output.options === options, output.changed, output.valid]; })()`,
    planRealm,
  );
  assert.deepEqual([...result], [true, false, false], 'non-UHD-policy modes remain untouched');
}

const makeOverlayDocument = () => {
  const events = new Map();
  const nodes = new Map();
  const node = (name) => {
    const value = {
      name,
      textContent: '',
      hidden: false,
      disabled: false,
      value: SDK_MODE,
      dataset: {},
      style: {},
      classList: {
        contains: () => false,
        toggle: () => {},
      },
      addEventListener: (event, callback) => events.set(`${name}:${event}`, callback),
    };
    nodes.set(name, value);
    return value;
  };
  const selectors = ['.panel', '.mode', '.guard', '.request', '.actual', '.progress', '.manifest', '.drm',
    '.active-cdm', '.codec', '.note', '.error', '.environment', '.trace', '.check', '.collapse', '.copy'];
  const shadow = {
    set innerHTML(_value) {},
    querySelector: (selector) => nodes.get(selector) || node(selector),
  };
  for (const selector of selectors) node(selector);
  const host = {
    id: '',
    style: {},
    attachShadow: () => shadow,
  };
  return {
    document: {
      currentScript: null,
      documentElement: {appendChild: () => {}},
      createElement: () => host,
      querySelectorAll: () => [],
    },
    events,
  };
};

const createRuntime = ({
  preloadSession = false,
  preloadService = false,
  sessionKind = 'accessor',
  documentElement = false,
  eme = 'valid',
} = {}) => {
  const callbacks = new Map();
  const localStorage = makeStorage([['ioridev.disneyplus4k.mode.v1', SDK_MODE]]);
  const sessionStorage = makeStorage([[
    TICKET_KEY,
    JSON.stringify({version: SCRIPT_VERSION, mode: SDK_MODE, documentUrl: DOCUMENT_URL, createdAt: Date.now() - 100}),
  ]]);
  const overlayDocument = documentElement ? makeOverlayDocument() : null;
  const fakeDocument = overlayDocument ? overlayDocument.document : {
    currentScript: null,
    documentElement: null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    URL,
    DOMException,
    console,
    localStorage,
    sessionStorage,
    performance: {getEntriesByType: () => [{type: 'reload'}]},
    location: {href: DOCUMENT_URL, pathname: '/ja-jp/play/sdk-resolution-policy-test', reload: () => {}},
    document: fakeDocument,
    MutationObserver: class {observe() {} disconnect() {}},
    addEventListener: (name, callback, capture) => callbacks.set(name, {callback, capture}),
    setInterval: () => 0,
    setTimeout: () => 0,
    navigator: {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    matchMedia: () => ({matches: false}),
  });
  vm.runInContext(`
    globalThis.nativeFetchCalls = [];
    globalThis.fetch = function nativeFetch(input, init) {
      nativeFetchCalls.push({thisValue: this, input, init});
      return Promise.resolve({url: String(input), status: 200, ok: true});
    };
    globalThis.nativeEmeCalls = [];
    class TestNavigator {
      requestMediaKeySystemAccess(...args) {
        nativeEmeCalls.push({thisValue: this, args});
        return Promise.resolve({keySystem: args[0], getConfiguration() { return args[1]?.[0]; }});
      }
    }
    ${eme === 'valid' ? `globalThis.navigator = new TestNavigator();` : ''}

    globalThis.nativeConstructorCalls = [];
    globalThis.nativeConstructorError = new Error('native PlaybackSession failure');
    class NativePlaybackSession {
      constructor(...args) {
        nativeConstructorCalls.push({thisValue: this, args, newTarget: new.target});
        if (args[0]?.throwNative) throw nativeConstructorError;
        this.nativeOptions = args[0];
        this.nativeArgs = args.slice(1);
      }
    }
    globalThis.NativePlaybackSession = NativePlaybackSession;
    globalThis.sessionGetterCalls = 0;
    globalThis.otherExportGetterCalls = 0;
    globalThis.sessionExport = {};
    ${sessionKind === 'accessor' || sessionKind === 'webpack-accessor'
      ? `Object.defineProperty(sessionExport, 'PlaybackSession', {
          get() { sessionGetterCalls += 1; return NativePlaybackSession; },
          enumerable: ${sessionKind === 'webpack-accessor' ? 'true' : 'false'},
          configurable: ${sessionKind === 'webpack-accessor' ? 'false' : 'true'},
        });`
      : `Object.defineProperty(sessionExport, 'PlaybackSession', {
          value: NativePlaybackSession, writable: false, enumerable: false, configurable: true,
        });`}
    Object.defineProperty(sessionExport, 'otherGetter', {
      get() { otherExportGetterCalls += 1; return 'must-not-read'; }, enumerable: true, configurable: true,
    });
    sessionExport.extra = {preserved: true};
    globalThis.sessionOriginalDescriptor = Object.getOwnPropertyDescriptor(sessionExport, 'PlaybackSession');
    globalThis.sessionExport = sessionExport;

    globalThis.sdkCalls = [];
    globalThis.sdkExpectedPromise = Promise.resolve({sdk: true});
    class TestPlaybackService {
      createPlaybackSession(...args) {
        sdkCalls.push({thisValue: this, args});
        return sdkExpectedPromise;
      }
    }
    Object.defineProperty(TestPlaybackService, 'version', {value: ${JSON.stringify(SDK_VERSION)}, configurable: true});
    globalThis.sdkNativeCreate = TestPlaybackService.prototype.createPlaybackSession;
    globalThis.sdkInstance = new TestPlaybackService();
    globalThis.sdkExport = {PlaybackService: TestPlaybackService};
    ${preloadSession ? `Object.defineProperty(globalThis, 'playback-session', {value: sessionExport, configurable: true, enumerable: true, writable: true});` : ''}
    ${preloadService ? `Object.defineProperty(globalThis, 'playback-service', {value: sdkExport, configurable: true, enumerable: true, writable: true});` : ''}
    globalThis.makeRuntimeOptions = function makeRuntimeOptions() {
      return {
        playbackServiceVersion: ${JSON.stringify(SDK_VERSION)},
        mediaCapabilities: {
          videoResolutions: ['SD', 'HD', 'FHD'],
          drm: {keySystem: 'com.microsoft.playready', robustness: 'SW_SECURE_DECODE'},
          other: {keep: true},
        },
        clientParameters: {configOverrides: {'hive-dmp': {engine: {keep: true}}}},
        nativeDrm: {keySystem: 'com.microsoft.playready', sessionType: 'temporary'},
      };
    };
    globalThis.makeUnknownConstructorOptions = function makeUnknownConstructorOptions() {
      return {playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}, mediaCapabilities: {videoResolutions: ['SD', 'HD']}};
    };
  `, context);
  vm.runInContext(source, context);
  const overlayEvents = overlayDocument ? overlayDocument.events : null;
  return {context, callbacks, localStorage, sessionStorage, overlayEvents};
};

const installService = (runtime) => vm.runInContext(`globalThis['playback-service'] = sdkExport;`, runtime.context);
const publishSession = (runtime, {src = SESSION_SDK_URL, exportExpression = 'sessionExport'} = {}) => {
  return vm.runInContext(`
    document.currentScript = {src: ${JSON.stringify(src)}};
    globalThis['playback-session'] = ${exportExpression};
    document.currentScript = null;
  `, runtime.context);
};
const runtimeJson = (runtime, expression) => jsonIn(runtime.context, expression);

const assertBlocked = async (runtime, label) => {
  const {context} = runtime;
  const fetchBefore = runtimeJson(runtime, 'nativeFetchCalls.length');
  const emeBefore = runtimeJson(runtime, 'nativeEmeCalls.length');
  await assert.rejects(
    vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method: 'POST', body: '{}'})`, context),
    (error) => error?.name === 'AbortError', `${label}: known playback POST is rejected`,
  );
  assert.equal(runtimeJson(runtime, 'nativeFetchCalls.length'), fetchBefore,
    `${label}: known playback POST never reaches native fetch`);
  await assert.rejects(
    vm.runInContext(`navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{initDataTypes:['cenc']}])`, context),
    (error) => error?.name === 'AbortError', `${label}: EME is rejected`,
  );
  assert.equal(runtimeJson(runtime, 'nativeEmeCalls.length'), emeBefore,
    `${label}: EME rejection never reaches native EME`);
};

const preparePublishedRuntime = async (options = {}) => {
  const runtime = createRuntime(options);
  installService(runtime);
  publishSession(runtime);
  await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  return runtime;
};

for (const sessionKind of ['accessor', 'data', 'webpack-accessor']) {
  const runtime = createRuntime({sessionKind});
  installService(runtime);
  publishSession(runtime);
  const published = runtimeJson(runtime, `(() => {
    const namespace = globalThis['playback-session'];
    const descriptor = Object.getOwnPropertyDescriptor(namespace, 'PlaybackSession');
    const original = Object.getOwnPropertyDescriptor(sessionExport, 'PlaybackSession');
    const saved = sessionOriginalDescriptor;
    const originalStable = original.enumerable === saved.enumerable
      && original.configurable === saved.configurable
      && (Object.prototype.hasOwnProperty.call(saved, 'value')
        ? Object.prototype.hasOwnProperty.call(original, 'value') && original.value === saved.value
        : !Object.prototype.hasOwnProperty.call(original, 'value') && original.get === saved.get
          && original.set === saved.set);
    return {
      namespaceCopy: namespace !== sessionExport,
      otherRef: namespace.extra === sessionExport.extra,
      otherGetterCalls: otherExportGetterCalls,
      originalGetterCalls: sessionGetterCalls,
      originalStable,
      originalKind: Object.prototype.hasOwnProperty.call(original, 'value') ? 'data' : 'accessor',
      originalFlags: [original.enumerable, original.configurable,
        Object.prototype.hasOwnProperty.call(original, 'value') ? original.writable : original.set],
      descriptor: {
        get: typeof descriptor.get === 'function',
        getIsOriginal: Boolean(descriptor.get)
          && descriptor.get === Object.getOwnPropertyDescriptor(sessionExport, 'PlaybackSession').get,
        valueIsProxy: Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value !== NativePlaybackSession,
        enumerable: descriptor.enumerable, configurable: descriptor.configurable,
        writable: descriptor.writable,
      },
      hookDescriptor: {value: Object.getOwnPropertyDescriptor(globalThis, 'playback-session').value === namespace},
    };
  })()`);
  assert.deepEqual(published, {
    namespaceCopy: true, otherRef: true, otherGetterCalls: 0,
    originalGetterCalls: sessionKind === 'accessor' || sessionKind === 'webpack-accessor' ? 1 : 0,
    originalStable: true,
    originalKind: sessionKind === 'data' ? 'data' : 'accessor',
    originalFlags: sessionKind === 'webpack-accessor' ? [true, false, null] : sessionKind === 'data' ? [false, true, false] : [false, true, null],
    descriptor: sessionKind === 'webpack-accessor'
      ? {get: true, getIsOriginal: false, valueIsProxy: false, enumerable: true, configurable: false}
      : sessionKind === 'accessor'
        ? {get: true, getIsOriginal: false, valueIsProxy: false, enumerable: false, configurable: true}
        : {get: false, getIsOriginal: false, valueIsProxy: true, enumerable: false, configurable: true, writable: false},
    hookDescriptor: {value: true},
  }, `${sessionKind} UMD export is copied while the original namespace and descriptor contract remain intact`);
  if (sessionKind === 'accessor' || sessionKind === 'webpack-accessor') {
    assert.equal(runtimeJson(runtime, 'sessionGetterCalls'), 1, 'reading the copied getter does not invoke the original getter again');
  }
}

{
  const runtime = await preparePublishedRuntime({sessionKind: 'accessor'});
  const result = runtimeJson(runtime, `(() => {
    const options = makeRuntimeOptions();
    const marker = {marker: true};
    class CustomNewTarget extends NativePlaybackSession {}
    const custom = Reflect.construct(globalThis['playback-session'].PlaybackSession,
      [options, marker, undefined], CustomNewTarget);
    const call = nativeConstructorCalls.at(-1);
    const nativeOptions = call.args[0];
    return {
      instance: custom,
      thisIsInstance: call.thisValue === custom,
      argsLength: call.args.length,
      markerSame: call.args[1] === marker,
      thirdUndefined: call.args.length === 3 && call.args[2] === undefined,
      newTargetSame: call.newTarget === CustomNewTarget,
      prototypeSame: Object.getPrototypeOf(custom) === CustomNewTarget.prototype,
      instanceOfNative: custom instanceof NativePlaybackSession,
      instanceOfCustom: custom instanceof CustomNewTarget,
      instanceOfProxy: custom instanceof globalThis['playback-session'].PlaybackSession,
      optionsCopied: nativeOptions !== options,
      uhdAdded: nativeOptions.mediaCapabilities.videoResolutions,
      sourceUnchanged: options.mediaCapabilities.videoResolutions,
      nativeDrmSame: nativeOptions.nativeDrm === options.nativeDrm,
      nativeDrm: nativeOptions.nativeDrm,
      capabilityOtherSame: nativeOptions.mediaCapabilities.other === options.mediaCapabilities.other,
    };
  })()`);
  assert.equal(result.thisIsInstance, true, 'native constructor receives its actual this');
  assert.equal(result.argsLength, 3);
  assert.equal(result.markerSame, true);
  assert.equal(result.thirdUndefined, true);
  assert.equal(result.newTargetSame, true, 'custom newTarget reaches native construction');
  assert.equal(result.prototypeSame, true);
  assert.equal(result.instanceOfNative, true);
  assert.equal(result.instanceOfCustom, true);
  assert.equal(result.instanceOfProxy, true);
  assert.equal(result.optionsCopied, true);
  assert.deepEqual(result.uhdAdded, ['SD', 'HD', 'FHD', 'UHD']);
  assert.deepEqual(result.sourceUnchanged, ['SD', 'HD', 'FHD']);
  assert.equal(result.nativeDrmSame, true);
  assert.deepEqual(result.nativeDrm, {keySystem: 'com.microsoft.playready', sessionType: 'temporary'});
  assert.equal(result.capabilityOtherSame, true);
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 1, 'one valid constructor reaches native exactly once');
}

{
  const runtime = await preparePublishedRuntime({sessionKind: 'data'});
  const error = vm.runInContext(`(() => {
    try {
      const options = makeRuntimeOptions(); options.throwNative = true;
      return Reflect.construct(globalThis['playback-session'].PlaybackSession, [options]);
    } catch (value) { return value; }
  })()`, runtime.context);
  assert.equal(error, runtime.context.nativeConstructorError, 'native constructor error identity is preserved');
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 1);
  await assertBlocked(runtime, 'native constructor failure');
}

for (const invalidExpression of ['makeUnknownConstructorOptions()', `({playbackServiceVersion: ${JSON.stringify(SDK_VERSION)}, mediaCapabilities: {videoResolutions: ['SD', 'HD', 'FHD', 'FHD']}})`]) {
  const runtime = await preparePublishedRuntime({sessionKind: 'accessor'});
  const error = vm.runInContext(`(() => {
    try { return Reflect.construct(globalThis['playback-session'].PlaybackSession, [${invalidExpression}]); }
    catch (value) { return value; }
  })()`, runtime.context);
  assert.equal(error?.name, 'AbortError', 'unknown constructor argument is rejected with an AbortError');
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 0, 'unknown constructor argument never reaches native construction');
  await assertBlocked(runtime, 'unknown constructor argument');
}

{
  const runtime = createRuntime({preloadSession: true, preloadService: true});
  assert.equal(runtimeJson(runtime, `(() => { const d = Object.getOwnPropertyDescriptor(globalThis, 'playback-session'); return [Object.prototype.hasOwnProperty.call(d, 'value'), d.value === sessionExport]; })()`)[0], true);
  const result = vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  await assert.rejects(result, (error) => error?.name === 'AbortError', 'preloaded session SDK cannot be safely captured');
  assert.equal(runtimeJson(runtime, 'sdkCalls.length'), 0, 'preloaded SDK fails before native service creation');
  await assertBlocked(runtime, 'preloaded session SDK');
}

{
  const runtime = createRuntime({sessionKind: 'accessor'});
  installService(runtime);
  const unknownGetterExport = `(() => {
    const value = {};
    Object.defineProperty(value, 'PlaybackSession', {get() { otherExportGetterCalls += 1; return NativePlaybackSession; }, configurable: true});
    Object.defineProperty(value, 'other', {get() { otherExportGetterCalls += 1; return NativePlaybackSession; }, configurable: true});
    return value;
  })()`;
  assert.throws(
    () => publishSession(runtime, {src: 'https://evil.example/sdk.js', exportExpression: unknownGetterExport}),
    (error) => error?.name === 'AbortError', 'unknown source publication fails closed',
  );
  assert.equal(runtimeJson(runtime, 'otherExportGetterCalls'), 0, 'unknown source does not invoke export getters');
  assert.equal(vm.runInContext(`Object.getOwnPropertyDescriptor(globalThis, 'playback-session').value`, runtime.context), undefined,
    'unknown source leaves an explicit undefined export');
  assert.equal(runtimeJson(runtime, 'sdkInstance.constructor.prototype.createPlaybackSession === sdkNativeCreate'), false,
    'service wrapper is installed but resolution hook is not accepted');
  const result = vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  await assert.rejects(result, (error) => error?.name === 'AbortError');
  assert.equal(runtimeJson(runtime, 'sdkCalls.length'), 0);
  await assertBlocked(runtime, 'unknown session SDK source');
}

for (const exportExpression of [
  `({NotPlaybackSession: NativePlaybackSession})`,
  `([])`,
  `({PlaybackSession: {}})`,
]) {
  const runtime = createRuntime({sessionKind: 'data'});
  installService(runtime);
  assert.throws(
    () => publishSession(runtime, {exportExpression}),
    (error) => error?.name === 'AbortError', 'unknown export publication fails closed',
  );
  const globalValue = vm.runInContext(`Object.getOwnPropertyDescriptor(globalThis, 'playback-session').value`, runtime.context);
  assert.equal(globalValue, undefined, 'unknown SDK export is replaced by explicit undefined');
  const result = vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  await assert.rejects(result, (error) => error?.name === 'AbortError', 'unknown SDK export cannot start native service creation');
  assert.equal(runtimeJson(runtime, 'sdkCalls.length'), 0);
  await assertBlocked(runtime, 'unknown SDK export');
}

{
  const runtime = await preparePublishedRuntime({sessionKind: 'data'});
  const savedConstructor = vm.runInContext(`globalThis.savedConstructor = globalThis['playback-session'].PlaybackSession; savedConstructor`, runtime.context);
  vm.runInContext(`Object.defineProperty(globalThis, 'playback-session', {value: {PlaybackSession: savedConstructor}, configurable: true, enumerable: true, writable: true});`, runtime.context);
  const error = vm.runInContext(`(() => { try { return Reflect.construct(savedConstructor, [makeRuntimeOptions()]); } catch (value) { return value; } })()`, runtime.context);
  assert.equal(error?.name, 'AbortError', 'post-publication namespace replacement is detected');
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 0);
  const second = vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  await assert.rejects(second, (value) => value?.name === 'AbortError');
  assert.equal(runtimeJson(runtime, 'sdkCalls.length'), 1, 'namespace replacement prevents a second service call');
  await assertBlocked(runtime, 'namespace replacement');
}

for (const sessionKind of ['accessor', 'data']) {
  const runtime = await preparePublishedRuntime({sessionKind});
  const savedConstructor = vm.runInContext('globalThis.savedConstructor = globalThis[\'playback-session\'].PlaybackSession; savedConstructor', runtime.context);
  if (sessionKind === 'accessor') {
    vm.runInContext(`Object.defineProperty(globalThis['playback-session'], 'PlaybackSession', {
      get() { otherExportGetterCalls += 1; return function ReplacedSession() {}; }, configurable: true,
    });`, runtime.context);
  } else {
    vm.runInContext(`Object.defineProperty(globalThis['playback-session'], 'PlaybackSession', {
      value: function ReplacedSession() {}, writable: false, enumerable: false, configurable: true,
    });`, runtime.context);
  }
  const error = vm.runInContext(`(() => { try { return Reflect.construct(savedConstructor, [makeRuntimeOptions()]); } catch (value) { return value; } })()`, runtime.context);
  assert.equal(error?.name, 'AbortError', `${sessionKind}: post-publication constructor replacement is detected`);
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 0);
  assert.equal(runtimeJson(runtime, 'otherExportGetterCalls'), 0, `${sessionKind}: constructor replacement checks descriptors without invoking replacement getter`);
  await assertBlocked(runtime, `${sessionKind} constructor replacement`);
}

{
  const runtime = await preparePublishedRuntime({sessionKind: 'data'});
  await vm.runInContext("new globalThis['playback-session'].PlaybackSession(makeRuntimeOptions())", runtime.context);
  await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method: 'POST', body: '{}'})`, runtime.context);
  await vm.runInContext("navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{initDataTypes:['cenc']}])", runtime.context);
  assert.deepEqual(runtimeJson(runtime, '[nativeConstructorCalls.length, nativeFetchCalls.length, nativeEmeCalls.length]'), [1, 1, 1],
    'a valid Proxy construction permits exactly one known POST and one native EME call before replacement');
  vm.runInContext(`Object.defineProperty(globalThis, 'playback-session', {
    value: {PlaybackSession: NativePlaybackSession}, configurable: true, enumerable: true, writable: true,
  });`, runtime.context);
  await assertBlocked(runtime, 'namespace replacement after successful constructor');
  assert.deepEqual(runtimeJson(runtime, '[nativeConstructorCalls.length, nativeFetchCalls.length, nativeEmeCalls.length]'), [1, 1, 1],
    'namespace replacement after readiness does not start another constructor, POST, or EME call');
}

for (const sessionKind of ['accessor', 'data']) {
  const runtime = await preparePublishedRuntime({sessionKind});
  await vm.runInContext("new globalThis['playback-session'].PlaybackSession(makeRuntimeOptions())", runtime.context);
  await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method: 'POST', body: '{}'})`, runtime.context);
  await vm.runInContext("navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{initDataTypes:['cenc']}])", runtime.context);
  assert.deepEqual(runtimeJson(runtime, '[nativeConstructorCalls.length, nativeFetchCalls.length, nativeEmeCalls.length]'), [1, 1, 1],
    `${sessionKind}: valid readiness reaches known POST and native EME before constructor replacement`);
  if (sessionKind === 'accessor') {
    vm.runInContext(`Object.defineProperty(globalThis['playback-session'], 'PlaybackSession', {
      get() { otherExportGetterCalls += 1; return function ReplacedSession() {}; }, configurable: true,
    });`, runtime.context);
  } else {
    vm.runInContext(`Object.defineProperty(globalThis['playback-session'], 'PlaybackSession', {
      value: function ReplacedSession() {}, writable: false, enumerable: false, configurable: true,
    });`, runtime.context);
  }
  await assertBlocked(runtime, `${sessionKind} constructor replacement after successful constructor`);
  assert.deepEqual(runtimeJson(runtime, '[nativeConstructorCalls.length, nativeFetchCalls.length, nativeEmeCalls.length]'), [1, 1, 1],
    `${sessionKind}: copied constructor replacement revokes known POST and native EME without invoking native`);
  assert.equal(runtimeJson(runtime, 'otherExportGetterCalls'), 0,
    `${sessionKind}: post-success replacement checks do not invoke a replacement getter`);
}

{
  const runtime = createRuntime({sessionKind: 'accessor'});
  installService(runtime);
  publishSession(runtime);
  await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  const second = vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  await assert.rejects(second, (error) => error?.name === 'AbortError', 'SDK double create is rejected');
  assert.equal(runtimeJson(runtime, 'sdkCalls.length'), 1, 'SDK double create never reaches native service creation');
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 0);
  await assertBlocked(runtime, 'SDK double create before constructor');
}

{
  const runtime = createRuntime({sessionKind: 'accessor'});
  installService(runtime);
  publishSession(runtime);
  await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  assert.equal(runtime.callbacks.get('pagehide')?.capture, true, 'pagehide retirement hook uses capture phase');
  runtime.callbacks.get('pagehide').callback({persisted: true});
  const error = vm.runInContext(`(() => { try { return Reflect.construct(globalThis['playback-session'].PlaybackSession, [makeRuntimeOptions()]); } catch (value) { return value; } })()`, runtime.context);
  assert.equal(error?.name, 'AbortError', 'retired document refuses SDK session construction');
  assert.equal(runtimeJson(runtime, 'nativeConstructorCalls.length'), 0);
  const second = vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', runtime.context);
  await assert.rejects(second, (value) => value?.name === 'AbortError');
  assert.equal(runtimeJson(runtime, 'sdkCalls.length'), 1);
  await assertBlocked(runtime, 'pagehide retirement');
}

{
  const runtime = createRuntime({sessionKind: 'accessor', documentElement: true});
  assert.equal(runtime.overlayEvents.has('.check:click'), false, 'debug UI is hidden until explicitly opened');
  vm.runInContext('__DisneyPlusEdgeEnhancedToolbar.toggleDebug()', runtime.context);
  assert.equal(runtime.overlayEvents.has('.check:click'), true, 'overlay check button is available in the fake document');
  runtime.overlayEvents.get('.check:click')();
  await Promise.resolve();
  assert.equal(runtimeJson(runtime, 'nativeEmeCalls.length'), 0,
    'UHD environment check does not issue a second native EME capability query');
}

for (const vendor of ['Intel', 'NVIDIA', 'AMD', 'unknown']) {
  const runtime = createRuntime();
  runtime.context.document.createElement = () => ({getContext: () => ({
    getExtension: (name) => name === 'WEBGL_debug_renderer_info'
      ? {UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2}
      : {loseContext() {}},
    getParameter: () => vendor,
  })});
  const outcome = runtime.context.__DisneyPlusEdgeEnhancedToolbar.prepareIntel4k();
  assert.equal(outcome.ok, vendor === 'Intel');
  if (vendor === 'Intel') {
    const ticket = JSON.parse(runtime.sessionStorage.getItem(TICKET_KEY));
    assert.equal(ticket.mode, MODE_HDR10, 'the menu uses the exact successful mode, not the 30s single-variant experiment');
    assert.equal(ticket.requireIntelGpu, true);
    assert.equal(runtime.localStorage.getItem('ioridev.disneyplus4k.mode.v1'), 'original');
    assert.equal(runtime.context.__DisneyPlusEdgeEnhancedToolbar.prepareIntel4k().ok, false, 'no double arming');
  } else {
    assert.equal(outcome.reason, 'intel-gpu-required');
    assert.equal(runtime.sessionStorage.getItem(TICKET_KEY), null);
    assert.equal(runtime.context.__DisneyPlusEdgeEnhancedToolbar.getState().mode, SDK_MODE, 'rejected selection does not change the current playback mode');
  }
  assert.equal(runtimeJson(runtime, 'nativeEmeCalls.length'), 0, 'selecting the menu does not perform a license/CDM probe');
}
if (SDK_MODE === MODE_HDR10) {
  const runtime = createRuntime();
  const outcome = runtime.context.__DisneyPlusEdgeEnhancedToolbar.prepareToggle();
  assert.equal(outcome.mode, 'original', 'left-click turns a 4K session OFF rather than starting full-HD immediately');
}

console.log('SDK resolution policy: COW/descriptor validation, exact UMD capture, constructor/native contracts, fail-closed replacement/retirement guards, Intel-menu mode identity, and UHD environment-query suppression passed');
