import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const scriptPath = new URL("../extension/DisneyPlus-Edge-Enhanced.user.js", import.meta.url);
const source = fs.readFileSync(scriptPath, "utf8");
const context = vm.createContext({
  URL,
  console,
  __DP4K_TEST__: true,
});
context.globalThis = context;
vm.runInContext(source, context, { filename: scriptPath.pathname });

const api = context.__DP4K_INTERNALS__;
assert.ok(api, "test API should be exported");

{
  const expectedModes = [
    "4k-hdr10-single-pq",
    "4k-hdr10-sdr-manifest-probe",
    "4k-hevc-sdr-manifest-probe",
    "1080p-hevc-single-sdr",
    "4k-hevc-sdk-playready",
    "4k-hdr10-sdk-playready",
    "1080p-hevc-sdk-playready",
    "1080p-hevc-native-cap",
    "1080p-hevc-hw-persistent-cap",
    "1080p-hevc-hw-persistent",
    "4k-hdr10-hw-persistent",
    "4k-hdr10-hw",
    "4k-hevc-hw",
    "4k-sdr",
    "4k-hdr10",
    "1080p",
    "original",
    "sdk-inspect",
  ];
  assert.equal(Object.keys(api.MODE_PLANS).length, 18);
  assert.deepEqual([...source.matchAll(/<option value="([^"]+)">/g)].map(match => match[1]).sort(), expectedModes.slice().sort(), 'every mode is actually selectable in the UI');
  assert.deepEqual(Object.keys(api.MODE_PLANS).sort(), expectedModes.sort(), "retain all modes plus the bounded HDR comparison");
  assert.deepEqual(JSON.parse(JSON.stringify(api.MODE_PLANS["4k-hdr10-single-pq"])), {
    label:"4K HDR10・HEVC/AACを1候補に固定（30秒限定）", scenario:"tv-drm-ctr-h265-hdr10-atmos",
    resolution:"3840x2160", sdkMaxHeight:2160, sdkRecommendationFlow:true, sdkUhdPolicy:true, singleHdrVariant:true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(api.MODE_PLANS["4k-hdr10-sdk-playready"])), {
    label:"4K HDR10（SDKのPlayReady選択）", scenario:"tv-drm-ctr-h265-hdr10-atmos",
    resolution:"3840x2160", sdkMaxHeight:2160, sdkRecommendationFlow:true, sdkUhdPolicy:true,
  });
  assert.equal(api.isExperimentalMode("4k-hdr10-sdk-playready"), true);
  const sdkPlayReady = api.MODE_PLANS["1080p-hevc-sdk-playready"];
  assert.equal(sdkPlayReady.sdkRecommendationFlow, true);
  assert.equal(sdkPlayReady.scenario, "tv-drm-ctr-h265-atmos");
  assert.equal(sdkPlayReady.resolution, "1920x1080");
  assert.equal(sdkPlayReady.sdkMaxHeight, 1080);
  assert.equal(sdkPlayReady.hardwarePlayReady, undefined);
  assert.equal(sdkPlayReady.persistentSession, undefined);
  assert.equal(api.isExperimentalMode("1080p-hevc-sdk-playready"), true);
  const nativeCap = api.MODE_PLANS["1080p-hevc-native-cap"];
  assert.equal(nativeCap.scenario, "tv-drm-ctr-h265-atmos");
  assert.equal(nativeCap.resolution, "1920x1080");
  assert.equal(nativeCap.sdkMaxHeight, 1080);
  assert.equal(nativeCap.hardwarePlayReady, undefined);
  assert.equal(nativeCap.persistentSession, undefined);
  assert.equal(api.isExperimentalMode("1080p-hevc-native-cap"), true);
  const narrow = api.MODE_PLANS["1080p-hevc-hw-persistent"];
  assert.equal(narrow.label, "1080p HEVC + HWPR（persistent切り分け）");
  assert.equal(narrow.scenario, "tv-drm-ctr-h265-atmos");
  assert.equal(narrow.resolution, "1920x1080");
  assert.equal(narrow.hardwarePlayReady, true);
  assert.equal(narrow.persistentSession, true);
  assert.equal(narrow.scenario.includes("hdr10"), false, "the 1080p comparison is not an HDR/4K result");
  assert.equal(api.MODE_PLANS["4k-hdr10-hw-persistent"].scenario, "tv-drm-ctr-h265-hdr10-atmos", "retain the existing HDR persistent mode");
}

{
  const result = api.rewritePlaybackUrl(
    "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular?foo=1",
    "4k-sdr",
  );
  assert.equal(result.isPlayback, true);
  assert.equal(result.changed, true);
  assert.equal(result.eligible, true);
  assert.equal(result.fromScenario, "ctr-regular");
  assert.equal(result.toScenario, "tv-drm-ctr-h265-atmos");
  assert.equal(
    result.url,
    "https://disney.playback.edge.bamgrid.com/v7/playback/tv-drm-ctr-h265-atmos?foo=1",
  );
}

{
  const result = api.rewritePlaybackUrl(
    "https://disney.playback.edge.bamgrid.com/v7/playback/future-unknown-scenario",
    "4k-sdr",
  );
  assert.equal(result.isPlayback, true);
  assert.equal(result.eligible, false);
  assert.equal(result.changed, false);
  assert.equal(
    result.url,
    "https://disney.playback.edge.bamgrid.com/v7/playback/future-unknown-scenario",
  );
}

{
  const result = api.rewritePlaybackUrl(
    "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular",
    "4k-hdr10",
  );
  assert.equal(result.toScenario, "tv-drm-ctr-h265-hdr10-atmos");
}

{
  const result = api.rewritePlaybackUrl(
    "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular?foo=1",
    "1080p-hevc-hw-persistent",
  );
  assert.equal(result.toScenario, "tv-drm-ctr-h265-atmos");
  assert.equal(result.url, "https://disney.playback.edge.bamgrid.com/v7/playback/tv-drm-ctr-h265-atmos?foo=1");
}

{
  const result = api.rewritePlaybackUrl(
    "https://example.com/v7/playback/ctr-regular",
    "4k-sdr",
  );
  assert.equal(result.isPlayback, false);
  assert.equal(result.url, "https://example.com/v7/playback/ctr-regular");
}

{
  const result = api.rewritePlaybackUrl(
    "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular",
    "original",
  );
  assert.equal(result.isPlayback, true);
  assert.equal(result.changed, false);
  assert.equal(result.url, "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular");
}

{
  const body = JSON.stringify({
    playback: {
      attributes: {
        protocol: "HTTPS",
        resolution: { max: ["1280x720"], min: ["640x360"] },
      },
    },
    device: { resolution: { width: 1280, height: 720 } },
    unrelated: "1280x720",
  });
  const result = api.rewritePlaybackBody(body, "4k-sdr");
  const parsed = JSON.parse(result.body);
  assert.equal(result.changed, true);
  assert.deepEqual(parsed.playback.attributes.resolution.max, ["3840x2160"]);
  assert.deepEqual(parsed.playback.attributes.resolution.min, ["640x360"]);
  assert.deepEqual(parsed.device.resolution, { width: 1280, height: 720 });
  assert.equal(parsed.unrelated, "1280x720", "unrelated strings must not be replaced");
}

{
  const body = JSON.stringify({
    device: { resolution: { width: 1280, height: 720 } },
  });
  const result = api.rewritePlaybackBody(body, "4k-sdr");
  assert.equal(result.changed, false);
  assert.equal(result.body, body);
}

{
  const body = JSON.stringify({
    playback: {
      attributes: {
        protocol: "HTTPS",
        codecs: { video: ["h265"] },
      },
    },
  });
  const result = api.rewritePlaybackBody(body, "1080p");
  const parsed = JSON.parse(result.body);
  assert.deepEqual(parsed.playback.attributes.resolution.max, ["1920x1080"]);
}

{
  const body = JSON.stringify({
    playback: {
      attributes: {
        resolution: { max: ["3840x2160"], min: ["640x360"] },
        hdrTypes: ["hdr10"],
      },
    },
  });
  const result = api.rewritePlaybackBody(body, "1080p-hevc-hw-persistent");
  const parsed = JSON.parse(result.body);
  assert.equal(result.changed, true);
  assert.deepEqual(parsed.playback.attributes.resolution.max, ["1920x1080"]);
  assert.deepEqual(parsed.playback.attributes.resolution.min, ["640x360"]);
  assert.deepEqual(parsed.playback.attributes.hdrTypes, ["hdr10"], "the 1080p cap must not discard unrelated selection data");
  assert.equal(body.includes("3840x2160"), true, "rewrite must not mutate the source body");
}

{
  const malformed = "not-json 1280x720";
  const result = api.rewritePlaybackBody(malformed, "4k-sdr");
  assert.equal(result.changed, false);
  assert.equal(result.body, malformed);
  assert.ok(result.error);
}

for (const mode of ["4k-sdr", "4k-hdr10-hw-persistent", "1080p-hevc-hw-persistent", "1080p-hevc-hw-persistent-cap", "1080p-hevc-native-cap", "1080p-hevc-sdk-playready", "4k-hdr10-sdk-playready", "4k-hevc-sdk-playready"]) {
  const target = api.getModePlan(mode).resolution;
  const body = ` { "playback": { "attributes": { "resolution": { "max": ["${target}"], "min": ["640x360"] } } } } \n`;
  const result = api.rewritePlaybackBody(body, mode);
  assert.equal(result.body, body, "an already-correct body retains its exact original bytes");
  assert.equal(result.changed, false);
  assert.equal(result.edits, 0);
  assert.equal(result.error, null);
  assert.equal(result.resolutionMatched, true, "zero edits must not be mistaken for a missing path");
  const changed = api.rewritePlaybackBody(JSON.stringify({playback:{attributes:{resolution:{max:["640x360"]}}}}), mode);
  assert.equal(changed.resolutionMatched, true);
  assert.equal(changed.changed, true);
  assert.equal(api.rewritePlaybackBody(changed.body, mode).body, changed.body, "rewriting is idempotent");
}

for (const value of [null, [], 42, {}, {device:{resolution:{max:["1920x1080"]}}},
  {playback:{attributes:[]}}, {playback:{attributes:{unrelated:true}}},
  {playback:{attributes:{resolution:[]}}}, {playback:{attributes:{resolution:"1920x1080"}}}]) {
  const body = JSON.stringify(value);
  const result = api.rewritePlaybackBody(body, "1080p-hevc-hw-persistent-cap");
  assert.equal(result.body, body);
  assert.equal(result.changed, false);
  assert.equal(result.resolutionMatched, false, "unknown paths cannot be declared already correct");
}
for (const body of ["", "{invalid", null, new Uint8Array([1, 2])]) {
  const result = api.rewritePlaybackBody(body, "1080p-hevc-hw-persistent-cap");
  assert.equal(result.body, body);
  assert.equal(result.resolutionMatched, false);
}
{
  const body = '{"playback":{"attributes":{"resolution":{"max":["1920x1080"]}}}}';
  const result = api.rewritePlaybackBody(body, "original");
  assert.equal(result.body, body);
  assert.equal(result.resolutionMatched, false, "unchanged mode does not inspect or claim a target");
}

{
  const hls = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080",
    "1080.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160",
    "2160.m3u8",
  ].join("\n");
  assert.equal(JSON.stringify(api.extractMaxResolution(hls)), JSON.stringify({ width: 3840, height: 2160 }));
}

{
  const mpd = `<MPD><Representation height="1080" width="1920"/><Representation width="3840" height="2160"/></MPD>`;
  assert.equal(JSON.stringify(api.extractMaxResolution(mpd)), JSON.stringify({ width: 3840, height: 2160 }));
}

assert.equal(api.isManifestUrl("https://cdn.example/master.m3u8?token=secret"), true);
assert.equal(api.isManifestUrl("https://cdn.example/manifest.mpd"), true);
assert.equal(api.isManifestUrl("https://cdn.example/video.mp4"), false);

{
  const configs = [{
    initDataTypes: ["cenc"], sessionTypes: ["temporary"], persistentState: "optional",
    videoCapabilities: [{ contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: "2000", encryptionScheme: "cenc" }],
    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "2000" }],
  }];
  const before = JSON.stringify(configs);
  const mapped = api.planEmeRequest("com.microsoft.playready", configs, "4k-hdr10-hw");
  assert.equal(mapped.keySystem, "com.microsoft.playready.recommendation.3000");
  assert.equal(mapped.configurations[0].videoCapabilities[0].robustness, undefined);
  assert.equal(mapped.configurations[0].videoCapabilities[0].encryptionScheme, "cenc");
  assert.equal(mapped.configurations[0].sessionTypes[0], "temporary");
  assert.equal(JSON.stringify(configs), before, "do not mutate Disney's EME configuration");
  for (const mode of ["original", "1080p", "4k-hdr10", "4k-sdr"]) {
    const unchanged = api.planEmeRequest("com.microsoft.playready", configs, mode);
    assert.equal(unchanged.keySystem, "com.microsoft.playready");
    assert.equal(unchanged.configurations, configs);
  }
  for (const keySystem of ["com.widevine.alpha", "org.w3.clearkey", "com.microsoft.playready.unknown"]) {
    const unchanged = api.planEmeRequest(keySystem, configs, "4k-hdr10-hw");
    assert.equal(unchanged.keySystem, keySystem);
    assert.equal(unchanged.configurations, configs);
  }
}
assert.equal(api.safeError(new Error('Failure at https://example.test/license?token=private')).includes('private'), false);

{
  const configurations = [{
    sessionTypes: ['temporary'], persistentState: 'optional', distinctiveIdentifier: 'not-allowed',
    videoCapabilities: [{ contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: '2000', encryptionScheme: 'cenc' }],
  }];
  const snapshot = JSON.stringify(configurations);
  const plan = api.planEmeRequest('com.microsoft.playready', configurations, '4k-hdr10-hw-persistent');
  assert.equal(JSON.stringify(configurations), snapshot);
  assert.equal(plan.sessionTypeOverride, 'persistent-license');
  assert.equal(plan.configurations[0].sessionTypes[0], 'persistent-license');
  assert.equal(plan.configurations[0].persistentState, 'required');
  assert.equal(plan.configurations[0].distinctiveIdentifier, 'not-allowed', 'never broaden device identifier policy');
  assert.equal(plan.configurations[0].videoCapabilities[0].encryptionScheme, 'cenc');
  const metadata = { keySystem: plan.keySystem, sessionTypeOverride: plan.sessionTypeOverride };
  for (const args of [[], [undefined], ['temporary'], ['temporary', 'extra']]) {
    const mapped = api.planSessionArguments(args, metadata);
    assert.equal(mapped[0], 'persistent-license');
    assert.equal(mapped[1], args[1]);
  }
  for (const args of [['persistent-license'], ['unknown'], [null], [{}]]) {
    assert.equal(api.planSessionArguments(args, metadata), args, 'unrecognized native arguments must not be normalized');
  }
  const args = ['temporary'];
  for (const other of [undefined, {}, { keySystem: plan.keySystem }, { ...metadata, keySystem: 'com.widevine.alpha' }]) {
    assert.equal(api.planSessionArguments(args, other), args, 'change only tracked, opted-in HW PlayReady keys');
  }
  const widevine = api.planEmeRequest('com.widevine.alpha', configurations, '4k-hdr10-hw-persistent');
  assert.equal(widevine.changed, false);
  assert.equal(widevine.configurations, configurations);
  assert.equal(api.describeSessionPolicy(plan.configurations[0]), 'sessionTypes=persistent-license; persistentState=required; distinctiveIdentifier=not-allowed');
  assert.equal(api.describeSessionPolicy({ sessionTypes: ['private-id'], persistentState: 'secret' }).includes('secret'), false);
}

{
  const configurations = [{
    sessionTypes: ["temporary"],
    persistentState: "optional",
    videoCapabilities: [{ contentType: 'video/mp4; codecs="hvc1.2.4.H120.90"', robustness: "2000" }],
    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "2000" }],
  }];
  const before = JSON.stringify(configurations);
  const plan = api.planEmeRequest("com.microsoft.playready", configurations, "1080p-hevc-hw-persistent");
  assert.equal(plan.keySystem, "com.microsoft.playready.recommendation.3000");
  assert.equal(plan.sessionTypeOverride, "persistent-license");
  assert.equal(plan.configurations[0].sessionTypes[0], "persistent-license");
  assert.equal(plan.configurations[0].persistentState, "required");
  assert.equal(plan.configurations[0].videoCapabilities[0].robustness, undefined);
  assert.equal(plan.configurations[0].audioCapabilities[0].robustness, undefined);
  assert.equal(JSON.stringify(configurations), before, "the 1080p persistent plan must preserve the source EME configuration");
  const metadata = { keySystem: plan.keySystem, sessionTypeOverride: plan.sessionTypeOverride };
  const nativeArgs = ["temporary", "extra"];
  const mappedArgs = api.planSessionArguments(nativeArgs, metadata);
  assert.equal(JSON.stringify(mappedArgs), JSON.stringify(["persistent-license", "extra"]));
  assert.equal(mappedArgs === nativeArgs, false, "only the opted-in session argument copy is changed");
}

console.log("DisneyPlus-4K-Edge.user.js: all tests passed");
