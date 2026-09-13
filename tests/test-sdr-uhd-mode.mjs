import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const MODE_HDR10 = '4k-hdr10-sdk-playready';
const MODE_SDR = '4k-hevc-sdk-playready';
const SDK_VERSION = '26.10.0-jasmine';
const SCRIPT_VERSION = '0.5.1';
const STORAGE_KEY = 'ioridev.disneyplus4k.mode.v1';
const TICKET_KEY = `ioridev.disneyplus4k.once.v${SCRIPT_VERSION}`;
const DOCUMENT_URL = 'https://www.disneyplus.com/ja-jp/play/sdr-uhd-mode-test';
const SESSION_SDK_URL = `https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/${SDK_VERSION}/all_browser_es6/playback-session.js`;
const INPUT_SCENARIO = 'ctr-regular';
const PLAYBACK_HOST = 'https://disney.playback.edge.bamgrid.com/v7/playback';

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

assert.ok(planApi, 'the production test API is available');
const plans = Object.fromEntries([MODE_HDR10, MODE_SDR].map((mode) => [
  mode,
  jsonIn(planRealm, `__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(mode)}]`),
]));
assert.deepEqual(plans[MODE_SDR], {
  label: '4K HEVC・HDR要求なし（SDKのPlayReady選択）',
  scenario: 'tv-drm-ctr-h265-atmos',
  resolution: '3840x2160',
  sdkMaxHeight: 2160,
  sdkRecommendationFlow: true,
  sdkUhdPolicy: true,
}, 'the SDR UHD SDK mode has the requested no-HDR plan');

const withoutLabelAndScenario = ({label: _label, scenario: _scenario, ...rest}) => rest;
assert.deepEqual(withoutLabelAndScenario(plans[MODE_SDR]), withoutLabelAndScenario(plans[MODE_HDR10]),
  'the SDR and HDR UHD SDK modes share every setting except label and scenario');
assert.equal(plans[MODE_SDR].scenario.includes('hdr10'), false, 'the SDR scenario does not request HDR10');
assert.equal(plans[MODE_SDR].resolution, '3840x2160');
assert.equal(jsonIn(planRealm, `__DP4K_INTERNALS__.isExperimentalMode(${JSON.stringify(MODE_HDR10)})`), true);
assert.equal(jsonIn(planRealm, `__DP4K_INTERNALS__.isExperimentalMode(${JSON.stringify(MODE_SDR)})`), true);

{
  const comparison = jsonIn(planRealm, `(() => {
    const makeOptions = () => ({
      playbackServiceVersion: ${JSON.stringify(SDK_VERSION)},
      mediaCapabilities: {videoResolutions: ['SD', 'HD', 'FHD']},
      clientParameters: {configOverrides: {'hive-dmp': {engine: {keep: true}}}},
      unrelated: {keep: true},
    });
    const makeConfiguration = () => [{
      initDataTypes: ['cenc'],
      distinctiveIdentifier: 'required',
      videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: '2000'}],
    }];
    const result = {};
    for (const mode of [${JSON.stringify(MODE_HDR10)}, ${JSON.stringify(MODE_SDR)}]) {
      const options = makeOptions();
      const configured = __DP4K_INTERNALS__.planPlaybackSessionOptions(options, mode);
      const resolutions = __DP4K_INTERNALS__.planSdkResolutionPolicy(options, mode);
      const eme = __DP4K_INTERNALS__.planEmeRequest('com.microsoft.playready', makeConfiguration(), mode);
      result[mode] = {
        configured: {
          changed: configured.changed,
          maxHeight: configured.options.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.maxHeight,
          resolution: configured.options.clientParameters.configOverrides['hive-dmp'].session.vod.playbackAttributesConfig.resolution.max,
          recommendation: configured.options.clientParameters.configOverrides['hive-dmp'].engine.drmPlayReadyRecommendationFlow,
          sourceRecommendation: options.clientParameters.configOverrides['hive-dmp'].engine.drmPlayReadyRecommendationFlow ?? null,
          unrelatedSame: configured.options.unrelated === options.unrelated,
        },
        resolutions: {
          changed: resolutions.changed,
          valid: resolutions.valid,
          before: resolutions.before,
          after: resolutions.after,
        },
        eme: {
          keySystem: eme.keySystem,
          changed: eme.changed,
          blocked: Boolean(eme.blocked),
          identifier: eme.configurations[0].distinctiveIdentifier,
          video: eme.configurations[0].videoCapabilities,
        },
      };
    }
    return result;
  })()`);
  assert.deepEqual(comparison[MODE_SDR], comparison[MODE_HDR10],
    'SDK config, UHD candidate, and EME guard behavior are equivalent between UHD SDK modes');
  assert.deepEqual(comparison[MODE_SDR].configured, {
    changed: true,
    maxHeight: 2160,
    resolution: ['3840x2160'],
    recommendation: true,
    sourceRecommendation: null,
    unrelatedSame: true,
  });
  assert.deepEqual(comparison[MODE_SDR].resolutions, {
    changed: true, valid: true, before: ['SD', 'HD', 'FHD'], after: ['SD', 'HD', 'FHD', 'UHD'],
  });
  assert.equal(comparison[MODE_SDR].eme.identifier, 'not-allowed', 'the SDK EME guard still forbids identifiers');
}

const bootOnePageMode = (mode) => {
  const now = 100000;
  const local = makeStorage([[STORAGE_KEY, 'original']]);
  const session = makeStorage();
  assert.equal(planApi.consumeStartupMode(local, session, DOCUMENT_URL, now, 'reload').mode, 'original',
    `${mode}: initial startup stays original`);
  assert.equal(planApi.prepareModeReload(mode, local, session, DOCUMENT_URL, now).reload, true,
    `${mode}: explicit experiment arm requests a reload`);
  assert.equal(local.getItem(STORAGE_KEY), 'original', `${mode}: experiment is not persisted in localStorage`);
  assert.equal(planApi.consumeStartupMode(local, session, DOCUMENT_URL, now + 100, 'reload').mode, mode,
    `${mode}: the matching reload consumes the one-page ticket`);
  assert.equal(session.getItem(TICKET_KEY), null, `${mode}: the ticket is consumed synchronously`);
  assert.equal(planApi.consumeStartupMode(local, session, DOCUMENT_URL, now + 101, 'reload').mode, 'original',
    `${mode}: a second page cannot reuse the experiment ticket`);
  assert.equal(planApi.consumeStartupMode(local, session, DOCUMENT_URL, now + 102, 'navigate').mode, 'original',
    `${mode}: a new navigation cannot activate the experiment`);
};

for (const mode of [MODE_HDR10, MODE_SDR]) bootOnePageMode(mode);

const createRuntime = (mode) => {
  const callbacks = new Map();
  const now = Date.now();
  const localStorage = makeStorage([[STORAGE_KEY, 'original']]);
  const sessionStorage = makeStorage([[
    TICKET_KEY,
    JSON.stringify({version: SCRIPT_VERSION, mode, documentUrl: DOCUMENT_URL, createdAt: now - 100}),
  ]]);
  const context = vm.createContext({
    URL,
    DOMException,
    console,
    localStorage,
    sessionStorage,
    performance: {getEntriesByType: () => [{type: 'reload'}]},
    location: {href: DOCUMENT_URL, pathname: '/ja-jp/play/sdr-uhd-mode-test', reload: () => {}},
    document: {currentScript: null, documentElement: null, querySelectorAll: () => []},
    MutationObserver: class {observe() {} disconnect() {}},
    addEventListener: (name, callback, capture) => callbacks.set(name, {callback, capture}),
    setInterval: () => 0,
    setTimeout: () => 0,
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
    globalThis.originalNativeEme = TestNavigator.prototype.requestMediaKeySystemAccess;
    globalThis.navigator = new TestNavigator();

    globalThis.nativeConstructorCalls = [];
    class NativePlaybackSession {
      constructor(...args) {
        nativeConstructorCalls.push({thisValue: this, args, newTarget: new.target});
        this.options = args[0];
      }
    }
    globalThis.NativePlaybackSession = NativePlaybackSession;
    globalThis.sessionExport = {};
    Object.defineProperty(sessionExport, 'PlaybackSession', {
      value: NativePlaybackSession, writable: false, enumerable: false, configurable: true,
    });

    globalThis.sdkCalls = [];
    class TestPlaybackService {
      createPlaybackSession(...args) {
        sdkCalls.push({thisValue: this, args});
        return Promise.resolve({sdk: true});
      }
    }
    Object.defineProperty(TestPlaybackService, 'version', {value: ${JSON.stringify(SDK_VERSION)}, configurable: true});
    globalThis.sdkInstance = new TestPlaybackService();
    globalThis.sdkExport = {PlaybackService: TestPlaybackService};
    globalThis.makeSdkOptions = function makeSdkOptions() {
      return {
        playbackServiceVersion: ${JSON.stringify(SDK_VERSION)},
        mediaCapabilities: {videoResolutions: ['SD', 'HD', 'FHD']},
        clientParameters: {configOverrides: {'hive-dmp': {engine: {keep: true}}}},
      };
    };
  `, context);
  vm.runInContext(source, context);
  vm.runInContext(`globalThis['playback-service'] = sdkExport;`, context);
  vm.runInContext(`
    document.currentScript = {src: ${JSON.stringify(SESSION_SDK_URL)}};
    globalThis['playback-session'] = sessionExport;
    document.currentScript = null;
  `, context);
  return {context, callbacks};
};

const runPostComparison = async (mode) => {
  const runtime = createRuntime(mode);
  const {context} = runtime;
  await vm.runInContext('sdkInstance.createPlaybackSession(makeSdkOptions())', context);
  await vm.runInContext("new globalThis['playback-session'].PlaybackSession(makeSdkOptions())", context);
  await vm.runInContext(`navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{
    initDataTypes: ['cenc'], distinctiveIdentifier: 'required', sessionTypes: ['persistent-license'],
    persistentState: 'optional', videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: '2000'}],
  }])`, context);
  const inputUrl = `${PLAYBACK_HOST}/${INPUT_SCENARIO}`;
  const inputBody = JSON.stringify({
    playback: {
      attributes: {
        codecs: ['hvc1'],
        resolution: {max: ['1920x1080']},
        marker: {keep: true},
      },
    },
  });
  await vm.runInContext(`fetch(${JSON.stringify(inputUrl)}, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: ${JSON.stringify(inputBody)},
  })`, context);
  const result = jsonIn(context, `(() => {
    const call = nativeFetchCalls.at(-1);
    const body = JSON.parse(call.init.body);
    return {
      url: call.input,
      body,
      constructorCount: nativeConstructorCalls.length,
      serviceCount: sdkCalls.length,
      emeGuarded: Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(navigator), 'requestMediaKeySystemAccess').value !== originalNativeEme,
      emeCalls: nativeEmeCalls.length,
      emeKeySystem: nativeEmeCalls[0].args[0],
      emeConfiguration: nativeEmeCalls[0].args[1][0],
    };
  })()`);
  const targetScenario = mode === MODE_HDR10 ? 'tv-drm-ctr-h265-hdr10-atmos' : 'tv-drm-ctr-h265-atmos';
  assert.equal(result.url, `${PLAYBACK_HOST}/${targetScenario}`, `${mode}: target POST scenario is selected`);
  assert.deepEqual(result.body.playback.attributes.resolution.max, ['3840x2160'],
    `${mode}: target POST body is raised to 3840x2160`);
  assert.deepEqual(result.body.playback.attributes.codecs, ['hvc1'], `${mode}: POST codec selection is preserved`);
  assert.deepEqual(result.body.playback.attributes.marker, {keep: true}, `${mode}: unrelated POST body data is preserved`);
  assert.equal(result.constructorCount, 1, `${mode}: one SDK constructor is admitted before the target POST`);
  assert.equal(result.serviceCount, 1, `${mode}: one SDK service session is admitted before the target POST`);
  assert.equal(result.emeGuarded, true, `${mode}: EME guard remains installed before the target POST`);
  assert.equal(result.emeCalls, 1, `${mode}: one allowed EME request reaches the mock native method`);
  assert.equal(result.emeKeySystem, 'com.microsoft.playready', `${mode}: native key system remains unchanged`);
  assert.deepEqual(result.emeConfiguration, {
    initDataTypes: ['cenc'], distinctiveIdentifier: 'not-allowed', sessionTypes: ['persistent-license'],
    persistentState: 'optional', videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: '2000'}],
  }, `${mode}: only identifier permission is constrained at the native boundary`);
  return result;
};

const posts = {};
for (const mode of [MODE_HDR10, MODE_SDR]) posts[mode] = await runPostComparison(mode);
assert.notEqual(posts[MODE_HDR10].url, posts[MODE_SDR].url, 'the two comparison modes select distinct scenarios');
assert.ok(!posts[MODE_SDR].url.includes('hdr10'), 'the SDR target POST URL does not request HDR10');

console.log('SDR UHD SDK mode: plan equivalence, PlayReady identifier guard, one-page startup, 3840x2160 POST rewrite, and no-HDR scenario passed');
