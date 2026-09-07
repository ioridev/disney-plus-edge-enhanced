import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const SDK_MODE = '1080p-hevc-hw-persistent-cap';
const NATIVE_CAP_MODE = '1080p-hevc-native-cap';
const PLAYREADY_MODE = '1080p-hevc-sdk-playready';
const UHD_PLAYREADY_MODE = '4k-hdr10-sdk-playready';
const SDK_VERSION = '26.10.0-jasmine';
const SCRIPT_VERSION = '0.3.16';
const TICKET_KEY = `ioridev.disneyplus4k.once.v${SCRIPT_VERSION}`;
const OLD_MODES = [
  '1080p-hevc-hw-persistent',
  '4k-hdr10-hw-persistent',
  '4k-hdr10-hw',
  '4k-hevc-hw',
  '4k-sdr',
  '4k-hdr10',
  '1080p',
  'original',
];
const EXISTING_MODES = [...OLD_MODES, SDK_MODE, NATIVE_CAP_MODE, 'sdk-inspect', PLAYREADY_MODE];
const ALL_MODES = [...EXISTING_MODES, UHD_PLAYREADY_MODE, '4k-hevc-sdk-playready', '1080p-hevc-single-sdr', '4k-hevc-sdr-manifest-probe', '4k-hdr10-sdr-manifest-probe', '4k-hdr10-single-pq'];
const PLAYBACK_URL = 'https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular';
const PLAYBACK_BODY = JSON.stringify({playback:{attributes:{resolution:{max:['1280x720']}}}});
const DOCUMENT_URL = 'https://www.disneyplus.com/ja-jp/play/sdk-override-test';
const PLAYBACK_SESSION_URL = `https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/${SDK_VERSION}/all_browser_es6/playback-session.js`;

const makeStorage = (entries = []) => {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const createPlanRealm = () => {
  const realm = vm.createContext({URL, __DP4K_TEST__: true});
  vm.runInContext(source, realm);
  vm.runInContext(`
    globalThis.makeSdkOptions = function makeSdkOptions() {
      return {
        marker: 'root-preserved',
        engine: {keep: true},
        drm: {keySystems: ['keep-me']},
        ads: {strategy: 'keep-ads'},
        clientParameters: {
          keep: 'client-preserved',
          configOverrides: {
            other: {keep: 'other-override'},
            'hive-dmp': {
              engine: {keep: 'engine-override', drmPlayReadyRecommendationFlow: false},
              ads: {keep: 'ads-override'},
              session: {
                keep: 'session-preserved',
                vod: {
                  keep: 'vod-preserved',
                  playlistFiltering: {
                    quality: 'regular',
                    minHeight: 360,
                    maxHeight: 720,
                    maxFrameRate: 30,
                    blockVideoFormats: ['HEVC_SDR', 'HEVC_HDR10'],
                  },
                  playbackAttributesConfig: {
                    keep: 'attributes-preserved',
                    resolution: {
                      min: ['640x360'],
                      max: ['1280x720'],
                      keep: 'resolution-preserved',
                    },
                  },
                },
                live: {keep: 'live-preserved'},
                linear: {keep: 'linear-preserved'},
                'video-art': {keep: 'video-art-preserved'},
              },
            },
          },
        },
      };
    };
  `, realm);
  return realm;
};

const fromRealmJson = (realm, expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, realm));

const planRealm = createPlanRealm();
const api = planRealm.__DP4K_INTERNALS__;
assert.equal(api.TEST_TICKET_KEY, TICKET_KEY, 'runtime fixture targets the current one-shot ticket');

assert.deepEqual(fromRealmJson(planRealm, 'Object.keys(__DP4K_INTERNALS__.MODE_PLANS).sort()'), ALL_MODES.sort(),
  'all existing modes and the non-decoding manifest probe remain present');
const expectedOldPlans = {
  '1080p-hevc-hw-persistent': {
    label: '1080p HEVC + HWPR（persistent切り分け）', scenario: 'tv-drm-ctr-h265-atmos', resolution: '1920x1080',
    hardwarePlayReady: true, persistentSession: true,
  },
  '4k-hdr10-hw-persistent': {
    label: 'UHD HDR10 + HWPR（persistent互換テスト）', scenario: 'tv-drm-ctr-h265-hdr10-atmos', resolution: '3840x2160',
    hardwarePlayReady: true, persistentSession: true,
  },
  '4k-hdr10-hw': {
    label: 'UHD HDR10 + ハードウェアPlayReady', scenario: 'tv-drm-ctr-h265-hdr10-atmos', resolution: '3840x2160',
    hardwarePlayReady: true,
  },
  '4k-hevc-hw': {
    label: 'UHD HEVC + ハードウェアPlayReady', scenario: 'tv-drm-ctr-h265-atmos', resolution: '3840x2160',
    hardwarePlayReady: true,
  },
  '4k-sdr': {label: 'UHD HEVC/Atmos要求', scenario: 'tv-drm-ctr-h265-atmos', resolution: '3840x2160'},
  '4k-hdr10': {label: 'UHD HDR10シナリオ要求', scenario: 'tv-drm-ctr-h265-hdr10-atmos', resolution: '3840x2160'},
  '1080p': {label: '1080p上限要求', scenario: 'ctr-high', resolution: '1920x1080'},
  original: {label: '無変更', scenario: null, resolution: null},
};
assert.deepEqual(fromRealmJson(planRealm,
  `Object.fromEntries(${JSON.stringify(OLD_MODES)}.map((mode) => [mode, __DP4K_INTERNALS__.MODE_PLANS[mode]]))`), expectedOldPlans,
  'the eight original non-SDK plans retain their exact plans');
for (const mode of OLD_MODES) {
  assert.equal(vm.runInContext(
    `Object.prototype.hasOwnProperty.call(__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(mode)}], 'sdkMaxHeight')`, planRealm), false,
    `${mode} has no SDK VOD override`);
  const noChange = vm.runInContext(
    `(() => { const options = makeSdkOptions(); const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(options, ${JSON.stringify(mode)}); return [result.options === options, result.changed]; })()`,
    planRealm);
  assert.deepEqual([...noChange], [true, false], `${mode} leaves SDK arguments untouched`);
}
assert.deepEqual(fromRealmJson(planRealm, `__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(SDK_MODE)}]`), {
  label: '1080p HEVC + HWPR（内部上限修正）',
  scenario: 'tv-drm-ctr-h265-atmos',
  resolution: '1920x1080',
  hardwarePlayReady: true,
  persistentSession: true,
  sdkMaxHeight: 1080,
}, 'the existing HW persistent cap mode retains its SDK cap');
const nativeCapPlan = fromRealmJson(planRealm, `__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(NATIVE_CAP_MODE)}]`);
assert.equal(nativeCapPlan.scenario, 'tv-drm-ctr-h265-atmos');
assert.equal(nativeCapPlan.resolution, '1920x1080');
assert.equal(nativeCapPlan.sdkMaxHeight, 1080);
assert.equal(Object.prototype.hasOwnProperty.call(nativeCapPlan, 'hardwarePlayReady'), false,
  'native-cap mode does not alter the PlayReady key system');
assert.equal(Object.prototype.hasOwnProperty.call(nativeCapPlan, 'persistentSession'), false,
  'native-cap mode does not alter the session type');
const playReadyPlan = fromRealmJson(planRealm, `__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(PLAYREADY_MODE)}]`);
assert.deepEqual(playReadyPlan, {
  label: '1080p HEVC（SDKのPlayReady選択）',
  scenario: 'tv-drm-ctr-h265-atmos',
  resolution: '1920x1080',
  sdkMaxHeight: 1080,
  sdkRecommendationFlow: true,
}, 'the SDK PlayReady mode has only the requested 1080p flow fields');
assert.equal(Object.prototype.hasOwnProperty.call(playReadyPlan, 'hardwarePlayReady'), false,
  'SDK PlayReady mode does not rewrite the native key-system string');
assert.equal(Object.prototype.hasOwnProperty.call(playReadyPlan, 'persistentSession'), false,
  'SDK PlayReady mode does not directly force createSession arguments');
const uhdPlayReadyPlan = fromRealmJson(planRealm, `__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(UHD_PLAYREADY_MODE)}]`);
assert.deepEqual(uhdPlayReadyPlan, {
  label: '4K HDR10（SDKのPlayReady選択）',
  scenario: 'tv-drm-ctr-h265-hdr10-atmos',
  resolution: '3840x2160',
  sdkMaxHeight: 2160,
  sdkRecommendationFlow: true,
  sdkUhdPolicy: true,
}, 'the UHD SDK PlayReady mode has exactly the requested HDR10/2160 flow fields');
assert.equal(Object.prototype.hasOwnProperty.call(uhdPlayReadyPlan, 'hardwarePlayReady'), false,
  'UHD SDK PlayReady mode does not rewrite the native key-system string');
assert.equal(Object.prototype.hasOwnProperty.call(uhdPlayReadyPlan, 'persistentSession'), false,
  'UHD SDK PlayReady mode does not directly force createSession arguments');
for (const mode of EXISTING_MODES) {
  assert.equal(vm.runInContext(
    `Object.prototype.hasOwnProperty.call(__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(mode)}], 'sdkUhdPolicy')`, planRealm), false,
    `${mode} does not opt into the UHD SDK resolution policy`);
}

vm.runInContext('globalThis.baseOptions = makeSdkOptions();', planRealm);
const baseSnapshot = fromRealmJson(planRealm, 'baseOptions');
const plannedSnapshot = fromRealmJson(planRealm, `(() => {
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(baseOptions, ${JSON.stringify(SDK_MODE)});
  return result.options;
})()`);
const expectedPlanned = JSON.parse(JSON.stringify(baseSnapshot));
expectedPlanned.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.maxHeight = 1080;
expectedPlanned.clientParameters.configOverrides['hive-dmp'].session.vod.playbackAttributesConfig.resolution.max = ['1920x1080'];
assert.deepEqual(plannedSnapshot, expectedPlanned, 'only the two VOD resolution paths change');
assert.deepEqual(fromRealmJson(planRealm, 'baseOptions'), baseSnapshot, 'copy-on-write does not mutate the source');
assert.deepEqual(fromRealmJson(planRealm, `(() => {
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(baseOptions, ${JSON.stringify(SDK_MODE)});
  const original = baseOptions.clientParameters.configOverrides['hive-dmp'];
  const next = result.options.clientParameters.configOverrides['hive-dmp'];
  return {
    rootCopied: result.options !== baseOptions,
    clientCopied: result.options.clientParameters !== baseOptions.clientParameters,
    overridesCopied: result.options.clientParameters.configOverrides !== baseOptions.clientParameters.configOverrides,
    hiveCopied: next !== original,
    sessionCopied: next.session !== original.session,
    vodCopied: next.session.vod !== original.session.vod,
    filteringCopied: next.session.vod.playlistFiltering !== original.session.vod.playlistFiltering,
    attributesCopied: next.session.vod.playbackAttributesConfig !== original.session.vod.playbackAttributesConfig,
    resolutionCopied: next.session.vod.playbackAttributesConfig.resolution !== original.session.vod.playbackAttributesConfig.resolution,
    enginePreserved: next.engine === original.engine,
    adsPreserved: next.ads === original.ads,
    otherTypePreserved: next.session.live === original.session.live
      && next.session.linear === original.session.linear
      && next.session['video-art'] === original.session['video-art'],
    blockListPreserved: next.session.vod.playlistFiltering.blockVideoFormats === original.session.vod.playlistFiltering.blockVideoFormats,
  };
})()`), {
  rootCopied: true,
  clientCopied: true,
  overridesCopied: true,
  hiveCopied: true,
  sessionCopied: true,
  vodCopied: true,
  filteringCopied: true,
  attributesCopied: true,
  resolutionCopied: true,
  enginePreserved: true,
  adsPreserved: true,
  otherTypePreserved: true,
  blockListPreserved: true,
}, 'copy-on-write preserves unrelated nested objects');

{
  vm.runInContext('globalThis.nativeCapOptions = makeSdkOptions()', planRealm);
  const before = fromRealmJson(planRealm, 'JSON.stringify(nativeCapOptions)');
  const result = vm.runInContext(
    `__DP4K_INTERNALS__.planPlaybackSessionOptions(nativeCapOptions, ${JSON.stringify(NATIVE_CAP_MODE)})`, planRealm);
  const vod = fromRealmJson(planRealm, 'nativeCapOptions.clientParameters.configOverrides[\'hive-dmp\'].session.vod');
  assert.equal(result.changed, true, 'native-cap mode applies the SDK VOD override');
  assert.equal(vm.runInContext(
    `__DP4K_INTERNALS__.planPlaybackSessionOptions(nativeCapOptions, ${JSON.stringify(NATIVE_CAP_MODE)}).options !== nativeCapOptions`,
    planRealm), true, 'native-cap mode uses copy-on-write');
  assert.equal(vod.playlistFiltering.maxHeight, 720, 'source options keep their original maxHeight');
  assert.deepEqual(vod.playbackAttributesConfig.resolution.max, ['1280x720'],
    'source options keep their original resolution max');
  assert.equal(fromRealmJson(planRealm, 'JSON.stringify(nativeCapOptions)'), before, 'native-cap source options remain unchanged');
  const planned = fromRealmJson(planRealm, `(() => {
    const next = __DP4K_INTERNALS__.planPlaybackSessionOptions(nativeCapOptions, ${JSON.stringify(NATIVE_CAP_MODE)}).options;
    const v = next.clientParameters.configOverrides['hive-dmp'].session.vod;
    return {maxHeight: v.playlistFiltering.maxHeight, resolution: v.playbackAttributesConfig.resolution.max,
      blockList: v.playlistFiltering.blockVideoFormats, live: next.clientParameters.configOverrides['hive-dmp'].session.live};
  })()`);
  assert.deepEqual(planned, {
    maxHeight: 1080,
    resolution: ['1920x1080'],
    blockList: ['HEVC_SDR', 'HEVC_HDR10'],
    live: {keep: 'live-preserved'},
  }, 'native-cap mode changes only the two VOD resolution fields');
}

{
  vm.runInContext('globalThis.playReadyOptions = makeSdkOptions()', planRealm);
  const before = fromRealmJson(planRealm, 'JSON.stringify(playReadyOptions)');
  const result = vm.runInContext(
    `__DP4K_INTERNALS__.planPlaybackSessionOptions(playReadyOptions, ${JSON.stringify(PLAYREADY_MODE)})`, planRealm);
  assert.equal(result.changed, true, 'SDK PlayReady mode applies its session override');
  assert.equal(vm.runInContext(
    `__DP4K_INTERNALS__.planPlaybackSessionOptions(playReadyOptions, ${JSON.stringify(PLAYREADY_MODE)}).options !== playReadyOptions`,
    planRealm), true, 'SDK PlayReady mode uses copy-on-write');
  const source = fromRealmJson(planRealm, 'playReadyOptions');
  assert.equal(source.clientParameters.configOverrides['hive-dmp'].engine.drmPlayReadyRecommendationFlow, false,
    'source engine flow flag remains unchanged');
  assert.equal(fromRealmJson(planRealm, 'JSON.stringify(playReadyOptions)'), before,
    'SDK PlayReady source options remain unchanged');
  const planned = fromRealmJson(planRealm, `(() => {
    const next = __DP4K_INTERNALS__.planPlaybackSessionOptions(playReadyOptions, ${JSON.stringify(PLAYREADY_MODE)}).options;
    const hive = next.clientParameters.configOverrides['hive-dmp'];
    const vod = hive.session.vod;
    const original = playReadyOptions.clientParameters.configOverrides['hive-dmp'];
    return {
      rootCopied: next !== playReadyOptions,
      clientCopied: next.clientParameters !== playReadyOptions.clientParameters,
      overridesCopied: next.clientParameters.configOverrides !== playReadyOptions.clientParameters.configOverrides,
      hiveCopied: hive !== original,
      engineCopied: hive.engine !== original.engine,
      engine: hive.engine,
      sessionCopied: hive.session !== original.session,
      vodCopied: vod !== original.session.vod,
      filteringCopied: vod.playlistFiltering !== original.session.vod.playlistFiltering,
      attributesCopied: vod.playbackAttributesConfig !== original.session.vod.playbackAttributesConfig,
      resolutionCopied: vod.playbackAttributesConfig.resolution !== original.session.vod.playbackAttributesConfig.resolution,
      maxHeight: vod.playlistFiltering.maxHeight,
      resolutionMax: vod.playbackAttributesConfig.resolution.max,
      blockList: vod.playlistFiltering.blockVideoFormats,
      live: hive.session.live,
      ads: hive.ads,
    };
  })()`);
  assert.deepEqual(planned, {
    rootCopied: true,
    clientCopied: true,
    overridesCopied: true,
    hiveCopied: true,
    engineCopied: true,
    engine: {keep: 'engine-override', drmPlayReadyRecommendationFlow: true},
    sessionCopied: true,
    vodCopied: true,
    filteringCopied: true,
    attributesCopied: true,
    resolutionCopied: true,
    maxHeight: 1080,
    resolutionMax: ['1920x1080'],
    blockList: ['HEVC_SDR', 'HEVC_HDR10'],
    live: {keep: 'live-preserved'},
    ads: {keep: 'ads-override'},
  }, 'SDK PlayReady mode changes only VOD paths and its engine flow flag');
}

{
  vm.runInContext('globalThis.uhdPlayReadyOptions = makeSdkOptions()', planRealm);
  const before = fromRealmJson(planRealm, 'JSON.stringify(uhdPlayReadyOptions)');
  const result = vm.runInContext(
    `__DP4K_INTERNALS__.planPlaybackSessionOptions(uhdPlayReadyOptions, ${JSON.stringify(UHD_PLAYREADY_MODE)})`, planRealm);
  assert.equal(result.changed, true, 'UHD SDK PlayReady mode applies its session override');
  assert.equal(vm.runInContext(
    `__DP4K_INTERNALS__.planPlaybackSessionOptions(uhdPlayReadyOptions, ${JSON.stringify(UHD_PLAYREADY_MODE)}).options !== uhdPlayReadyOptions`,
    planRealm), true, 'UHD SDK PlayReady mode uses copy-on-write');
  assert.equal(fromRealmJson(planRealm, 'JSON.stringify(uhdPlayReadyOptions)'), before,
    'UHD SDK PlayReady source options remain unchanged');
  const plannedSnapshot = fromRealmJson(planRealm, `(() => {
    const next = __DP4K_INTERNALS__.planPlaybackSessionOptions(uhdPlayReadyOptions, ${JSON.stringify(UHD_PLAYREADY_MODE)}).options;
    return next;
  })()`);
  const expectedSnapshot = JSON.parse(before);
  const hive = expectedSnapshot.clientParameters.configOverrides['hive-dmp'];
  hive.engine.drmPlayReadyRecommendationFlow = true;
  hive.session.vod.playlistFiltering.maxHeight = 2160;
  hive.session.vod.playbackAttributesConfig.resolution.max = ['3840x2160'];
  assert.deepEqual(plannedSnapshot, expectedSnapshot,
    'UHD SDK PlayReady changes exactly the two VOD values and engine recommendation flag');
  assert.deepEqual(fromRealmJson(planRealm, `(() => {
    const original = uhdPlayReadyOptions.clientParameters.configOverrides['hive-dmp'];
    const next = __DP4K_INTERNALS__.planPlaybackSessionOptions(uhdPlayReadyOptions, ${JSON.stringify(UHD_PLAYREADY_MODE)}).options;
    return {
      rootCopied: next !== uhdPlayReadyOptions,
      clientCopied: next.clientParameters !== uhdPlayReadyOptions.clientParameters,
      overridesCopied: next.clientParameters.configOverrides !== uhdPlayReadyOptions.clientParameters.configOverrides,
      hiveCopied: next.clientParameters.configOverrides['hive-dmp'] !== original,
      engineCopied: next.clientParameters.configOverrides['hive-dmp'].engine !== original.engine,
      sessionCopied: next.clientParameters.configOverrides['hive-dmp'].session !== original.session,
      vodCopied: next.clientParameters.configOverrides['hive-dmp'].session.vod !== original.session.vod,
      filteringCopied: next.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering !== original.session.vod.playlistFiltering,
      attributesCopied: next.clientParameters.configOverrides['hive-dmp'].session.vod.playbackAttributesConfig !== original.session.vod.playbackAttributesConfig,
      resolutionCopied: next.clientParameters.configOverrides['hive-dmp'].session.vod.playbackAttributesConfig.resolution
        !== original.session.vod.playbackAttributesConfig.resolution,
      engine: next.clientParameters.configOverrides['hive-dmp'].engine,
      adsPreserved: next.clientParameters.configOverrides['hive-dmp'].ads === original.ads,
      livePreserved: next.clientParameters.configOverrides['hive-dmp'].session.live === original.session.live,
      blockListPreserved: next.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.blockVideoFormats
        === original.session.vod.playlistFiltering.blockVideoFormats,
    };
  })()`), {
    rootCopied: true,
    clientCopied: true,
    overridesCopied: true,
    hiveCopied: true,
    engineCopied: true,
    sessionCopied: true,
    vodCopied: true,
    filteringCopied: true,
    attributesCopied: true,
    resolutionCopied: true,
    engine: {keep: 'engine-override', drmPlayReadyRecommendationFlow: true},
    adsPreserved: true,
    livePreserved: true,
    blockListPreserved: true,
  }, 'UHD SDK PlayReady copy-on-write preserves unrelated nested objects');
}

{
  const configurations = [{
    initDataTypes: ['cenc'], sessionTypes: ['temporary'], persistentState: 'optional',
    distinctiveIdentifier: 'not-allowed',
    videoCapabilities: [{contentType: 'video/mp4', robustness: '2000'}],
  }];
  const result = api.planEmeRequest('com.microsoft.playready', configurations, NATIVE_CAP_MODE);
  assert.equal(result.changed, false, 'native-cap mode leaves the native EME request untouched');
  assert.equal(result.keySystem, 'com.microsoft.playready');
  assert.equal(result.configurations, configurations);
}

const missingResult = fromRealmJson(planRealm, `(() => {
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions({}, ${JSON.stringify(SDK_MODE)});
  return {changed: result.changed, maxHeight: result.options.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.maxHeight,
    resolution: result.options.clientParameters.configOverrides['hive-dmp'].session.vod.playbackAttributesConfig.resolution.max};
})()`);
assert.deepEqual(missingResult, {changed: true, maxHeight: 1080, resolution: ['1920x1080']}, 'missing override records are created safely');
const uhdMissingResult = fromRealmJson(planRealm, `(() => {
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions({}, ${JSON.stringify(UHD_PLAYREADY_MODE)});
  const hive = result.options.clientParameters.configOverrides['hive-dmp'];
  return {changed: result.changed, flow: hive.engine.drmPlayReadyRecommendationFlow,
    maxHeight: hive.session.vod.playlistFiltering.maxHeight,
    resolution: hive.session.vod.playbackAttributesConfig.resolution.max};
})()`);
assert.deepEqual(uhdMissingResult, {
  changed: true,
  flow: true,
  maxHeight: 2160,
  resolution: ['3840x2160'],
}, 'missing override records are created safely for UHD');

const invalidCases = [
  ['null options', 'null'],
  ['array options', '[]'],
  ['clientParameters array', '(() => { const value = makeSdkOptions(); value.clientParameters = []; return value; })()'],
  ['playlistFiltering array', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering = []; return value; })()'],
  ['top-level accessor', '(() => { const value = makeSdkOptions(); Object.defineProperty(value, \'clientParameters\', {get() { return {}; }, configurable: true}); return value; })()'],
  ['symbol accessor', '(() => { const value = makeSdkOptions(); Object.defineProperty(value, Symbol(\'accessor\'), {get() { return true; }, configurable: true}); return value; })()'],
  ['nested accessor', '(() => { const value = makeSdkOptions(); Object.defineProperty(value.clientParameters, \'configOverrides\', {get() { return {}; }, configurable: true}); return value; })()'],
  ['NaN minHeight', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering.minHeight = NaN; return value; })()'],
  ['Infinity minHeight', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering.minHeight = Infinity; return value; })()'],
  ['negative Infinity minHeight', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering.minHeight = -Infinity; return value; })()'],
  ['above-cap minHeight', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering.minHeight = 1081; return value; })()'],
  ['string minHeight', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering.minHeight = \'720\'; return value; })()'],
  ['null minHeight', '(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides[\'hive-dmp\'].session.vod.playlistFiltering.minHeight = null; return value; })()'],
];
for (const [label, expression] of invalidCases) {
  const outcome = fromRealmJson(planRealm, `(() => {
    const value = (${expression});
    const before = JSON.stringify(value);
    const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(value, ${JSON.stringify(SDK_MODE)});
    return {changed: result.changed, same: result.options === value, before, after: JSON.stringify(value)};
  })()`);
  assert.deepEqual(outcome, {changed: false, same: true, before: outcome.before, after: outcome.before}, `${label} is rejected without mutation`);
}
for (const [label, expression] of invalidCases.filter(([label]) => label !== 'above-cap minHeight')) {
  const outcome = fromRealmJson(planRealm, `(() => {
    const value = (${expression});
    const before = JSON.stringify(value);
    const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(value, ${JSON.stringify(UHD_PLAYREADY_MODE)});
    return {changed: result.changed, same: result.options === value, before, after: JSON.stringify(value)};
  })()`);
  assert.deepEqual(outcome, {changed: false, same: true, before: outcome.before, after: outcome.before},
    `UHD ${label} is rejected without mutation`);
}
const invalidPlayReadyEngines = [
  ...[['engine array', '[]'], ['engine null', 'null'], ['engine string', '\'unknown-engine\''],
    ['engine class instance', 'new (class Engine {})()']].map(([label, expression]) => [label,
    `(() => { const value = makeSdkOptions(); value.clientParameters.configOverrides['hive-dmp'].engine = ${expression}; return value; })()`]),
  ['engine accessor', '(() => { const value = makeSdkOptions(); let calls = 0; Object.defineProperty(value.clientParameters.configOverrides[\'hive-dmp\'], \'engine\', {get() { calls++; return {}; }, configurable: true}); value.__getterCalls = () => calls; return value; })()'],
  ['engine symbol accessor', '(() => { const value = makeSdkOptions(); Object.defineProperty(value.clientParameters.configOverrides[\'hive-dmp\'].engine, Symbol(\'accessor\'), {get() { return true; }, configurable: true}); return value; })()'],
];
for (const mode of [PLAYREADY_MODE, UHD_PLAYREADY_MODE]) {
  for (const [label, expression] of invalidPlayReadyEngines) {
    const outcome = fromRealmJson(planRealm, `(() => {
      const value = (${expression});
      const dataAt = (object, key) => {
        const descriptor = object && typeof object === 'object' ? Object.getOwnPropertyDescriptor(object, key) : null;
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
      };
      const engine = dataAt(dataAt(dataAt(value, 'clientParameters'), 'configOverrides'), 'hive-dmp');
      const engineDescriptor = engine && Object.getOwnPropertyDescriptor(engine, 'engine');
      const fingerprint = () => ({
        topKeys: value && typeof value === 'object' ? Reflect.ownKeys(value).map(String) : [],
        engineKind: !engineDescriptor ? 'missing'
          : Object.prototype.hasOwnProperty.call(engineDescriptor, 'value')
            ? (engineDescriptor.value === null ? 'null' : Array.isArray(engineDescriptor.value) ? 'array' : typeof engineDescriptor.value)
            : 'accessor',
        engineKeys: engineDescriptor && Object.prototype.hasOwnProperty.call(engineDescriptor, 'value')
          && engineDescriptor.value && typeof engineDescriptor.value === 'object'
          ? Reflect.ownKeys(engineDescriptor.value).map(String) : [],
      });
      const before = fingerprint();
      const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(value, ${JSON.stringify(mode)});
      return {changed: result.changed, same: result.options === value, before, after: fingerprint(), getterCalls: value?.__getterCalls ? value.__getterCalls() : 0};
    })()`);
    assert.deepEqual(outcome, {changed: false, same: true, before: outcome.before, after: outcome.before, getterCalls: 0},
      `${mode} ${label} rejects the SDK PlayReady override without reading or mutating the input`);
  }
}
const acceptedMinHeights = fromRealmJson(planRealm, `(() => [360, 1080].map((minHeight) => {
  const value = makeSdkOptions();
  value.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.minHeight = minHeight;
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(value, ${JSON.stringify(SDK_MODE)});
  return [result.changed, result.options.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.maxHeight];
}))()`);
assert.deepEqual(acceptedMinHeights, [[true, 1080], [true, 1080]], 'finite minHeight values within the cap remain usable');

const acceptedUhdMinHeights = fromRealmJson(planRealm, `(() => [360, 2160].map((minHeight) => {
  const value = makeSdkOptions();
  value.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.minHeight = minHeight;
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(value, ${JSON.stringify(UHD_PLAYREADY_MODE)});
  return [result.changed, result.options.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.maxHeight];
}))()`);
assert.deepEqual(acceptedUhdMinHeights, [[true, 2160], [true, 2160]],
  'UHD finite minHeight values at and below the 2160 cap remain usable');
const rejectedUhdMinHeight = fromRealmJson(planRealm, `(() => {
  const value = makeSdkOptions();
  value.clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.minHeight = 2161;
  const before = JSON.stringify(value);
  const result = __DP4K_INTERNALS__.planPlaybackSessionOptions(value, ${JSON.stringify(UHD_PLAYREADY_MODE)});
  return {changed: result.changed, same: result.options === value, before, after: JSON.stringify(value)};
})()`);
assert.deepEqual(rejectedUhdMinHeight, {
  changed: false,
  same: true,
  before: rejectedUhdMinHeight.before,
  after: rejectedUhdMinHeight.before,
}, 'UHD minHeight=2161 is rejected fail-closed without mutation');

const createRuntime = ({preloadSdk = false, sdkVersion = SDK_VERSION, mode = SDK_MODE, emeMode = 'valid'} = {}) => {
  const callbacks = new Map();
  let reloads = 0;
  const localStorage = makeStorage([['ioridev.disneyplus4k.mode.v1', mode]]);
  const sessionStorage = makeStorage([[
    TICKET_KEY,
    JSON.stringify({version: SCRIPT_VERSION, mode, documentUrl: DOCUMENT_URL, createdAt: Date.now() - 100}),
  ]]);
  const context = vm.createContext({
    URL,
    DOMException,
    console,
    localStorage,
    sessionStorage,
    performance: {getEntriesByType: () => [{type: 'reload'}]},
    location: {href: DOCUMENT_URL, pathname: '/ja-jp/play/sdk-override-test', reload: () => { reloads += 1; }},
    document: {documentElement: null, currentScript: null, querySelectorAll: () => []},
    MutationObserver: class { observe() {} disconnect() {} },
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
      const url = input && typeof input === 'object' && 'url' in input ? input.url : String(input);
      return Promise.resolve({url, status: 200, ok: true});
    };
    globalThis.nativeXhrOpenCalls = [];
    globalThis.nativeXhrSendCalls = [];
    globalThis.nativeXhrListenerCalls = [];
    globalThis.nativeRequestCalls = [];
    globalThis.nativeRequestPromise = Promise.resolve({native: 'eme'});
    class TestXHR {
      open(...args) {
        nativeXhrOpenCalls.push({thisValue: this, args});
      }
      send(...args) {
        nativeXhrSendCalls.push({thisValue: this, args});
      }
      addEventListener(...args) {
        nativeXhrListenerCalls.push({thisValue: this, args});
      }
    }
    globalThis.XMLHttpRequest = TestXHR;
    class TestNavigator {
      requestMediaKeySystemAccess(...args) {
        nativeRequestCalls.push({thisValue: this, args});
        return nativeRequestPromise;
      }
    }
    ${emeMode === 'valid' || emeMode === 'nonconfigurable' ? 'globalThis.navigator = new TestNavigator();' : ''}
    globalThis.makeRuntimeOptions = function makeRuntimeOptions() {
      return {
        clientParameters: {
          configOverrides: {
            'hive-dmp': {engine: {runtimeKeep: true, drmPlayReadyRecommendationFlow: false}},
          },
        },
        rootKeep: 'runtime-preserved',
      };
    };
  `, context);
  if (emeMode === 'nonconfigurable') {
    vm.runInContext("Object.defineProperty(Object.getPrototypeOf(navigator), 'requestMediaKeySystemAccess', {configurable: false});", context);
  }
  if (preloadSdk) installSdkFixture(context, sdkVersion, true);
  vm.runInContext(source, context);
  if (preloadSdk && mode === UHD_PLAYREADY_MODE) {
    vm.runInContext(`document.currentScript = {src: ${JSON.stringify(PLAYBACK_SESSION_URL)}}; globalThis['playback-session'] = sdkSessionExport;`, context);
  }
  return {context, callbacks, localStorage, sessionStorage, get reloads() { return reloads; }};
};

const installSdkFixture = (context, version, assign) => {
  vm.runInContext(`
    globalThis.sdkCalls = [];
    globalThis.sdkSessionCalls = [];
    globalThis.sdkExpectedPromise = Promise.resolve({sdk: true});
    class TestPlaybackSession {
      constructor(...args) {
        sdkSessionCalls.push({thisValue: this, args});
        this.nativeMarker = 'native-playback-session';
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
        if (args[0] && args[0].__throwNative) throw new Error('native create failure');
        const Session = globalThis['playback-session']?.PlaybackSession;
        if (typeof Session === 'function') {
          const sessionOptions = {
            playbackServiceVersion: ${JSON.stringify(version)},
            mediaCapabilities: {
              videoResolutions: ['SD', 'HD', 'FHD'],
              audioResolutions: ['STEREO', '5.1'],
              nested: {keep: 'native-capability'},
            },
          };
          globalThis.sdkNativeSessionOptions = sessionOptions;
          globalThis.sdkConstructedSession = new Session(sessionOptions, {marker: 'native-session'});
        }
        return sdkExpectedPromise;
      }
    }
    Object.defineProperty(TestPlaybackService, 'version', {value: ${JSON.stringify(version)}, configurable: true});
    globalThis.sdkNativeCreate = TestPlaybackService.prototype.createPlaybackSession;
    globalThis.sdkInstance = new TestPlaybackService();
    globalThis.sdkExport = {PlaybackService: TestPlaybackService};
    ${assign ? `Object.defineProperty(globalThis, 'playback-service', {value: sdkExport, configurable: true, enumerable: true, writable: true});` : ''}
  `, context);
};

const assertUnappliedTrafficIsBlocked = async (runtime) => {
  const {context} = runtime;
  await assert.rejects(
    vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method: 'POST', body: ${JSON.stringify(PLAYBACK_BODY)}})`, context),
    (error) => error?.name === 'AbortError',
    'playback fetch is stopped before SDK configuration is applied',
  );
  assert.equal(vm.runInContext('nativeFetchCalls.length', context), 0, 'blocked playback fetch never reaches native fetch');
  vm.runInContext(`globalThis.blockedXhr = new XMLHttpRequest(); blockedXhr.open('POST', ${JSON.stringify(PLAYBACK_URL)}, true);`, context);
  assert.throws(
    () => vm.runInContext(`blockedXhr.send(${JSON.stringify(PLAYBACK_BODY)})`, context),
    (error) => error?.name === 'AbortError',
    'playback XHR is stopped before SDK configuration is applied',
  );
  assert.equal(vm.runInContext('nativeXhrSendCalls.length', context), 0, 'blocked playback XHR never reaches native send');
  await vm.runInContext("fetch('https://example.test/unrelated', {method: 'POST', body: 'unchanged'})", context);
  assert.equal(vm.runInContext('nativeFetchCalls.length', context), 1, 'unrelated fetch remains native');
  vm.runInContext("globalThis.unrelatedXhr = new XMLHttpRequest(); unrelatedXhr.open('POST', 'https://example.test/unrelated', true); unrelatedXhr.send('unchanged');", context);
  assert.equal(vm.runInContext('nativeXhrSendCalls.length', context), 1, 'unrelated XHR remains native');
  assert.equal(vm.runInContext('nativeFetchCalls[0].thisValue === globalThis', context), true, 'native fetch this is preserved');
  assert.equal(vm.runInContext('nativeXhrSendCalls[0].thisValue === unrelatedXhr', context), true, 'native XHR this is preserved');
};

const assertUhdPreApplicationIsBlocked = async (runtime) => {
  const {context} = runtime;
  const requestCount = vm.runInContext('nativeRequestCalls.length', context);
  const result = vm.runInContext(`globalThis.uhdPreApplicationEme = navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{}]); uhdPreApplicationEme`, context);
  assert.equal(vm.runInContext('uhdPreApplicationEme instanceof Promise', context), true,
    'UHD pre-application EME gate rejects through a Promise');
  await assert.rejects(result, error => error?.name === 'AbortError',
    'UHD pre-application EME request is stopped');
  assert.equal(vm.runInContext('nativeRequestCalls.length', context), requestCount,
    'UHD pre-application EME request never reaches native EME');
  await assertUnappliedTrafficIsBlocked(runtime);
};

const delayed = createRuntime();
assert.deepEqual(fromRealmJson(delayed.context, `(() => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'playback-service');
  return {get: typeof descriptor?.get, set: typeof descriptor?.set};
})()`), {get: 'function', set: 'function'}, 'SDK global is watched while it is not yet published');
installSdkFixture(delayed.context, SDK_VERSION, false);
vm.runInContext("globalThis['playback-service'] = sdkExport;", delayed.context);
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession !== sdkNativeCreate', delayed.context), true,
  'delayed export is patched only after the supported SDK appears');

const delayedCall = fromRealmJson(delayed.context, `(() => {
  const options = makeRuntimeOptions();
  const marker = {marker: true};
  const returned = sdkInstance.createPlaybackSession(options, marker, undefined);
  const call = sdkCalls.at(-1);
  const vod = call.args[0].clientParameters.configOverrides['hive-dmp'].session.vod;
  return {
    promiseSame: returned === sdkExpectedPromise,
    nativeThis: call.thisValue === sdkInstance,
    argCount: call.args.length,
    markerSame: call.args[1] === marker,
    thirdArgumentPreserved: call.args.length === 3 && call.args[2] === undefined,
    optionsCopied: call.args[0] !== options,
    maxHeight: vod.playlistFiltering.maxHeight,
    resolutionMax: vod.playbackAttributesConfig.resolution.max,
  };
})()`);
assert.deepEqual(delayedCall, {
  promiseSame: true,
  nativeThis: true,
  argCount: 3,
  markerSame: true,
  thirdArgumentPreserved: true,
  optionsCopied: true,
  maxHeight: 1080,
  resolutionMax: ['1920x1080'],
}, 'SDK native this, complete arguments, Promise identity, and both VOD paths are preserved');
assert.throws(
  () => vm.runInContext(`(() => { const options = makeRuntimeOptions(); options.__throwNative = true; return sdkInstance.createPlaybackSession(options); })()`, delayed.context),
  /native create failure/,
  'native SDK exceptions are not swallowed',
);
await assert.rejects(vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, delayed.context),
  error => error.name === 'AbortError', 'a failed later SDK attempt revokes the previous ready state');
await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', delayed.context);
await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method: 'POST', body: ${JSON.stringify(PLAYBACK_BODY)}})`, delayed.context);
assert.equal(vm.runInContext('nativeFetchCalls.length', delayed.context), 1, 'applied SDK configuration allows playback fetch to continue');
assert.equal(vm.runInContext('nativeFetchCalls[0].input', delayed.context).includes('tv-drm-ctr-h265-atmos'), true,
  'playback scenario rewrite still reaches native fetch');

const existing = createRuntime({preloadSdk: true});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession !== sdkNativeCreate', existing.context), true,
  'already-published supported SDK export is patched');
const existingCall = fromRealmJson(existing.context, `(() => {
  const options = makeRuntimeOptions();
  const returned = sdkInstance.createPlaybackSession(options, 'existing-marker');
  return {promiseSame: returned === sdkExpectedPromise, argCount: sdkCalls.at(-1).args.length,
    marker: sdkCalls.at(-1).args[1], maxHeight: sdkCalls.at(-1).args[0].clientParameters.configOverrides['hive-dmp'].session.vod.playlistFiltering.maxHeight};
})()`);
assert.deepEqual(existingCall, {promiseSame: true, argCount: 2, marker: 'existing-marker', maxHeight: 1080},
  'existing export keeps native arguments and applies the same session-only override');

const nativeCap = createRuntime({preloadSdk: true, mode: NATIVE_CAP_MODE});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession !== sdkNativeCreate', nativeCap.context), true,
  'native-cap mode patches the supported SDK wrapper');
const nativeCapCall = fromRealmJson(nativeCap.context, `(() => {
  const options = makeRuntimeOptions();
  const marker = {marker: 'native-cap'};
  const returned = sdkInstance.createPlaybackSession(options, marker);
  const call = sdkCalls.at(-1);
  const vod = call.args[0].clientParameters.configOverrides['hive-dmp'].session.vod;
  return {
    promiseSame: returned === sdkExpectedPromise,
    nativeThis: call.thisValue === sdkInstance,
    markerSame: call.args[1] === marker,
    optionsCopied: call.args[0] !== options,
    maxHeight: vod.playlistFiltering.maxHeight,
    resolutionMax: vod.playbackAttributesConfig.resolution.max,
  };
})()`);
assert.deepEqual(nativeCapCall, {
  promiseSame: true,
  nativeThis: true,
  markerSame: true,
  optionsCopied: true,
  maxHeight: 1080,
  resolutionMax: ['1920x1080'],
}, 'native-cap wrapper preserves native call identity while applying only the VOD cap');
await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, nativeCap.context);
assert.equal(vm.runInContext('nativeFetchCalls.length', nativeCap.context), 1,
  'native-cap mode allows known playback POST after the SDK override is applied');
const nativeCapMissingSdk = createRuntime({mode: NATIVE_CAP_MODE});
await assertUnappliedTrafficIsBlocked(nativeCapMissingSdk);
const nativeCapWrongVersion = createRuntime({preloadSdk: true, mode: NATIVE_CAP_MODE, sdkVersion: '26.10.0-other'});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession === sdkNativeCreate', nativeCapWrongVersion.context), true,
  'native-cap mode does not patch an unsupported SDK version');
await assertUnappliedTrafficIsBlocked(nativeCapWrongVersion);

const sdkPlayReady = createRuntime({preloadSdk: true, mode: PLAYREADY_MODE});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession !== sdkNativeCreate', sdkPlayReady.context), true,
  'SDK PlayReady mode patches the supported SDK wrapper');
const sdkPlayReadyCall = fromRealmJson(sdkPlayReady.context, `(() => {
  const options = makeRuntimeOptions();
  const marker = {marker: 'sdk-playready'};
  const returned = sdkInstance.createPlaybackSession(options, marker);
  const call = sdkCalls.at(-1);
  const hive = call.args[0].clientParameters.configOverrides['hive-dmp'];
  const vod = hive.session.vod;
  return {
    promiseSame: returned === sdkExpectedPromise,
    nativeThis: call.thisValue === sdkInstance,
    markerSame: call.args[1] === marker,
    optionsCopied: call.args[0] !== options,
    engine: hive.engine,
    maxHeight: vod.playlistFiltering.maxHeight,
    resolutionMax: vod.playbackAttributesConfig.resolution.max,
  };
})()`);
assert.deepEqual(sdkPlayReadyCall, {
  promiseSame: true,
  nativeThis: true,
  markerSame: true,
  optionsCopied: true,
  engine: {runtimeKeep: true, drmPlayReadyRecommendationFlow: true},
  maxHeight: 1080,
  resolutionMax: ['1920x1080'],
}, 'SDK PlayReady wrapper preserves native call shape and applies the engine/VOD overrides');
await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, sdkPlayReady.context);
assert.equal(vm.runInContext('nativeFetchCalls.length', sdkPlayReady.context), 1,
  'SDK PlayReady mode allows known playback POST after the SDK override is applied');
const sdkPlayReadyMissingSdk = createRuntime({mode: PLAYREADY_MODE});
await assertUnappliedTrafficIsBlocked(sdkPlayReadyMissingSdk);
const sdkPlayReadyWrongVersion = createRuntime({preloadSdk: true, mode: PLAYREADY_MODE, sdkVersion: '26.10.0-other'});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession === sdkNativeCreate', sdkPlayReadyWrongVersion.context), true,
  'SDK PlayReady mode does not patch an unsupported SDK version');
await assertUnappliedTrafficIsBlocked(sdkPlayReadyWrongVersion);

const uhdPreApplication = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE});
await assertUhdPreApplicationIsBlocked(uhdPreApplication);

const uhdSdkPlayReady = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession !== sdkNativeCreate', uhdSdkPlayReady.context), true,
  'UHD SDK PlayReady mode patches the supported SDK wrapper');
const uhdSdkPlayReadyCall = fromRealmJson(uhdSdkPlayReady.context, `(() => {
  const options = makeRuntimeOptions();
  const marker = {marker: 'uhd-sdk-playready'};
  const returned = sdkInstance.createPlaybackSession(options, marker, undefined);
  const call = sdkCalls.at(-1);
  const sessionCall = sdkSessionCalls.at(-1);
  const sessionOptions = sessionCall.args[0];
  const nativeOptionsSnapshot = JSON.stringify(sdkNativeSessionOptions);
  const namespaceDescriptor = Object.getOwnPropertyDescriptor(globalThis['playback-session'], 'PlaybackSession');
  const hive = call.args[0].clientParameters.configOverrides['hive-dmp'];
  const vod = hive.session.vod;
  return {
    promiseSame: returned === sdkExpectedPromise,
    nativeThis: call.thisValue === sdkInstance,
    argCount: call.args.length,
    markerSame: call.args[1] === marker,
    thirdArgumentPreserved: call.args.length === 3 && call.args[2] === undefined,
    optionsCopied: call.args[0] !== options,
    engine: hive.engine,
    maxHeight: vod.playlistFiltering.maxHeight,
    resolutionMax: vod.playbackAttributesConfig.resolution.max,
    sessionCount: sdkSessionCalls.length,
    sessionNativeThis: sessionCall.thisValue instanceof sdkNativeSession,
    sessionArgCount: sessionCall.args.length,
    sessionMarker: sessionCall.args[1].marker,
    sessionOptionsCopied: sessionOptions !== sdkNativeSessionOptions,
    capabilitiesCopied: sessionOptions.mediaCapabilities !== sdkNativeSessionOptions.mediaCapabilities,
    resolutionsCopied: sessionOptions.mediaCapabilities.videoResolutions
      !== sdkNativeSessionOptions.mediaCapabilities.videoResolutions,
    audioResolutionsPreserved: sessionOptions.mediaCapabilities.audioResolutions
      === sdkNativeSessionOptions.mediaCapabilities.audioResolutions,
    nestedCapabilityPreserved: sessionOptions.mediaCapabilities.nested
      === sdkNativeSessionOptions.mediaCapabilities.nested,
    playbackServiceVersion: sessionOptions.playbackServiceVersion,
    videoResolutions: sessionOptions.mediaCapabilities.videoResolutions,
    audioResolutions: sessionOptions.mediaCapabilities.audioResolutions,
    nestedCapability: sessionOptions.mediaCapabilities.nested,
    nativeOptionsUnchanged: JSON.stringify(sdkNativeSessionOptions) === nativeOptionsSnapshot,
    constructedInstance: sdkConstructedSession instanceof sdkNativeSession,
    namespaceCopied: globalThis['playback-session'] !== sdkSessionExport,
    namespaceConstructorExposed: typeof namespaceDescriptor?.value === 'function'
      || typeof namespaceDescriptor?.get === 'function',
  };
})()`);
assert.deepEqual(uhdSdkPlayReadyCall, {
  promiseSame: true,
  nativeThis: true,
  argCount: 3,
  markerSame: true,
  thirdArgumentPreserved: true,
  optionsCopied: true,
  engine: {runtimeKeep: true, drmPlayReadyRecommendationFlow: true},
  maxHeight: 2160,
  resolutionMax: ['3840x2160'],
  sessionCount: 1,
  sessionNativeThis: true,
  sessionArgCount: 2,
  sessionMarker: 'native-session',
  sessionOptionsCopied: true,
  capabilitiesCopied: true,
  resolutionsCopied: true,
  audioResolutionsPreserved: true,
  nestedCapabilityPreserved: true,
  playbackServiceVersion: '26.10.0-jasmine',
  videoResolutions: ['SD', 'HD', 'FHD', 'UHD'],
  audioResolutions: ['STEREO', '5.1'],
  nestedCapability: {keep: 'native-capability'},
  nativeOptionsUnchanged: true,
  constructedInstance: true,
  namespaceCopied: true,
  namespaceConstructorExposed: true,
}, 'UHD SDK PlayReady wrapper preserves native call shape and applies only the engine/VOD overrides');
await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, uhdSdkPlayReady.context);
assert.equal(vm.runInContext('nativeFetchCalls.length', uhdSdkPlayReady.context), 1,
  'UHD SDK PlayReady mode allows known playback POST after the SDK override is applied');
assert.equal(vm.runInContext('nativeFetchCalls[0].input', uhdSdkPlayReady.context).includes('tv-drm-ctr-h265-hdr10-atmos'), true,
  'UHD playback scenario rewrite reaches native fetch');
const uhdEmeResult = vm.runInContext(`(() => {
  const configurations = [{
    initDataTypes: ['cenc'], sessionTypes: ['temporary', 'persistent-license'], persistentState: 'optional',
    distinctiveIdentifier: 'required',
    videoCapabilities: [{contentType: 'video/mp4', robustness: '2000'}],
    audioCapabilities: [{contentType: 'audio/mp4', robustness: '3000'}],
  }];
  globalThis.uhdEmeInput = configurations;
  globalThis.nativeRequestPromise = Promise.resolve({eme: 'ready'});
  globalThis.uhdEmeResult = navigator.requestMediaKeySystemAccess('com.microsoft.playready', configurations, {marker: 'uhd-eme'});
  return uhdEmeResult;
})()`, uhdSdkPlayReady.context);
assert.equal(vm.runInContext('uhdEmeResult === nativeRequestPromise', uhdSdkPlayReady.context), true,
  'UHD post-application EME preserves the native Promise identity');
await uhdEmeResult;
assert.deepEqual(fromRealmJson(uhdSdkPlayReady.context, `(() => {
  const call = nativeRequestCalls.at(-1);
  const configuration = call.args[1][0];
  return {
    nativeThis: call.thisValue === navigator,
    keySystem: call.args[0],
    distinctiveIdentifier: configuration.distinctiveIdentifier,
    sessionTypes: configuration.sessionTypes,
    persistentState: configuration.persistentState,
    videoRobustness: configuration.videoCapabilities[0].robustness,
    audioRobustness: configuration.audioCapabilities[0].robustness,
  };
})()`), {
  nativeThis: true,
  keySystem: 'com.microsoft.playready',
  distinctiveIdentifier: 'not-allowed',
  sessionTypes: ['temporary', 'persistent-license'],
  persistentState: 'optional',
  videoRobustness: '2000',
  audioRobustness: '3000',
}, 'UHD post-application EME remains DI-only with native DRM policy fields preserved');
const uhdSecondCreate = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE});
await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', uhdSecondCreate.context);
const uhdSecondResult = vm.runInContext('globalThis.uhdSecondResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); uhdSecondResult', uhdSecondCreate.context);
assert.equal(vm.runInContext('uhdSecondResult instanceof Promise', uhdSecondCreate.context), true,
  'UHD second createPlaybackSession call rejects through a Promise');
await assert.rejects(uhdSecondResult, error => error?.name === 'AbortError',
  'UHD SDK createPlaybackSession is limited to one call per document');
assert.equal(vm.runInContext('sdkCalls.length', uhdSecondCreate.context), 1,
  'UHD second createPlaybackSession call never reaches native SDK create');
assert.equal(vm.runInContext('sdkSessionCalls.length', uhdSecondCreate.context), 1,
  'UHD second createPlaybackSession call never constructs another session');

const uhdNativeError = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE});
assert.throws(
  () => vm.runInContext(`(() => { const options = makeRuntimeOptions(); options.__throwNative = true; return sdkInstance.createPlaybackSession(options); })()`, uhdNativeError.context),
  /native create failure/,
  'UHD native SDK exceptions are not swallowed',
);
assert.equal(vm.runInContext('sdkCalls.length', uhdNativeError.context), 1,
  'UHD native exception consumes only the one SDK create attempt');
assert.equal(vm.runInContext('sdkSessionCalls.length', uhdNativeError.context), 0,
  'UHD native exception prevents the playback-session constructor');
await assertUnappliedTrafficIsBlocked(uhdNativeError);

const uhdFailedAsync = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE});
const uhdRejectedCreate = vm.runInContext(`sdkExpectedPromise = Promise.reject(new Error('async UHD SDK failure')); sdkInstance.createPlaybackSession(makeRuntimeOptions());`, uhdFailedAsync.context);
assert.equal(uhdRejectedCreate, uhdFailedAsync.context.sdkExpectedPromise,
  'UHD rejected native Promise identity is preserved');
assert.equal(vm.runInContext('sdkSessionCalls.length', uhdFailedAsync.context), 1,
  'UHD rejected native Promise still constructs exactly one session');
await assert.rejects(uhdRejectedCreate, /async UHD SDK failure/);
await assertUnappliedTrafficIsBlocked(uhdFailedAsync);
const uhdSdkPlayReadyMissingSdk = createRuntime({mode: UHD_PLAYREADY_MODE});
await assertUnappliedTrafficIsBlocked(uhdSdkPlayReadyMissingSdk);
const uhdSdkPlayReadyWrongVersion = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE, sdkVersion: '26.10.0-other'});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession === sdkNativeCreate', uhdSdkPlayReadyWrongVersion.context), true,
  'UHD SDK PlayReady mode does not patch an unsupported SDK version');
await assertUnappliedTrafficIsBlocked(uhdSdkPlayReadyWrongVersion);

const sdkPlayReadyMissingEme = createRuntime({preloadSdk: true, mode: PLAYREADY_MODE, emeMode: 'missing'});
const missingEmeResult = vm.runInContext('globalThis.missingEmeResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); missingEmeResult', sdkPlayReadyMissingEme.context);
assert.equal(vm.runInContext('missingEmeResult instanceof Promise', sdkPlayReadyMissingEme.context), true, 'missing EME guard rejects through a Promise');
await assert.rejects(missingEmeResult, error => error?.name === 'AbortError',
  'SDK PlayReady mode stops when the EME API is unavailable');
assert.equal(vm.runInContext('sdkCalls.length', sdkPlayReadyMissingEme.context), 0,
  'missing EME guard prevents the native SDK call');
await assertUnappliedTrafficIsBlocked(sdkPlayReadyMissingEme);

const sdkPlayReadyNonconfigurableEme = createRuntime({preloadSdk: true, mode: PLAYREADY_MODE, emeMode: 'nonconfigurable'});
assert.deepEqual(fromRealmJson(sdkPlayReadyNonconfigurableEme.context, `(() => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'requestMediaKeySystemAccess');
  return {type: typeof descriptor?.value, configurable: descriptor?.configurable};
})()`), {type: 'function', configurable: false},
  'non-configurable EME fixture retains a real native function');
const nonconfigurableEmeResult = vm.runInContext('globalThis.nonconfigurableEmeResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); nonconfigurableEmeResult', sdkPlayReadyNonconfigurableEme.context);
assert.equal(vm.runInContext('nonconfigurableEmeResult instanceof Promise', sdkPlayReadyNonconfigurableEme.context), true, 'non-configurable EME guard rejects through a Promise');
await assert.rejects(nonconfigurableEmeResult, error => error?.name === 'AbortError',
  'SDK PlayReady mode stops when the EME API cannot be wrapped');
assert.equal(vm.runInContext('sdkCalls.length', sdkPlayReadyNonconfigurableEme.context), 0,
  'non-configurable EME guard prevents the native SDK call');
await assertUnappliedTrafficIsBlocked(sdkPlayReadyNonconfigurableEme);

const sdkPlayReadyLateEme = createRuntime({preloadSdk: true, mode: PLAYREADY_MODE, emeMode: 'missing'});
vm.runInContext(`Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
  configurable: true,
  writable: true,
  value: function lateNativeEme() { return Promise.resolve(null); },
});`, sdkPlayReadyLateEme.context);
assert.equal(vm.runInContext(`typeof Object.getOwnPropertyDescriptor(navigator, 'requestMediaKeySystemAccess').value`, sdkPlayReadyLateEme.context), 'function',
  'late EME replacement is a real function but is not retroactively guarded');
const lateEmeResult = vm.runInContext('globalThis.lateEmeResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); lateEmeResult', sdkPlayReadyLateEme.context);
assert.equal(vm.runInContext('lateEmeResult instanceof Promise', sdkPlayReadyLateEme.context), true, 'late EME replacement rejects through a Promise');
await assert.rejects(lateEmeResult, error => error?.name === 'AbortError',
  'SDK PlayReady mode stops after an unwrapped late EME replacement');
assert.equal(vm.runInContext('sdkCalls.length', sdkPlayReadyLateEme.context), 0,
  'late EME replacement cannot enable the native SDK call');
await assertUnappliedTrafficIsBlocked(sdkPlayReadyLateEme);

const uhdSdkPlayReadyMissingEme = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE, emeMode: 'missing'});
const uhdMissingEmeResult = vm.runInContext('globalThis.uhdMissingEmeResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); uhdMissingEmeResult', uhdSdkPlayReadyMissingEme.context);
assert.equal(vm.runInContext('uhdMissingEmeResult instanceof Promise', uhdSdkPlayReadyMissingEme.context), true,
  'UHD SDK PlayReady missing EME guard rejects through a Promise');
await assert.rejects(uhdMissingEmeResult, error => error?.name === 'AbortError',
  'UHD SDK PlayReady mode stops when the EME API is unavailable');
assert.equal(vm.runInContext('sdkCalls.length', uhdSdkPlayReadyMissingEme.context), 0,
  'UHD missing EME guard prevents the native SDK call');
await assertUnappliedTrafficIsBlocked(uhdSdkPlayReadyMissingEme);

const uhdSdkPlayReadyNonconfigurableEme = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE, emeMode: 'nonconfigurable'});
assert.deepEqual(fromRealmJson(uhdSdkPlayReadyNonconfigurableEme.context, `(() => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'requestMediaKeySystemAccess');
  return {type: typeof descriptor?.value, configurable: descriptor?.configurable};
})()`), {type: 'function', configurable: false},
  'UHD non-configurable EME fixture retains a real native function');
const uhdNonconfigurableEmeResult = vm.runInContext('globalThis.uhdNonconfigurableEmeResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); uhdNonconfigurableEmeResult', uhdSdkPlayReadyNonconfigurableEme.context);
assert.equal(vm.runInContext('uhdNonconfigurableEmeResult instanceof Promise', uhdSdkPlayReadyNonconfigurableEme.context), true,
  'UHD non-configurable EME guard rejects through a Promise');
await assert.rejects(uhdNonconfigurableEmeResult, error => error?.name === 'AbortError',
  'UHD SDK PlayReady mode stops when the EME API cannot be wrapped');
assert.equal(vm.runInContext('sdkCalls.length', uhdSdkPlayReadyNonconfigurableEme.context), 0,
  'UHD non-configurable EME guard prevents the native SDK call');
await assertUnappliedTrafficIsBlocked(uhdSdkPlayReadyNonconfigurableEme);

const uhdSdkPlayReadyLateEme = createRuntime({preloadSdk: true, mode: UHD_PLAYREADY_MODE, emeMode: 'missing'});
vm.runInContext(`Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
  configurable: true,
  writable: true,
  value: function uhdLateNativeEme() { return Promise.resolve(null); },
});`, uhdSdkPlayReadyLateEme.context);
assert.equal(vm.runInContext(`typeof Object.getOwnPropertyDescriptor(navigator, 'requestMediaKeySystemAccess').value`, uhdSdkPlayReadyLateEme.context), 'function',
  'UHD late EME replacement is a real function but is not retroactively guarded');
const uhdLateEmeResult = vm.runInContext('globalThis.uhdLateEmeResult = sdkInstance.createPlaybackSession(makeRuntimeOptions()); uhdLateEmeResult', uhdSdkPlayReadyLateEme.context);
assert.equal(vm.runInContext('uhdLateEmeResult instanceof Promise', uhdSdkPlayReadyLateEme.context), true,
  'UHD late EME replacement rejects through a Promise');
await assert.rejects(uhdLateEmeResult, error => error?.name === 'AbortError',
  'UHD SDK PlayReady mode stops after an unwrapped late EME replacement');
assert.equal(vm.runInContext('sdkCalls.length', uhdSdkPlayReadyLateEme.context), 0,
  'UHD late EME replacement cannot enable the native SDK call');
await assertUnappliedTrafficIsBlocked(uhdSdkPlayReadyLateEme);

// Exercise identity loss after a successful installation and SDK call, not
// only late insertion into a page where EME was missing at startup.
for (const mode of [PLAYREADY_MODE, UHD_PLAYREADY_MODE]) {
  for (const accessor of [false, true]) {
    const replaced = createRuntime({preloadSdk:true, mode});
    if (mode === UHD_PLAYREADY_MODE) {
      vm.runInContext(`globalThis.replacementGetterCalls = 0;
        Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
          configurable:true,
          ${accessor ? "get() { replacementGetterCalls++; return function unguarded() {}; }" : "value:function unguarded() {}"}
        });`, replaced.context);
      await assertUnappliedTrafficIsBlocked(replaced);
      const blocked = vm.runInContext('globalThis.blocked = sdkInstance.createPlaybackSession(makeRuntimeOptions()); blocked', replaced.context);
      assert.equal(vm.runInContext('blocked instanceof Promise', replaced.context), true,
        `${mode}: replaced EME guard rejects through a Promise before the first SDK call`);
      await assert.rejects(blocked, error => error?.name === 'AbortError',
        `${mode}: losing the EME guard prevents the first SDK call`);
      assert.equal(vm.runInContext('sdkCalls.length', replaced.context), 0,
        `${mode}: replaced EME guard never reaches native SDK create`);
    } else {
      await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', replaced.context);
      assert.equal(vm.runInContext('sdkCalls.length', replaced.context), 1, 'SDK was genuinely enabled before guard replacement');
      vm.runInContext(`globalThis.replacementGetterCalls = 0;
        Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
          configurable:true,
          ${accessor ? "get() { replacementGetterCalls++; return function unguarded() {}; }" : "value:function unguarded() {}"}
        });`, replaced.context);
      await assertUnappliedTrafficIsBlocked(replaced);
      await assert.rejects(vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', replaced.context),
        error => error.name === 'AbortError', 'losing the installed EME guard prevents another SDK call');
      assert.equal(vm.runInContext('sdkCalls.length', replaced.context), 1, 'replaced guard did not reach native SDK again');
    }
    assert.equal(vm.runInContext('replacementGetterCalls', replaced.context), 0, `${mode}: guard check never invokes a replacement getter`);
  }
}

for (const accessor of [false, true]) {
  const ready = createRuntime({preloadSdk:true, mode:UHD_PLAYREADY_MODE});
  await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', ready.context);
  await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, ready.context);
  assert.equal(vm.runInContext('nativeFetchCalls.length', ready.context), 1,
    'UHD playback was genuinely enabled before replacing the installed EME guard');
  assert.equal(vm.runInContext('sdkSessionCalls.length', ready.context), 1,
    'UHD constructor policy was actually applied before replacing the EME guard');
  vm.runInContext(`globalThis.replacementGetterCalls = 0;
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable:true,
      ${accessor ? "get() { replacementGetterCalls++; return function unguarded() {}; }" : "value:function unguarded() {}"}
    });`, ready.context);
  await assert.rejects(vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, ready.context),
    error => error?.name === 'AbortError', 'UHD post-application EME guard replacement blocks the next playback fetch');
  assert.equal(vm.runInContext('nativeFetchCalls.length', ready.context), 1,
    'post-application replacement sends no additional native fetch');
  vm.runInContext(`globalThis.replacedXhr = new XMLHttpRequest(); replacedXhr.open('POST', ${JSON.stringify(PLAYBACK_URL)});`, ready.context);
  assert.throws(() => vm.runInContext(`replacedXhr.send(${JSON.stringify(PLAYBACK_BODY)})`, ready.context),
    error => error?.name === 'AbortError');
  assert.equal(vm.runInContext('nativeXhrSendCalls.length', ready.context), 0);
  assert.equal(vm.runInContext('replacementGetterCalls', ready.context), 0,
    'post-application guard verification never invokes the replacement getter');
}

for (const mode of [PLAYREADY_MODE, UHD_PLAYREADY_MODE]) {
  const invalidEngineRuntime = createRuntime({preloadSdk: true, mode});
  const invalidEnginePromise = vm.runInContext(`(() => {
    const options = makeRuntimeOptions();
    options.clientParameters.configOverrides['hive-dmp'].engine = [];
    return sdkInstance.createPlaybackSession(options);
  })()`, invalidEngineRuntime.context);
  if (mode === UHD_PLAYREADY_MODE) {
    await assert.rejects(invalidEnginePromise, error => error?.name === 'AbortError',
      `${mode}: unknown SDK options fail closed through AbortError`);
    assert.equal(vm.runInContext('sdkCalls.length', invalidEngineRuntime.context), 0,
      `${mode}: unknown SDK options never reach native SDK create`);
    assert.equal(vm.runInContext('sdkSessionCalls.length', invalidEngineRuntime.context), 0,
      `${mode}: unknown SDK options never reach the playback-session constructor`);
  } else await invalidEnginePromise;
  await assertUnappliedTrafficIsBlocked(invalidEngineRuntime);
  const engineAccessorRuntime = createRuntime({preloadSdk: true, mode});
  const accessorPromise = vm.runInContext(`(() => {
    const options = makeRuntimeOptions();
    let getterCalls = 0;
    Object.defineProperty(options.clientParameters.configOverrides['hive-dmp'], 'engine', {
      get() { getterCalls += 1; return {}; }, configurable: true,
    });
    globalThis.sdkPlayReadyEngineGetterCalls = () => getterCalls;
    return sdkInstance.createPlaybackSession(options);
  })()`, engineAccessorRuntime.context);
  if (mode === UHD_PLAYREADY_MODE) {
    await assert.rejects(accessorPromise, error => error?.name === 'AbortError',
      `${mode}: SDK PlayReady engine accessor fails closed through AbortError`);
    assert.equal(vm.runInContext('sdkCalls.length', engineAccessorRuntime.context), 0,
      `${mode}: SDK PlayReady engine accessor never reaches native SDK create`);
  } else await accessorPromise;
  assert.equal(vm.runInContext('sdkPlayReadyEngineGetterCalls()', engineAccessorRuntime.context), 0,
    `${mode}: SDK PlayReady engine accessor is rejected without invoking it`);
  await assertUnappliedTrafficIsBlocked(engineAccessorRuntime);
}

const wrongVersion = createRuntime({preloadSdk: true, sdkVersion: '26.10.0-other'});
assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession === sdkNativeCreate', wrongVersion.context), true,
  'unsupported SDK version is not patched');
await assertUnappliedTrafficIsBlocked(wrongVersion);

const missingSdk = createRuntime();
await assertUnappliedTrafficIsBlocked(missingSdk);
const unknownScenario = 'https://disney.playback.edge.bamgrid.com/v7/playback/future-scenario';
await vm.runInContext(`fetch(${JSON.stringify(unknownScenario)}, {method:'POST', body:'unchanged'})`, missingSdk.context);
assert.equal(vm.runInContext('nativeFetchCalls.at(-1).input', missingSdk.context), unknownScenario, 'unknown scenarios are not blocked by the SDK cap guard');
vm.runInContext(`const unknownXhr = new XMLHttpRequest(); unknownXhr.open('POST', ${JSON.stringify(unknownScenario)}); unknownXhr.send('unchanged');`, missingSdk.context);
assert.equal(vm.runInContext('nativeXhrSendCalls.at(-1).args[0]', missingSdk.context), 'unchanged');

for (const mode of OLD_MODES) {
  const runtime = createRuntime({preloadSdk:true, mode});
  assert.equal(vm.runInContext('sdkInstance.constructor.prototype.createPlaybackSession === sdkNativeCreate', runtime.context), true,
    `existing mode ${mode} does not hook the SDK`);
}

const invalidAfterValid = createRuntime({preloadSdk:true});
await vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions()); sdkInstance.createPlaybackSession(null)', invalidAfterValid.context);
await assertUnappliedTrafficIsBlocked(invalidAfterValid);

const failedAsync = createRuntime({preloadSdk:true});
const rejectedCreate = vm.runInContext(`sdkExpectedPromise = Promise.reject(new Error('async SDK failure')); sdkInstance.createPlaybackSession(makeRuntimeOptions());`, failedAsync.context);
assert.equal(rejectedCreate, failedAsync.context.sdkExpectedPromise, 'rejected native Promise identity is preserved');
await assert.rejects(rejectedCreate, /async SDK failure/);
await assertUnappliedTrafficIsBlocked(failedAsync);

const lateFailure = createRuntime({preloadSdk:true});
const earlierCreate = vm.runInContext(`
  sdkExpectedPromise = new Promise((resolve, reject) => { globalThis.rejectEarlier = reject; });
  sdkInstance.createPlaybackSession(makeRuntimeOptions());
`, lateFailure.context);
await vm.runInContext(`sdkExpectedPromise = Promise.resolve({newer:true}); sdkInstance.createPlaybackSession(makeRuntimeOptions());`, lateFailure.context);
vm.runInContext("rejectEarlier(new Error('older SDK failure'));", lateFailure.context);
await assert.rejects(earlierCreate, /older SDK failure/);
await vm.runInContext(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(PLAYBACK_BODY)}})`, lateFailure.context);
assert.equal(vm.runInContext('nativeFetchCalls.length', lateFailure.context), 1, 'an older async rejection cannot revoke the newer configured session');

const callsBeforePagehide = vm.runInContext('sdkCalls.length', delayed.context);
assert.equal(delayed.callbacks.get('pagehide').capture, true, 'pagehide retirement handler is capture-phase');
delayed.callbacks.get('pagehide').callback({persisted: true});
await assert.rejects(
  vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', delayed.context),
  (error) => error?.name === 'AbortError',
  'retired document refuses new SDK sessions',
);
assert.equal(vm.runInContext('sdkCalls.length', delayed.context), callsBeforePagehide, 'retired SDK call never reaches native create');

{
  const service = {mediaCapabilitiesInfo:{videoResolutions:['SD','HD','FHD','UHD'],vod:{videoResolutions:['SD','HD']},privateId:'do-not-copy'}};
  const before = JSON.stringify(service);
  assert.deepEqual(JSON.parse(JSON.stringify(api.inspectSdkCapabilities(service))), {adapter:['SD','HD','FHD','UHD'],vod:['SD','HD']});
  assert.equal(JSON.stringify(service), before, 'inspection does not modify capabilities');
  assert.equal(JSON.stringify(api.inspectSdkCapabilities(service)).includes('do-not-copy'), false);
  service.mediaCapabilitiesInfo.vod.videoResolutions = [];
  assert.deepEqual(JSON.parse(JSON.stringify(api.inspectSdkCapabilities(service))).vod, []);
  service.mediaCapabilitiesInfo.videoResolutions = ['SD','HD','HD'];
  assert.deepEqual(JSON.parse(JSON.stringify(api.inspectSdkCapabilities(service))).adapter, ['SD','HD']);
  for (const resolutions of [['secret'], ['HD', 'private-value'], new Array(2), Array(17).fill('HD'), null, 'FHD']) {
    service.mediaCapabilitiesInfo.vod.videoResolutions = resolutions;
    assert.equal(api.inspectSdkCapabilities(service), null, 'unknown enum values and shapes fail closed');
  }
  let getterCalls = 0;
  const getterService = {get mediaCapabilitiesInfo() { getterCalls++; return {}; }};
  assert.equal(api.inspectSdkCapabilities(getterService), null);
  const getterArray = ['SD'];
  Object.defineProperty(getterArray,'0',{get() { getterCalls++; return 'SD'; }});
  assert.equal(api.inspectSdkCapabilities({mediaCapabilitiesInfo:{videoResolutions:getterArray}}), null);
  assert.equal(getterCalls, 0, 'inspection never invokes supplied field/index getters');
  assert.equal(api.inspectSdkCapabilities(Object.create({mediaCapabilitiesInfo:{}})), null, 'inherited fields are not inspected');
  for (const value of [null, undefined, {}, [], 42]) assert.equal(api.inspectSdkCapabilities(value), null);
}
assert.deepEqual(fromRealmJson(planRealm, `__DP4K_INTERNALS__.MODE_PLANS['sdk-inspect']`), {
  label:'SDKの解像度上限を診断（再生しない）', scenario:null, resolution:null, sdkInspectOnly:true,
});
assert.equal(api.planEmeRequest('com.microsoft.playready', [], 'sdk-inspect').changed, false, 'inspection does not request a different DRM');
assert.equal(api.rewritePlaybackUrl(PLAYBACK_URL, 'sdk-inspect').changed, false, 'inspection does not select another scenario');
for (const preloadSdk of [true, false]) {
  const inspection = createRuntime({mode:'sdk-inspect', preloadSdk});
  if (!preloadSdk) {
    installSdkFixture(inspection.context, SDK_VERSION, false);
    vm.runInContext(`globalThis['playback-service'] = sdkExport;`, inspection.context);
  }
  vm.runInContext(`sdkInstance.mediaCapabilitiesInfo = {videoResolutions:['SD','HD','FHD'],vod:{videoResolutions:['SD','HD']}};`, inspection.context);
  const before = fromRealmJson(inspection.context, 'sdkInstance.mediaCapabilitiesInfo');
  await assert.rejects(vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', inspection.context), error => error?.name === 'AbortError');
  assert.equal(vm.runInContext('sdkCalls.length', inspection.context), 0, 'inspection stops before native session creation');
  assert.deepEqual(fromRealmJson(inspection.context, 'sdkInstance.mediaCapabilitiesInfo'), before, 'capability lists remain unmodified');
  await assertUnappliedTrafficIsBlocked(inspection);
  inspection.callbacks.get('pagehide').callback();
  await assert.rejects(vm.runInContext('sdkInstance.createPlaybackSession(makeRuntimeOptions())', inspection.context), error => error?.name === 'AbortError');
  assert.equal(vm.runInContext('sdkCalls.length', inspection.context), 0, 'retired inspection cannot start playback');
}
for (const sdkVersion of ['unsupported-sdk', SDK_VERSION]) {
  const inspection = createRuntime({mode:'sdk-inspect', preloadSdk:true, sdkVersion});
  await assertUnappliedTrafficIsBlocked(inspection);
}
await assertUnappliedTrafficIsBlocked(createRuntime({mode:'sdk-inspect'}));
console.log('SDK config/inspection: mode isolation, copy-on-write, privacy/shape validation, native contracts, inspection before native session creation, traffic fail-closed, and retirement passed');
