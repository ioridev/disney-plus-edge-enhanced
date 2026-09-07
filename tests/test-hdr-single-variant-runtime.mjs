import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// This is intentionally a separate runtime contract from the existing FHD
// single-variant test.  It exercises the HDR10/PQ mode through the same VM,
// native fetch/XHR, SDK, EME, and session shims used by that test, without a
// browser, network, or real CDM.
const source = fs.readFileSync(new URL("../extension/DisneyPlus-Edge-Enhanced.user.js", import.meta.url), "utf8");
const VERSION = "0.3.16";
const MODE = "4k-hdr10-single-pq";
const SDK_VERSION = "26.10.0-jasmine";
const DOCUMENT_URL = "https://www.disneyplus.com/ja-jp/play/hdr-single-variant-runtime-test";
const SESSION_SDK_URL = `https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/${SDK_VERSION}/all_browser_es6/playback-session.js`;
const PLAYBACK_URL = "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular";
const PLAYBACK_SCENARIO_URL = "https://disney.playback.edge.bamgrid.com/v7/playback/tv-drm-ctr-h265-hdr10-atmos";
const MASTER_URL = "https://cdn.example.test/hdr-master.m3u8";
const MEDIA_URL = "https://cdn.example.test/hdr-video.m3u8";

// The selected candidate must be the unique highest-bandwidth PQ variant.  A
// higher-bandwidth SDR/HLG/unspecified candidate must not win by accident.
const PQ_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=15000000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=SDR,FRAME-RATE=59.94',
  "video-sdr.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=17000000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=HLG,FRAME-RATE=59.94',
  "video-hlg.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=18000000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,FRAME-RATE=59.94',
  "video-unspecified.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=6200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=PQ,FRAME-RATE=30',
  "video-pq-low.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=PQ,FRAME-RATE=59.94',
  "video-pq-high.m3u8",
  "",
].join("\n");

const SDR_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=SDR,FRAME-RATE=59.94',
  "video-sdr-only.m3u8",
  "",
].join("\n");

const HLG_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=HLG,FRAME-RATE=59.94',
  "video-hlg-only.m3u8",
  "",
].join("\n");

const ABSENT_RANGE_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,FRAME-RATE=59.94',
  "video-absent-range.m3u8",
  "",
].join("\n");

const INCOMPATIBLE_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=22000000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=PQ,FRAME-RATE=59.94',
  "video-h264.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=21000000,CODECS="hvc1.2.4.L153.B0",RESOLUTION=3840x2160,VIDEO-RANGE=PQ,FRAME-RATE=59.94',
  "video-no-aac.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=20000000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=1920x1080,VIDEO-RANGE=PQ,FRAME-RATE=59.94',
  "video-fhd-pq.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=19000000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=PQ,FRAME-RATE=60.01',
  "video-too-fast.m3u8",
  "",
].join("\n");

const MEDIA_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-MEDIA-SEQUENCE:1",
  "#EXTINF:4.000,",
  "segment-1.m4s",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

function makeStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function requestUrl(input) {
  return typeof input === "string" ? input : String(input?.url || "");
}

function requestMethod(input, init) {
  return String(init?.method ?? input?.method ?? "GET").toUpperCase();
}

function isHdrMode(mode) {
  return mode === MODE;
}

function makeSdkOptions() {
  return {
    clientParameters: {
      keep: "client",
      configOverrides: {
        "hive-dmp": {
          keep: "hive",
          engine: {keep: "engine"},
          session: {
            keep: "session",
            vod: {
              playlistFiltering: {minHeight: 0, keep: "filtering"},
              playbackAttributesConfig: {
                keep: "attributes",
                resolution: {max: ["1280x720"], keep: "resolution"},
              },
            },
          },
        },
      },
    },
    unrelated: {keep: true},
  };
}

function makePlaybackBody() {
  return JSON.stringify({playback: {attributes: {resolution: {max: ["1280x720"]}}}});
}

function makeSdkSessionOptions() {
  return {
    playbackServiceVersion: SDK_VERSION,
    mediaCapabilities: {
      videoResolutions: ["SD", "HD", "FHD"],
      drm: {keySystem: "com.microsoft.playready", robustness: "SW_SECURE_DECODE"},
      other: {keep: true},
    },
    unrelated: {keep: "session"},
  };
}

function makeEmeInput() {
  return [{
    initDataTypes: ["cenc"],
    sessionTypes: ["temporary"],
    persistentState: "optional",
    distinctiveIdentifier: "required",
    videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"', robustness: "2000"}],
    audioCapabilities: [{contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "3000"}],
  }];
}

function createRuntime({
  master = PQ_MASTER,
  holdGenerate = false,
  generateBehavior = "resolve",
  reenterGenerate = false,
} = {}) {
  const callbacks = new Map();
  const timers = new Map();
  const nativeFetchCalls = [];
  const nativeXhrCalls = [];
  const nativeEmeCalls = [];
  const nativeMediaKeysCalls = [];
  const nativeSessionCalls = [];
  const nativeSessionMethodCalls = [];
  const nativePlaybackSessionCalls = [];
  const sdkCalls = [];
  const runtime = {
    callbacks,
    timers,
    nativeFetchCalls,
    nativeXhrCalls,
    nativeEmeCalls,
    nativeMediaKeysCalls,
    nativeSessionCalls,
    nativeSessionMethodCalls,
    nativePlaybackSessionCalls,
    sdkCalls,
    reloads: 0,
    pauseCalls: 0,
    reenterGenerate,
    reenteredGenerate: false,
    reentryError: null,
    timerSequence: 0,
    mode: MODE,
    master,
  };

  const localStorage = makeStorage([["ioridev.disneyplus4k.mode.v1", "original"]]);
  const sessionStorage = makeStorage([[`ioridev.disneyplus4k.once.v${VERSION}`, JSON.stringify({
    version: VERSION,
    mode: MODE,
    documentUrl: DOCUMENT_URL,
    createdAt: Date.now() - 100,
  })]]);

  const responseFor = (url, body, contentType = "application/vnd.apple.mpegurl") => {
    const response = new Response(body, {
      status: 200,
      statusText: "OK",
      headers: {
        "content-type": contentType,
        "content-length": String(new TextEncoder().encode(body).byteLength),
      },
    });
    Object.defineProperty(response, "url", {configurable: true, value: url});
    return response;
  };

  const nativeFetch = async function nativeFetch(input, init) {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const body = init && Object.prototype.hasOwnProperty.call(init, "body") ? init.body : undefined;
    nativeFetchCalls.push({thisValue: this, input, init, url, method, body});
    if (method === "POST" && url.includes("/v7/playback/")) {
      return responseFor(url, '{"ok":true}', "application/json");
    }
    if (url === MASTER_URL) return responseFor(url, master);
    if (url === MEDIA_URL) return responseFor(url, MEDIA_PLAYLIST);
    return responseFor(url, "", "text/plain");
  };

  class NativeXMLHttpRequest {
    constructor() {
      this.readyState = 0;
      this.status = 0;
      this.statusText = "";
      this.responseURL = "";
      this._responseType = "";
      this._responseText = "";
      this._response = "";
      this._listeners = new Map();
    }
    open(method, url, ...rest) {
      this.openArgs = [method, url, ...rest];
      this.method = String(method).toUpperCase();
      this.requestUrl = String(url);
      this.responseURL = this.requestUrl;
      this.readyState = 1;
    }
    send(body) {
      nativeXhrCalls.push({thisValue: this, method: this.method, url: this.requestUrl, body});
      this.status = 200;
      this.statusText = "OK";
      this.readyState = 4;
      if (this.method === "POST" && this.requestUrl.includes("/v7/playback/")) {
        this._responseText = '{"ok":true}';
        this._response = this._responseText;
      } else if (this.requestUrl === MASTER_URL) {
        this._responseText = master;
        this._response = this._responseType === "arraybuffer"
          ? new TextEncoder().encode(master).buffer : master;
      } else if (this.requestUrl === MEDIA_URL) {
        this._responseText = MEDIA_PLAYLIST;
        this._response = this._responseType === "arraybuffer"
          ? new TextEncoder().encode(MEDIA_PLAYLIST).buffer : MEDIA_PLAYLIST;
      } else {
        this._responseText = "";
        this._response = this._responseType === "arraybuffer" ? new ArrayBuffer(0) : "";
      }
      for (const listener of this._listeners.get("loadend") || []) {
        listener.callback.call(this, {type: "loadend"});
      }
    }
    addEventListener(type, callback, options) {
      const list = this._listeners.get(type) || [];
      list.push({callback, options});
      this._listeners.set(type, list);
    }
    get responseType() { return this._responseType; }
    set responseType(value) { this._responseType = String(value); }
    get response() { return this._response; }
    get responseText() {
      if (this._responseType !== "" && this._responseType !== "text") {
        throw new DOMException("Invalid state", "InvalidStateError");
      }
      return this._responseText;
    }
    getResponseHeader(name) {
      const key = String(name).toLowerCase();
      if (key === "content-type") return "application/vnd.apple.mpegurl";
      if (key === "content-length") return String(new TextEncoder().encode(this._responseText).byteLength);
      return null;
    }
    getAllResponseHeaders() {
      return "content-type: application/vnd.apple.mpegurl\r\n"
        + `content-length: ${new TextEncoder().encode(this._responseText).byteLength}\r\n`;
    }
  }

  class NativeSession {
    constructor() {
      this.closed = Promise.resolve();
      this.keyStatuses = {forEach() {}};
      this.listeners = [];
    }
    addEventListener(...args) { this.listeners.push(args); }
    generateRequest(...args) {
      nativeSessionMethodCalls.push({method: "generateRequest", thisValue: this, args});
      if (runtime.reenterGenerate && !runtime.reenteredGenerate) {
        runtime.reenteredGenerate = true;
        const reentrant = this.generateRequest(...args);
        runtime.reentryPromise = reentrant;
        if (reentrant && typeof reentrant.catch === "function") {
          reentrant.catch((error) => { runtime.reentryError = error; });
        }
      }
      if (generateBehavior === "sync-throw") throw runtime.generateError;
      return runtime.generatePromise;
    }
    update(...args) {
      nativeSessionMethodCalls.push({method: "update", thisValue: this, args});
      return runtime.updatePromise;
    }
    close(...args) {
      nativeSessionMethodCalls.push({method: "close", thisValue: this, args});
      return runtime.closePromise;
    }
    remove(...args) {
      nativeSessionMethodCalls.push({method: "remove", thisValue: this, args});
      return runtime.removePromise;
    }
  }

  class NativeMediaKeys {
    createSession(...args) {
      nativeSessionCalls.push({method: "createSession", thisValue: this, args});
      return new NativeSession();
    }
  }

  class NativeAccess {
    constructor(keySystem, configuration) {
      this.keySystem = keySystem;
      this.configuration = configuration;
    }
    getConfiguration() { return this.configuration; }
    createMediaKeys(...args) {
      nativeMediaKeysCalls.push({thisValue: this, args});
      return runtime.mediaKeysPromise;
    }
  }

  class NativeNavigator {
    requestMediaKeySystemAccess(...args) {
      nativeEmeCalls.push({thisValue: this, args});
      return Promise.resolve(new NativeAccess(args[0], args[1]?.[0]));
    }
  }

  class NativeVideo {
    constructor() {
      this.paused = false;
      this.mediaKeys = null;
    }
    setMediaKeys(...args) {
      nativeSessionMethodCalls.push({method: "setMediaKeys", thisValue: this, args});
      this.mediaKeys = args[0];
      return runtime.setKeysPromise;
    }
    pause(...args) {
      runtime.pauseCalls += 1;
      this.paused = true;
      nativeSessionMethodCalls.push({method: "pause", thisValue: this, args});
    }
  }

  class NativePlaybackSession {
    constructor(...args) {
      nativePlaybackSessionCalls.push({thisValue: this, args, newTarget: new.target});
      this.nativeOptions = args[0];
      this.nativeArgs = args.slice(1);
    }
  }

  class PlaybackService {
    static get version() { return SDK_VERSION; }
    createPlaybackSession(...args) {
      sdkCalls.push({thisValue: this, args});
      return runtime.sdkPromise;
    }
  }

  runtime.generateError = new Error(`native generate ${generateBehavior}`);
  runtime.generatePromise = holdGenerate
    ? new Promise(() => {})
    : generateBehavior === "async-reject"
      ? Promise.reject(runtime.generateError)
      : Promise.resolve({native: "generate"});
  runtime.updatePromise = Promise.resolve({native: "update"});
  runtime.closePromise = Promise.resolve({native: "close"});
  runtime.removePromise = Promise.resolve({native: "remove"});
  runtime.mediaKeysPromise = Promise.resolve(new NativeMediaKeys());
  runtime.setKeysPromise = Promise.resolve({native: "setMediaKeys"});
  runtime.sdkPromise = Promise.resolve({native: "sdk"});

  const setTimeoutFn = (callback, delay) => {
    const id = ++runtime.timerSequence;
    timers.set(id, {callback, delay});
    return id;
  };
  const clearTimeoutFn = (id) => { timers.delete(id); };
  const video = new NativeVideo();
  runtime.video = video;

  const context = vm.createContext({
    URL,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    ArrayBuffer,
    Uint8Array,
    DOMException,
    console,
    localStorage,
    sessionStorage,
    performance: {getEntriesByType: () => [{type: "reload"}]},
    location: {
      href: DOCUMENT_URL,
      pathname: "/ja-jp/play/hdr-single-variant-runtime-test",
      reload: () => { runtime.reloads += 1; },
    },
    document: {
      documentElement: null,
      currentScript: null,
      querySelectorAll: (selector) => selector === "video" ? [video] : [],
    },
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: new NativeNavigator(),
    MediaKeySystemAccess: NativeAccess,
    MediaKeys: NativeMediaKeys,
    MediaKeySession: NativeSession,
    HTMLMediaElement: NativeVideo,
    XMLHttpRequest: NativeXMLHttpRequest,
    fetch: nativeFetch,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setInterval: () => 0,
    addEventListener: (name, callback, capture) => callbacks.set(name, {callback, capture}),
  });
  runtime.context = context;
  context.PlaybackService = PlaybackService;
  context.NativePlaybackSession = NativePlaybackSession;
  runtime.NativeXMLHttpRequest = NativeXMLHttpRequest;
  runtime.NativeSession = NativeSession;
  runtime.NativeAccess = NativeAccess;
  runtime.NativePlaybackSession = NativePlaybackSession;
  runtime.PlaybackService = PlaybackService;
  vm.runInContext(`globalThis.sessionExport = {};
    Object.defineProperty(globalThis.sessionExport, "PlaybackSession", {
      value: NativePlaybackSession,
      writable: false,
      enumerable: false,
      configurable: true,
    });`, context);
  runtime.run = (expression) => vm.runInContext(expression, context);
  runtime.publishSdk = () => vm.runInContext(`
    globalThis['playback-service'] = {PlaybackService: PlaybackService};
    document.currentScript = {src: ${JSON.stringify(SESSION_SDK_URL)}};
    globalThis['playback-session'] = sessionExport;
    document.currentScript = null;
  `, context);
  runtime.fire30Seconds = () => {
    const entry = [...timers.entries()].find(([, value]) => value.delay === 30000);
    assert.ok(entry, "HDR single-variant SDK start installs the 30-second retirement timer");
    entry[1].callback();
  };
  runtime.pagehide = () => {
    const handler = callbacks.get("pagehide");
    assert.ok(handler, "pagehide retirement handler is installed");
    assert.equal(handler.capture, true);
    handler.callback({persisted: false});
  };

  vm.runInContext(source, context);
  return runtime;
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function countVariants(text) {
  return text.split("\n").filter((line) => line.startsWith("#EXT-X-STREAM-INF:")).length;
}

function nativePostCount(runtime) {
  return runtime.nativeFetchCalls.filter(({method}) => method === "POST").length
    + runtime.nativeXhrCalls.filter(({method}) => method === "POST").length;
}

function nativeGenerateCount(runtime) {
  return runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length;
}

function nativeMasterFetchCount(runtime) {
  return runtime.nativeFetchCalls.filter(({method, url}) => method === "GET" && url === MASTER_URL).length;
}

function nativeMasterXhrCount(runtime) {
  return runtime.nativeXhrCalls.filter(({method, url}) => method === "GET" && url === MASTER_URL).length;
}

function publishSdkInput(runtime) {
  runtime.publishSdk();
  runtime.run(`globalThis.sdkInput = ${JSON.stringify(makeSdkOptions())};
    globalThis.sdkMarker = {marker: "sdk"};
    globalThis.sdkSessionInput = ${JSON.stringify(makeSdkSessionOptions())};
    globalThis.sdkSessionMarker = {marker: "session-sdk"};`);
}

async function createSdk(runtime) {
  publishSdkInput(runtime);
  const result = runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  assert.equal(result, runtime.sdkPromise, "HDR mode preserves the native SDK create Promise");
  await result;
  assert.equal(runtime.sdkCalls.length, 1, "HDR mode permits exactly one native SDK create");
  const call = runtime.sdkCalls[0];
  assert.equal(call.args.length, 2);
  assert.equal(call.args[1], runtime.context.sdkMarker, "SDK trailing arguments are preserved");
  assert.notEqual(call.args[0], runtime.context.sdkInput, "SDK config is copied before the HDR override");
  const planned = json(call.args[0]);
  const hive = planned.clientParameters.configOverrides["hive-dmp"];
  assert.equal(hive.playlistFiltering, undefined);
  assert.equal(hive.session.vod.playlistFiltering.maxHeight, 2160,
    "HDR SDK config raises the playlist maxHeight only to 2160");
  assert.deepEqual(hive.session.vod.playbackAttributesConfig.resolution.max, ["3840x2160"]);
  assert.equal(hive.engine.drmPlayReadyRecommendationFlow, true,
    "HDR SDK PlayReady recommendation flow is enabled");
  assert.deepEqual(json(runtime.context.sdkInput), makeSdkOptions(), "source SDK options remain unchanged");

  const sessionResult = runtime.run(
    "new globalThis['playback-session'].PlaybackSession(sdkSessionInput, sdkSessionMarker)",
  );
  assert.ok(sessionResult, "HDR SDK UHD policy returns a PlaybackSession instance");
  assert.equal(runtime.nativePlaybackSessionCalls.length, 1,
    "HDR UHD policy reaches the native PlaybackSession constructor once");
  const sessionCall = runtime.nativePlaybackSessionCalls[0];
  assert.equal(sessionCall.args.length, 2);
  assert.equal(sessionCall.args[1], runtime.context.sdkSessionMarker,
    "PlaybackSession trailing arguments are preserved");
  assert.notEqual(sessionCall.args[0], runtime.context.sdkSessionInput,
    "PlaybackSession config is copied before adding UHD");
  const sessionPlanned = json(sessionCall.args[0]);
  assert.deepEqual(sessionPlanned.mediaCapabilities.videoResolutions, ["SD", "HD", "FHD", "UHD"]);
  assert.deepEqual(json(runtime.context.sdkSessionInput), makeSdkSessionOptions(),
    "source PlaybackSession options remain unchanged");
  assert.deepEqual(sessionPlanned.mediaCapabilities.drm,
    {keySystem: "com.microsoft.playready", robustness: "SW_SECURE_DECODE"});
  assert.equal(sessionCall.args[0].mediaCapabilities.drm,
    runtime.context.sdkSessionInput.mediaCapabilities.drm,
    "native DRM object identity is preserved");
  assert.equal(sessionCall.args[0].mediaCapabilities.other,
    runtime.context.sdkSessionInput.mediaCapabilities.other,
    "unrelated session capability identity is preserved");
}

async function sendPlaybackFetch(runtime) {
  const body = makePlaybackBody();
  const result = runtime.run(`fetch(${JSON.stringify(PLAYBACK_URL)}, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: ${JSON.stringify(body)},
  })`);
  await result;
  const native = runtime.nativeFetchCalls.at(-1);
  assert.equal(native.method, "POST");
  assert.equal(native.url, PLAYBACK_SCENARIO_URL,
    "HDR playback POST is rewritten to the HDR10 scenario");
  assert.deepEqual(json(JSON.parse(native.body)), {
    playback: {attributes: {resolution: {max: ["3840x2160"]}}},
  });
  assert.equal(nativePostCount(runtime), 1, "exactly one native HDR playback POST reaches fetch");
}

function sendPlaybackXhr(runtime) {
  const xhr = new runtime.context.XMLHttpRequest();
  xhr.open("POST", PLAYBACK_URL, true, "user", "password");
  xhr.send(makePlaybackBody());
  const playbackCall = runtime.nativeXhrCalls.find(({method}) => method === "POST");
  assert.ok(playbackCall, "one HDR playback POST reaches native XHR");
  assert.equal(playbackCall.url, PLAYBACK_SCENARIO_URL);
  assert.deepEqual(json(JSON.parse(playbackCall.body)), {
    playback: {attributes: {resolution: {max: ["3840x2160"]}}},
  });
  assert.deepEqual(runtime.nativeXhrCalls[0].thisValue.openArgs.slice(2), [true, "user", "password"],
    "XHR open trailing arguments are preserved");
  assert.equal(nativePostCount(runtime), 1, "exactly one native HDR playback POST reaches XHR");
}

async function rejectPlaybackFetch(runtime, label) {
  await assert.rejects(
    runtime.run(`fetch(${JSON.stringify(PLAYBACK_URL)}, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: ${JSON.stringify(makePlaybackBody())},
    })`),
    (error) => error?.name === "AbortError",
    `${label}: fetch playback POST is rejected`,
  );
}

function rejectPlaybackXhr(runtime, label) {
  const xhr = new runtime.context.XMLHttpRequest();
  xhr.open("POST", PLAYBACK_URL);
  assert.throws(
    () => xhr.send(makePlaybackBody()),
    (error) => error?.name === "AbortError",
    `${label}: XHR playback POST is rejected`,
  );
}

function assertPlan() {
  const realm = vm.createContext({URL, DOMException, console, __DP4K_TEST__: true});
  vm.runInContext(source, realm);
  const plan = JSON.parse(vm.runInContext(
    `JSON.stringify(__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(MODE)}])`, realm,
  ));
  assert.ok(plan, "HDR single-PQ mode is published in MODE_PLANS");
  assert.equal(plan.scenario, "tv-drm-ctr-h265-hdr10-atmos");
  assert.equal(plan.resolution, "3840x2160");
  assert.equal(plan.sdkMaxHeight, 2160);
  assert.equal(plan.sdkRecommendationFlow, true);
  assert.equal(plan.sdkUhdPolicy, true);
  assert.equal(plan.singleHdrVariant, true);
  assert.notEqual(plan.singleSdrProbe, true, "HDR playback mode is not probe-only");
}

async function assertEmeBlocked(runtime, label) {
  runtime.run(`globalThis.blockedEmeInput = ${JSON.stringify(makeEmeInput())};
    globalThis.blockedEmeMarker = {marker: "blocked-eme"};`);
  await assert.rejects(
    runtime.run(`navigator.requestMediaKeySystemAccess(
      "com.microsoft.playready.recommendation.3000", blockedEmeInput, blockedEmeMarker,
    )`),
    (error) => error?.name === "AbortError",
    label,
  );
  assert.equal(runtime.nativeEmeCalls.length, 0, `${label}: native EME count remains zero`);
}

async function prepareSession(runtime) {
  await runtime.run(`(async () => {
    globalThis.emEInput = ${JSON.stringify(makeEmeInput())};
    globalThis.emEMarker = {marker: "eme"};
    globalThis.mediaMarker = {marker: "keys"};
    globalThis.sessionMarker = {marker: "session"};
    globalThis.videoMarker = {marker: "video"};
    globalThis.closeMarker = {marker: "close"};
    globalThis.removeMarker = {marker: "remove"};
    globalThis.testInitData = new Uint8Array([1, 2, 3]);
    globalThis.testLicense = new Uint8Array([4, 5, 6]);
    globalThis.emEAccess = await navigator.requestMediaKeySystemAccess(
      "com.microsoft.playready.recommendation.3000", emEInput, emEMarker,
    );
    globalThis.emEKeys = await emEAccess.createMediaKeys(mediaMarker);
    globalThis.emEVideo = new HTMLMediaElement();
    await emEVideo.setMediaKeys(emEKeys, videoMarker);
    globalThis.emESession = emEKeys.createSession("temporary", sessionMarker);
  })()`);
  assert.equal(runtime.nativeEmeCalls.length, 1, "one native EME access query is made after a compatible master");
  const call = runtime.nativeEmeCalls[0];
  assert.equal(call.args.length, 3);
  assert.equal(call.args[0], "com.microsoft.playready.recommendation.3000");
  assert.equal(call.args[2], runtime.context.emEMarker, "native EME trailing argument is preserved");
  assert.notEqual(call.args[1], runtime.context.emEInput, "EME configuration is copied");
  const forwarded = json(call.args[1]);
  assert.equal(forwarded[0].distinctiveIdentifier, "not-allowed");
  assert.equal(forwarded[0].persistentState, "optional");
  assert.deepEqual(forwarded[0].sessionTypes, ["temporary"]);
  assert.deepEqual(json(runtime.context.emEInput), makeEmeInput(), "source EME config remains unchanged");
  assert.equal(runtime.nativeMediaKeysCalls.length, 1);
  assert.equal(runtime.nativeMediaKeysCalls[0].args[0], runtime.context.mediaMarker);
  const setKeys = runtime.nativeSessionMethodCalls.find(({method}) => method === "setMediaKeys");
  assert.ok(setKeys, "setMediaKeys reaches the native video");
  assert.equal(setKeys.args[0], runtime.context.emEKeys);
  assert.equal(setKeys.args[1], runtime.context.videoMarker);
  assert.equal(runtime.nativeSessionCalls.length, 1);
  assert.deepEqual(json(runtime.nativeSessionCalls[0].args), ["temporary", {marker: "session"}]);
  assert.equal(runtime.nativeSessionCalls[0].args[1], runtime.context.sessionMarker);
}

async function assertAcceptedGenerateAndCleanup(runtime) {
  const generate = runtime.run("emESession.generateRequest('cenc', testInitData)");
  assert.equal(generate, runtime.generatePromise, "generateRequest preserves the native Promise");
  await generate;
  const update = runtime.run("emESession.update(testLicense)");
  assert.equal(update, runtime.updatePromise, "update preserves the native Promise");
  await update;
  const close = runtime.run("emESession.close(closeMarker)");
  assert.equal(close, runtime.closePromise, "close preserves the native Promise");
  await close;
  const remove = runtime.run("emESession.remove(removeMarker)");
  assert.equal(remove, runtime.removePromise, "remove preserves the native Promise");
  await remove;
  const methods = runtime.nativeSessionMethodCalls.filter(({method}) =>
    ["generateRequest", "update", "close", "remove"].includes(method));
  assert.deepEqual(methods.map(({method}) => method), ["generateRequest", "update", "close", "remove"]);
  assert.equal(methods[0].args[0], "cenc");
  assert.equal(methods[0].args[1], runtime.context.testInitData);
  assert.equal(methods[1].args[0], runtime.context.testLicense);
  assert.equal(methods[2].args[0], runtime.context.closeMarker);
  assert.equal(methods[3].args[0], runtime.context.removeMarker);
}

async function fetchMaster(runtime) {
  const response = await runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`);
  const selected = await response.text();
  assert.equal(countVariants(selected), 1, "fetch returns exactly one PQ STREAM-INF");
  assert.match(selected, /BANDWIDTH=9200000/);
  assert.doesNotMatch(selected, /BANDWIDTH=6200000|BANDWIDTH=15000000|BANDWIDTH=17000000|BANDWIDTH=18000000/);
  assert.match(selected, /RESOLUTION=3840x2160/);
  assert.match(selected, /VIDEO-RANGE=PQ/);
  assert.match(selected, /CODECS="hvc1\.2\.4\.L153\.B0,mp4a\.40\.2"/);
  const media = await runtime.run(`fetch(${JSON.stringify(MEDIA_URL)})`);
  assert.equal(await media.text(), MEDIA_PLAYLIST, "fetch leaves the media playlist unchanged");
  assert.equal(nativePostCount(runtime), 1);
  return selected;
}

function xhrMaster(runtime, responseType) {
  const xhr = new runtime.context.XMLHttpRequest();
  xhr.open("GET", MASTER_URL, true, "user", "password");
  if (responseType) xhr.responseType = responseType;
  xhr.send();
  const selected = responseType === "arraybuffer"
    ? new TextDecoder().decode(xhr.response)
    : xhr.responseText;
  assert.equal(countVariants(selected), 1, `${responseType || "text"} XHR returns one PQ STREAM-INF`);
  assert.match(selected, /BANDWIDTH=9200000/);
  assert.doesNotMatch(selected, /BANDWIDTH=6200000|BANDWIDTH=15000000|BANDWIDTH=17000000|BANDWIDTH=18000000/);
  assert.match(selected, /VIDEO-RANGE=PQ/);
  assert.match(selected, /RESOLUTION=3840x2160/);
  assert.deepEqual(xhr.openArgs.slice(2), [true, "user", "password"],
    "manifest XHR open trailing arguments are preserved");
  const media = new runtime.context.XMLHttpRequest();
  media.open("GET", MEDIA_URL);
  if (responseType) media.responseType = responseType;
  media.send();
  const mediaBody = responseType === "arraybuffer"
    ? new TextDecoder().decode(media.response)
    : media.responseText;
  assert.equal(mediaBody, MEDIA_PLAYLIST, `${responseType || "text"} XHR leaves media unchanged`);
  return selected;
}

async function readyRuntime({
  channel = "fetch",
  master = PQ_MASTER,
  holdGenerate = false,
  generateBehavior = "resolve",
  reenterGenerate = false,
} = {}) {
  const runtime = createRuntime({master, holdGenerate, generateBehavior, reenterGenerate});
  await createSdk(runtime);
  if (channel === "fetch") {
    await sendPlaybackFetch(runtime);
    await fetchMaster(runtime);
  } else {
    sendPlaybackXhr(runtime);
    xhrMaster(runtime, channel === "xhr-arraybuffer" ? "arraybuffer" : "text");
  }
  return runtime;
}

async function runAcceptedChannel(channel) {
  const runtime = await readyRuntime({channel});
  await prepareSession(runtime);
  await assertAcceptedGenerateAndCleanup(runtime);
  assert.equal(nativeGenerateCount(runtime), 1, `${channel}: one native generateRequest reaches the CDM`);
  assert.equal(nativePostCount(runtime), 1, `${channel}: one native playback POST remains`);
}

async function runEmeGateCases() {
  const beforeSdk = createRuntime();
  await assertEmeBlocked(beforeSdk, "SDK前のEME要求は拒否される");

  const beforeMaster = createRuntime();
  await createSdk(beforeMaster);
  await sendPlaybackFetch(beforeMaster);
  // The real SDK asks for EME access before it has fetched the master.  Keep
  // that access path observable, but do not let a license challenge start
  // until the single compatible PQ master has been accepted.
  await prepareSession(beforeMaster);
  assert.equal(beforeMaster.nativeEmeCalls.length, 1,
    "SDK後・master前のEME accessは実再生順序どおり1回許可される");
  assert.equal(nativeGenerateCount(beforeMaster), 0,
    "適合master前はgenerateRequest native到達数が0のまま");
  await fetchMaster(beforeMaster);
  const acceptedGenerate = beforeMaster.run("emESession.generateRequest('cenc', testInitData)");
  assert.equal(acceptedGenerate, beforeMaster.generatePromise);
  await acceptedGenerate;
  assert.equal(beforeMaster.nativeEmeCalls.length, 1,
    "native EME access remains the single SDK-before-master request");
  assert.equal(nativeGenerateCount(beforeMaster), 1,
    "the existing session can generate natively after the compatible master");

  const blocked = createRuntime();
  await createSdk(blocked);
  await sendPlaybackFetch(blocked);
  await prepareSession(blocked);
  await assert.rejects(
    blocked.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    "適合master前のgenerateRequestは拒否される",
  );
  assert.equal(nativeGenerateCount(blocked), 0,
    "拒否された適合master前generateRequestはnativeへ追加到達しない");
}

async function runRejectedMasterCases() {
  for (const [master, label] of [
    [SDR_MASTER, "SDR"],
    [HLG_MASTER, "HLG"],
    [ABSENT_RANGE_MASTER, "range absent"],
    [INCOMPATIBLE_MASTER, "incompatible PQ"],
  ]) {
    for (const channel of ["fetch", "xhr-text", "xhr-arraybuffer"]) {
      const runtime = createRuntime({master});
      await createSdk(runtime);
      if (channel === "fetch") {
        await sendPlaybackFetch(runtime);
        await assert.rejects(
          runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`),
          (error) => error?.name === "AbortError",
          `${label}/${channel}: non-PQ or incompatible master is rejected`,
        );
        assert.equal(nativeMasterFetchCount(runtime), 1);
      } else {
        sendPlaybackXhr(runtime);
        const responseType = channel === "xhr-arraybuffer" ? "arraybuffer" : "text";
        const xhr = new runtime.context.XMLHttpRequest();
        xhr.open("GET", MASTER_URL);
        xhr.responseType = responseType;
        assert.throws(
          () => {
            xhr.send();
            return responseType === "arraybuffer" ? xhr.response : xhr.responseText;
          },
          (error) => error?.name === "AbortError",
          `${label}/${channel}: non-PQ or incompatible master is rejected`,
        );
        assert.equal(nativeMasterXhrCount(runtime), 1);
      }
      assert.equal(nativeGenerateCount(runtime), 0,
        `${label}/${channel}: rejected master cannot reach native generateRequest`);
      await assertEmeBlocked(runtime, `${label}/${channel}: EME remains blocked after rejection`);
    }
  }
}

async function runSecondSessionGenerateCase() {
  const runtime = await readyRuntime({holdGenerate: true});
  await prepareSession(runtime);
  const first = runtime.run("emESession.generateRequest('cenc', testInitData)");
  assert.equal(first, runtime.generatePromise, "first generateRequest remains held on the native Promise");
  assert.equal(nativeGenerateCount(runtime), 1, "first session reaches native generateRequest once");
  runtime.run(`globalThis.secondSessionMarker = {marker: "second-session"};
    globalThis.secondSession = emEKeys.createSession("temporary", secondSessionMarker);`);
  const second = runtime.run("secondSession.generateRequest('cenc', testInitData)");
  await assert.rejects(
    second,
    (error) => error?.name === "AbortError",
    "second session generateRequest is stopped while the first native request is held",
  );
  assert.equal(nativeGenerateCount(runtime), 1,
    "second session adds no native generateRequest call");
  assert.equal(runtime.pauseCalls, 1,
    "second held generateRequest stops the comparison and pauses the observed video once");
}

async function runResolvedGenerateBudgetCases() {
  const sameSession = await readyRuntime();
  await prepareSession(sameSession);
  const first = sameSession.run("emESession.generateRequest('cenc', testInitData)");
  assert.equal(first, sameSession.generatePromise);
  await first;
  assert.equal(nativeGenerateCount(sameSession), 1,
    "resolved first generateRequest reaches native once");
  await assert.rejects(
    sameSession.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    "same-session second generateRequest is rejected after the first resolves",
  );
  assert.equal(nativeGenerateCount(sameSession), 1,
    "same-session second generateRequest adds no native call");
  assert.equal(sameSession.pauseCalls, 1,
    "same-session second generateRequest pauses the observed video once");

  const otherSession = await readyRuntime();
  await prepareSession(otherSession);
  const otherFirst = otherSession.run("emESession.generateRequest('cenc', testInitData)");
  await otherFirst;
  otherSession.run(`globalThis.secondSessionMarker = {marker: "resolved-second-session"};
    globalThis.secondSession = emEKeys.createSession("temporary", secondSessionMarker);`);
  await assert.rejects(
    otherSession.run("secondSession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    "different-session second generateRequest is rejected after the first resolves",
  );
  assert.equal(nativeGenerateCount(otherSession), 1,
    "different-session second generateRequest adds no native call");
  assert.equal(otherSession.pauseCalls, 1,
    "different-session second generateRequest pauses the observed video once");
  await rejectPlaybackFetch(otherSession, "resolved different-session second generate");
  assert.equal(nativePostCount(otherSession), 1,
    "post after a second resolved-session request never reaches native again");
}

async function runGenerateFailureCase(generateBehavior) {
  const runtime = await readyRuntime({generateBehavior});
  await prepareSession(runtime);
  if (generateBehavior === "sync-throw") {
    assert.throws(
      () => runtime.run("emESession.generateRequest('cenc', testInitData)"),
      (error) => error === runtime.generateError,
      "同期throwは同一Error identityで呼び出し元へ返る",
    );
  } else {
    const first = runtime.run("emESession.generateRequest('cenc', testInitData)");
    assert.equal(first, runtime.generatePromise,
      "非同期rejectでもnative Promise identityは保持される");
    await assert.rejects(
      first,
      (error) => error === runtime.generateError,
      "非同期rejectは同一Error identityで呼び出し元へ返る",
    );
  }
  const nativeCall = runtime.nativeSessionMethodCalls.find(({method}) => method === "generateRequest");
  assert.ok(nativeCall, `${generateBehavior}: native generateRequest is attempted once`);
  assert.equal(nativeCall.args[0], "cenc", `${generateBehavior}: initDataType argument is preserved`);
  assert.equal(nativeCall.args[1], runtime.context.testInitData,
    `${generateBehavior}: initData identity is preserved`);
  assert.equal(nativeGenerateCount(runtime), 1,
    `${generateBehavior}: first native generateRequest count is one`);
  assert.equal(runtime.pauseCalls, 1,
    `${generateBehavior}: media-error stops and pauses the observed video immediately`);
  assert.equal([...runtime.timers.values()].some(({delay}) => delay === 30000), false,
    `${generateBehavior}: media-error clears the 30-second timer`);
  await rejectAfterStop(runtime, `${generateBehavior} media-error`);
}

async function runGenerateReentryCase() {
  const runtime = await readyRuntime({reenterGenerate: true});
  await prepareSession(runtime);
  const first = runtime.run("emESession.generateRequest('cenc', testInitData)");
  assert.equal(first, runtime.generatePromise,
    "reentrant test keeps the outer native Promise identity");
  await first;
  await assert.rejects(
    runtime.reentryPromise,
    (error) => error?.name === "AbortError",
    "reentrant generateRequest is rejected by the second-request guard",
  );
  assert.equal(runtime.reentryError?.name, "AbortError",
    "reentrant rejection is observed without changing the native error contract");
  assert.equal(nativeGenerateCount(runtime), 1,
    "the generate budget is consumed before native reentry, so native is called once");
  assert.equal(runtime.pauseCalls, 1,
    "reentrant second request stops and pauses the observed video once");
  await rejectPlaybackFetch(runtime, "reentrant second generate");
  assert.equal(nativePostCount(runtime), 1,
    "reentrant second request prevents a later native playback POST");
}

async function rejectAfterStop(runtime, label) {
  const postsBefore = nativePostCount(runtime);
  await rejectPlaybackFetch(runtime, `${label}: fetch`);
  assert.equal(nativePostCount(runtime), postsBefore,
    `${label}: stopped runtime does not issue another native playback POST`);
  await assert.rejects(
    runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`),
    (error) => error?.name === "AbortError",
    `${label}: master fetch is rejected`,
  );
  const generateBefore = nativeGenerateCount(runtime);
  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    `${label}: generateRequest is rejected`,
  );
  assert.equal(nativeGenerateCount(runtime), generateBefore,
    `${label}: stopped runtime does not issue native generateRequest`);
}

async function runTimerStopCase() {
  const runtime = await readyRuntime();
  await prepareSession(runtime);
  const first = runtime.run("emESession.generateRequest('cenc', testInitData)");
  assert.equal(first, runtime.generatePromise, "the first native generateRequest is started before the timer");
  await first;
  assert.equal(nativeGenerateCount(runtime), 1,
    "the first generateRequest succeeds before the 30-second stop");
  runtime.fire30Seconds();
  assert.equal(runtime.pauseCalls, 1, "30-second stop pauses the observed video exactly once");
  assert.equal(runtime.video.paused, true);
  await rejectAfterStop(runtime, "30秒タイマー");
  assert.equal(nativeGenerateCount(runtime), 1,
    "the timer stop leaves the already-completed native generate count at one");
}

async function runRetiredCase() {
  const runtime = await readyRuntime();
  await prepareSession(runtime);
  runtime.pagehide();
  assert.equal(runtime.pauseCalls, 1, "pagehide retirement pauses the observed video");
  await rejectAfterStop(runtime, "退役");
  const second = runtime.run(
    "new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)",
  );
  await assert.rejects(second, (error) => error?.name === "AbortError", "retired document rejects a second SDK create");
  assert.equal(runtime.sdkCalls.length, 1, "retired document keeps one native SDK create");
}

async function runDoubleSdkCase() {
  const runtime = createRuntime();
  await createSdk(runtime);
  const second = runtime.run(
    "new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)",
  );
  await assert.rejects(second, (error) => error?.name === "AbortError", "double SDK create is rejected");
  assert.equal(runtime.sdkCalls.length, 1, "double SDK create never reaches native SDK");
}

async function runDoubleMasterCase() {
  const runtime = await readyRuntime();
  await prepareSession(runtime);
  const before = nativeMasterFetchCount(runtime);
  await assert.rejects(
    runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`),
    (error) => error?.name === "AbortError",
    "double compatible master is rejected",
  );
  assert.ok(nativeMasterFetchCount(runtime) >= before,
    "the second master attempt is observed without permitting a second accepted decision");
  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    "generateRequest is rejected after a duplicate master");
  assert.equal(nativeGenerateCount(runtime), 0,
    "double master never permits native generateRequest");
  assert.equal(runtime.pauseCalls, 1,
    "duplicate master stops the comparison and pauses the observed video once");
}

assertPlan();
for (const channel of ["fetch", "xhr-text", "xhr-arraybuffer"]) {
  await runAcceptedChannel(channel);
}
await runEmeGateCases();
await runRejectedMasterCases();
await runSecondSessionGenerateCase();
await runResolvedGenerateBudgetCases();
await runTimerStopCase();
await runRetiredCase();
await runDoubleSdkCase();
await runDoubleMasterCase();
await runGenerateFailureCase("sync-throw");
await runGenerateFailureCase("async-reject");
await runGenerateReentryCase();

console.log("HDR10 single-PQ runtime: SDK/EME gates, argument identity, unique PQ max-bandwidth selection over fetch/XHR text+arraybuffer, non-PQ rejection, one held native generateRequest, retirement, 30-second stop, and duplicate SDK/master guards passed");
