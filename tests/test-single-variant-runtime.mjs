import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../extension/DisneyPlus-Edge-Enhanced.user.js", import.meta.url), "utf8");
const VERSION = "0.4.0";
const MODE = "1080p-hevc-single-sdr";
const PROBE_MODE = "4k-hevc-sdr-manifest-probe";
const HDR10_PROBE_MODE = "4k-hdr10-sdr-manifest-probe";
const PROBE_MODES = [PROBE_MODE, HDR10_PROBE_MODE];
const SDK_VERSION = "26.10.0-jasmine";
const DOCUMENT_URL = "https://www.disneyplus.com/ja-jp/play/single-variant-runtime-test";
const SESSION_SDK_URL = `https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/${SDK_VERSION}/all_browser_es6/playback-session.js`;
const PLAYBACK_URL = "https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular";
const PLAYBACK_SCENARIO_URL = "https://disney.playback.edge.bamgrid.com/v7/playback/tv-drm-ctr-h265-atmos";
const HDR10_PLAYBACK_SCENARIO_URL = "https://disney.playback.edge.bamgrid.com/v7/playback/tv-drm-ctr-h265-hdr10-atmos";
const MASTER_URL = "https://cdn.example.test/master.m3u8";
const MEDIA_URL = "https://cdn.example.test/video-1080.m3u8";

function isProbeMode(mode) {
  return PROBE_MODES.includes(mode);
}

function playbackScenarioUrl(mode) {
  return mode === HDR10_PROBE_MODE ? HDR10_PLAYBACK_SCENARIO_URL : PLAYBACK_SCENARIO_URL;
}

// This is deliberately a two-variant mock master plus one media playlist.
// Both regular variants satisfy the target shape; the selector must retain the
// single highest-bandwidth candidate and must leave the media playlist alone.
const MASTER_PLAYLIST = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=3200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=1920x1080,VIDEO-RANGE=SDR,FRAME-RATE=30',
  "video-1080-low.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=5800000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=1920x1080,VIDEO-RANGE=SDR,FRAME-RATE=59.94',
  "video-1080-high.m3u8",
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
const REJECTED_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=2200000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1920x1080,VIDEO-RANGE=SDR,FRAME-RATE=30',
  "video-h264.m3u8",
  "",
].join("\n");
const UHD_SDR_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=7200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=SDR,FRAME-RATE=59.94',
  "video-2160-sdr-low.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=SDR,FRAME-RATE=59.94',
  "video-2160-sdr-high.m3u8",
  "",
].join("\n");
const UHD_HDR_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=PQ,FRAME-RATE=59.94',
  "video-2160-hdr.m3u8",
  "",
].join("\n");
const INVALID_MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=9200000,BANDWIDTH=9200000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,VIDEO-RANGE=SDR,FRAME-RATE=59.94',
  "video-invalid.m3u8",
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

function createRuntime({
  mode = MODE,
  master = MASTER_PLAYLIST,
  outerFetch = false,
  outerFetchMode = "delegate",
  fetchProperty = "normal",
} = {}) {
  const callbacks = new Map();
  const timers = new Map();
  const nativeFetchCalls = [];
  const nativeXhrCalls = [];
  const outerFetchCalls = [];
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
    outerFetchCalls,
    nativeEmeCalls,
    nativeMediaKeysCalls,
    nativeSessionCalls,
    nativeSessionMethodCalls,
    nativePlaybackSessionCalls,
    sdkCalls,
    reloads: 0,
    timerSequence: 0,
    mode,
    master,
  };

  const localStorage = makeStorage([["ioridev.disneyplus4k.mode.v1", mode === "fullhd" ? "fullhd" : "original"]]);
  const sessionStorage = mode === "original" || mode === "fullhd"
    ? makeStorage()
    : makeStorage([[`ioridev.disneyplus4k.once.v${VERSION}`, JSON.stringify({
      version: VERSION,
      mode,
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
    const body = init && Object.prototype.hasOwnProperty.call(init, "body")
      ? init.body
      : undefined;
    nativeFetchCalls.push({thisValue: this, input, init, url, method, body});
    if (method === "POST" && url.includes("/v7/playback/")) {
      return responseFor(url, '{"ok":true}', "application/json");
    }
    if (url === MASTER_URL) return responseFor(url, master);
    if (url === MEDIA_URL) return responseFor(url, MEDIA_PLAYLIST);
    return responseFor(url, "", "text/plain");
  };

  const pageOuterFetch = async function pageOuterFetch(input, init) {
    outerFetchCalls.push({thisValue: this, input, init});
    if (outerFetchMode === "manifest-nondelegating"
      && requestMethod(input, init) === "GET" && requestUrl(input) === MASTER_URL) {
      return responseFor(MASTER_URL, master);
    }
    return Reflect.apply(nativeFetch, this, [input, init]);
  };
  const initialFetch = outerFetch ? pageOuterFetch : nativeFetch;

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
      for (const listener of this._listeners.get("loadend") || []) listener.callback.call(this, {type: "loadend"});
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
    setMediaKeys(...args) {
      nativeSessionMethodCalls.push({method: "setMediaKeys", thisValue: this, args});
      this.mediaKeys = args[0];
      return runtime.setKeysPromise;
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

  runtime.generatePromise = Promise.resolve({native: "generate"});
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
    location: {href: DOCUMENT_URL, pathname: "/ja-jp/play/single-variant-runtime-test", reload: () => { runtime.reloads += 1; }},
    document: {documentElement: null, currentScript: null, querySelectorAll: () => []},
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: new NativeNavigator(),
    MediaKeySystemAccess: NativeAccess,
    MediaKeys: NativeMediaKeys,
    MediaKeySession: NativeSession,
    HTMLMediaElement: NativeVideo,
    XMLHttpRequest: NativeXMLHttpRequest,
    fetch: initialFetch,
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
  if (fetchProperty === "noncallable") {
    Object.defineProperty(context, "fetch", {value: {}, configurable: true, writable: true});
  } else if (fetchProperty === "immutable") {
    Object.defineProperty(context, "fetch", {value: initialFetch, configurable: false, writable: false});
  }
  runtime.run = (expression) => vm.runInContext(expression, context);
  runtime.publishSdk = () => vm.runInContext(
    `globalThis['playback-service'] = {PlaybackService: PlaybackService};
    ${isProbeMode(mode) ? `document.currentScript = {src: ${JSON.stringify(SESSION_SDK_URL)}};
    globalThis['playback-session'] = sessionExport;
    document.currentScript = null;` : ""}`,
    context,
  );
  runtime.fire75Seconds = () => {
    const entry = [...timers.entries()].find(([, value]) => value.delay === 75000);
    assert.ok(entry, "single-variant SDK start installs the 75-second retirement timer");
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

async function publishAndCreate(runtime) {
  publishSdkInput(runtime);
  await createSdk(runtime);
}

function publishSdkInput(runtime) {
  runtime.publishSdk();
  const options = makeSdkOptions();
  runtime.run(`globalThis.sdkInput = ${JSON.stringify(options)}; globalThis.sdkMarker = {marker: "sdk"};`);
  if (isProbeMode(runtime.mode)) {
    runtime.run(`globalThis.sdkSessionInput = ${JSON.stringify(makeSdkSessionOptions())};
      globalThis.sdkSessionMarker = {marker: "session-sdk"};`);
  }
}

async function createSdk(runtime) {
  const result = runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  assert.equal(result, runtime.sdkPromise, "SDK wrapper preserves the native create Promise");
  await result;
  assert.equal(runtime.sdkCalls.length, 1, "single-variant mode performs exactly one native SDK create");
  const call = runtime.sdkCalls[0];
  assert.equal(call.args.length, 2);
  assert.equal(call.args[1], runtime.context.sdkMarker, "SDK trailing arguments are preserved");
  assert.notEqual(call.args[0], runtime.context.sdkInput, "SDK config is copied before the mode override");
  const planned = json(call.args[0]);
  assert.equal(planned.clientParameters.configOverrides["hive-dmp"].playlistFiltering, undefined);
  const hive = planned.clientParameters.configOverrides["hive-dmp"];
  const expectedHeight = isProbeMode(runtime.mode) ? 2160 : 1080;
  const expectedResolution = isProbeMode(runtime.mode) ? "3840x2160" : "1920x1080";
  assert.equal(hive.session.vod.playlistFiltering.maxHeight, expectedHeight,
    `SDK configMax${expectedHeight} is applied`);
  assert.deepEqual(hive.session.vod.playbackAttributesConfig.resolution.max, [expectedResolution]);
  assert.equal(hive.engine.drmPlayReadyRecommendationFlow, true, "SDK PlayReady recommendation is enabled");
  assert.deepEqual(json(runtime.context.sdkInput), makeSdkOptions(), "source SDK options remain unchanged");
  if (isProbeMode(runtime.mode)) {
    const sessionResult = runtime.run(
      "new globalThis['playback-session'].PlaybackSession(sdkSessionInput, sdkSessionMarker)",
    );
    assert.ok(sessionResult, "UHD policy hook returns the native PlaybackSession instance");
    assert.equal(runtime.nativePlaybackSessionCalls.length, 1,
      "UHD policy hook reaches the native PlaybackSession constructor exactly once");
    const sessionCall = runtime.nativePlaybackSessionCalls[0];
    assert.equal(sessionCall.args.length, 2);
    assert.equal(sessionCall.args[1], runtime.context.sdkSessionMarker,
      "PlaybackSession trailing arguments are preserved");
    assert.notEqual(sessionCall.args[0], runtime.context.sdkSessionInput,
      "PlaybackSession config is copied before UHD policy override");
    const sessionPlanned = json(sessionCall.args[0]);
    assert.deepEqual(sessionPlanned.mediaCapabilities.videoResolutions, ["SD", "HD", "FHD", "UHD"],
      "PlaybackSession UHD candidate is appended");
    assert.deepEqual(json(runtime.context.sdkSessionInput), makeSdkSessionOptions(),
      "source PlaybackSession options remain unchanged");
    assert.deepEqual(sessionPlanned.mediaCapabilities.drm,
      {keySystem: "com.microsoft.playready", robustness: "SW_SECURE_DECODE"});
    assert.equal(sessionCall.args[0].mediaCapabilities.drm, runtime.context.sdkSessionInput.mediaCapabilities.drm,
      "native DRM object identity is preserved through the UHD policy hook");
    assert.equal(sessionCall.args[0].mediaCapabilities.other, runtime.context.sdkSessionInput.mediaCapabilities.other,
      "unrelated session capability references are preserved");
  }
}

async function sendPlayback(runtime) {
  const body = makePlaybackBody();
  const result = runtime.run(`fetch(${JSON.stringify(PLAYBACK_URL)}, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: ${JSON.stringify(body)},
  })`);
  await result;
  const native = runtime.nativeFetchCalls.at(-1);
  assert.equal(native.method, "POST");
  assert.equal(native.url, playbackScenarioUrl(runtime.mode), "playback POST is rewritten only to the selected scenario");
  const expectedResolution = isProbeMode(runtime.mode) ? "3840x2160" : "1920x1080";
  assert.deepEqual(json(JSON.parse(native.body)), {
    playback: {attributes: {resolution: {max: [expectedResolution]}}},
  });
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 1,
    "exactly one playback POST reaches native fetch");
}

function sendPlaybackXhr(runtime) {
  const xhr = new runtime.context.XMLHttpRequest();
  xhr.open("POST", PLAYBACK_URL);
  xhr.send(makePlaybackBody());
  const playbackCall = runtime.nativeXhrCalls.find(({method}) => method === "POST");
  assert.ok(playbackCall, "one playback POST reaches native XHR");
  assert.equal(playbackCall.url, playbackScenarioUrl(runtime.mode));
  const expectedResolution = isProbeMode(runtime.mode) ? "3840x2160" : "1920x1080";
  assert.deepEqual(json(JSON.parse(playbackCall.body)), {
    playback: {attributes: {resolution: {max: [expectedResolution]}}},
  });
  assert.equal(runtime.nativeXhrCalls.filter(({method}) => method === "POST").length, 1,
    "exactly one playback POST reaches native XHR");
}

async function rejectPlaybackFetch(runtime, label = "playback POST") {
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

function rejectPlaybackXhr(runtime, label = "playback POST") {
  const xhr = new runtime.context.XMLHttpRequest();
  xhr.open("POST", PLAYBACK_URL);
  assert.throws(
    () => xhr.send(makePlaybackBody()),
    (error) => error?.name === "AbortError",
    `${label}: XHR playback POST is rejected`,
  );
}

function assertOneNativePlayback(runtime, label) {
  const fetchPosts = runtime.nativeFetchCalls.filter(({method}) => method === "POST").length;
  const xhrPosts = runtime.nativeXhrCalls.filter(({method}) => method === "POST").length;
  assert.equal(fetchPosts + xhrPosts, 1, `${label}: native playback POST total remains one`);
}

function captureCurrentFetch(runtime) {
  return runtime.context.fetch;
}

function setForwardingFetch(runtime, captured) {
  runtime.context.savedCapturedFetch = captured;
  runtime.run(`globalThis.fetch = function forwardingReplacementFetch(...args) {
    return Reflect.apply(savedCapturedFetch, this, args);
  };`);
}

function setNonDelegatingFetch(runtime) {
  runtime.run(`globalThis.fetch = async function nonDelegatingReplacementFetch() {
    return new Response(${JSON.stringify(MASTER_PLAYLIST)}, {
      status: 200,
      headers: {"content-type": "application/vnd.apple.mpegurl"},
    });
  };`);
}

async function rejectCapturedFetch(runtime, captured, url, label) {
  runtime.context.savedCapturedFetch = captured;
  const expression = `savedCapturedFetch(${JSON.stringify(url)}, {
    method: "${url === PLAYBACK_URL ? "POST" : "GET"}",
    headers: {"content-type": "application/json"},
    ${url === PLAYBACK_URL ? `body: ${JSON.stringify(makePlaybackBody())},` : ""}
  })`;
  await assert.rejects(
    runtime.run(expression),
    (error) => error?.name === "AbortError",
    label,
  );
}

async function fetchMasterAndMedia(runtime) {
  const masterResponse = await runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`);
  const selected = await masterResponse.text();
  assert.equal(countVariants(selected), 1, "fetch returns exactly one normal STREAM-INF");
  assert.match(selected, /BANDWIDTH=5800000/);
  assert.doesNotMatch(selected, /BANDWIDTH=3200000/);
  assert.match(selected, /RESOLUTION=1920x1080/);
  assert.match(selected, /VIDEO-RANGE=SDR/);
  assert.match(selected, /CODECS="hvc1\.2\.4\.L153\.B0,mp4a\.40\.2"/);

  const mediaResponse = await runtime.run(`fetch(${JSON.stringify(MEDIA_URL)})`);
  assert.equal(await mediaResponse.text(), MEDIA_PLAYLIST, "media playlist is not rewritten");
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 1);
}

function xhrMasterAndMedia(runtime, responseType) {
  const masterXhr = new runtime.context.XMLHttpRequest();
  masterXhr.open("GET", MASTER_URL);
  if (responseType) masterXhr.responseType = responseType;
  masterXhr.send();
  const selected = responseType === "arraybuffer"
    ? new TextDecoder().decode(masterXhr.response)
    : masterXhr.responseText;
  assert.equal(countVariants(selected), 1, `${responseType || "text"} XHR returns exactly one normal STREAM-INF`);
  assert.match(selected, /BANDWIDTH=5800000/);
  assert.doesNotMatch(selected, /BANDWIDTH=3200000/);
  assert.match(selected, /RESOLUTION=1920x1080/);
  assert.match(selected, /VIDEO-RANGE=SDR/);
  assert.match(selected, /CODECS="hvc1\.2\.4\.L153\.B0,mp4a\.40\.2"/);

  const mediaXhr = new runtime.context.XMLHttpRequest();
  mediaXhr.open("GET", MEDIA_URL);
  if (responseType) mediaXhr.responseType = responseType;
  mediaXhr.send();
  const media = responseType === "arraybuffer"
    ? new TextDecoder().decode(mediaXhr.response)
    : mediaXhr.responseText;
  assert.equal(media, MEDIA_PLAYLIST, `${responseType || "text"} XHR leaves media playlist unchanged`);
}

async function prepareSession(runtime, {singleVariant = true} = {}) {
  await runtime.run(`(async () => {
  globalThis.emEInput = [{
    initDataTypes: ["cenc"],
    sessionTypes: ["temporary"],
    persistentState: "optional",
    distinctiveIdentifier: "required",
    videoCapabilities: [{contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"', robustness: "2000"}],
    audioCapabilities: [{contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "3000"}],
  }];
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
  assert.equal(runtime.nativeEmeCalls.length, 1, "one native EME access query is made");
  const call = runtime.nativeEmeCalls[0];
  assert.equal(call.args.length, 3);
  assert.equal(call.args[0], "com.microsoft.playready.recommendation.3000");
  assert.equal(call.args[2], runtime.context.emEMarker, "native EME trailing argument is preserved");
  if (singleVariant) {
    assert.equal(call.args[1] !== runtime.context.emEInput, true, "recommendation guard copies the EME configuration");
    const forwarded = json(call.args[1]);
    assert.equal(forwarded[0].distinctiveIdentifier, "not-allowed");
    assert.equal(forwarded[0].persistentState, "optional");
    assert.deepEqual(forwarded[0].sessionTypes, ["temporary"]);
    assert.deepEqual(forwarded[0].videoCapabilities, [{contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"', robustness: "2000"}]);
    assert.deepEqual(forwarded[0].audioCapabilities, [{contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "3000"}]);
    assert.equal(runtime.context.emEInput[0].distinctiveIdentifier, "required", "source EME config is unchanged");
  } else {
    assert.equal(call.args[1], runtime.context.emEInput, "normal mode forwards the original EME config");
    assert.equal(runtime.context.emEInput[0].distinctiveIdentifier, "required");
  }
  assert.equal(runtime.nativeMediaKeysCalls.length, 1);
  assert.equal(runtime.nativeMediaKeysCalls[0].args.length, 1);
  assert.equal(runtime.nativeMediaKeysCalls[0].args[0], runtime.context.mediaMarker);
  const setKeys = runtime.nativeSessionMethodCalls.find(({method}) => method === "setMediaKeys");
  assert.ok(setKeys, "setMediaKeys reaches the native media element");
  assert.equal(setKeys.args.length, 2);
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
  const methods = runtime.nativeSessionMethodCalls.filter(({method}) => ["generateRequest", "update", "close", "remove"].includes(method));
  assert.deepEqual(methods.map(({method}) => method), ["generateRequest", "update", "close", "remove"]);
  assert.equal(methods[0].args[0], "cenc");
  assert.equal(methods[0].args[1], runtime.context.testInitData, "native generateRequest initData is unchanged");
  assert.equal(methods[1].args[0], runtime.context.testLicense, "native update license bytes are unchanged");
  assert.equal(methods[2].args[0], runtime.context.closeMarker);
  assert.equal(methods[3].args[0], runtime.context.removeMarker);
}

async function assertProbeGenerateBlocked(runtime, label) {
  const before = runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length;
  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    `${label}: probe generateRequest is rejected`,
  );
  assert.equal(
    runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length,
    before,
    `${label}: native generateRequest remains untouched`,
  );
}

async function rejectProbeFetchManifest(runtime, url, label) {
  await assert.rejects(
    runtime.run(`fetch(${JSON.stringify(url)})`),
    (error) => error?.name === "AbortError",
    `${label}: probe rejects the manifest fetch`,
  );
  assert.equal(
    runtime.nativeFetchCalls.filter(({method, url: nativeUrl}) => method === "GET" && nativeUrl === url).length,
    1,
    `${label}: exactly one native manifest GET reaches the VM fixture`,
  );
}

function rejectProbeXhrManifest(runtime, responseType, url, label) {
  const xhr = new runtime.context.XMLHttpRequest();
  xhr.open("GET", url);
  if (responseType) xhr.responseType = responseType;
  assert.throws(
    () => {
      xhr.send();
      if (responseType === "arraybuffer") return xhr.response;
      return xhr.responseText;
    },
    (error) => error?.name === "AbortError",
    `${label}: ${responseType || "text"} probe rejects the manifest XHR`,
  );
  assert.equal(
    runtime.nativeXhrCalls.filter(({method, url: nativeUrl}) => method === "GET" && nativeUrl === url).length,
    1,
    `${label}: exactly one native ${responseType || "text"} manifest XHR reaches the VM fixture`,
  );
}

async function runProbeFixture(mode, channel, master, label) {
  const preProbeRuntime = createRuntime({mode, master});
  await publishAndCreate(preProbeRuntime);
  if (channel === "fetch") await sendPlayback(preProbeRuntime);
  else sendPlaybackXhr(preProbeRuntime);
  await prepareSession(preProbeRuntime);
  await assertProbeGenerateBlocked(preProbeRuntime, `${label} / before probe`);
  assert.equal(preProbeRuntime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    `${label}: pre-probe generateRequest never reaches native`);

  const runtime = createRuntime({mode, master});
  await publishAndCreate(runtime);
  if (channel === "fetch") {
    await sendPlayback(runtime);
  } else {
    sendPlaybackXhr(runtime);
  }
  const capturedFetch = captureCurrentFetch(runtime);
  await prepareSession(runtime);
  if (channel === "fetch") await rejectProbeFetchManifest(runtime, MASTER_URL, label);
  else rejectProbeXhrManifest(runtime, channel === "xhr-arraybuffer" ? "arraybuffer" : "text", MASTER_URL, label);
  await assertProbeGenerateBlocked(runtime, `${label} / after probe`);
  await rejectCapturedFetch(runtime, capturedFetch, MASTER_URL, `${label}: captured fetch after probe`);
  await rejectEmeWithoutNativeIncrement(runtime, `${label}: EME after probe`);
  if (channel === "fetch") await rejectPlaybackFetch(runtime, `${label}: second playback POST`);
  else rejectPlaybackXhr(runtime, `${label}: second playback POST`);
  assertOneNativePlayback(runtime, `${label}: playback POST cap`);
  const secondCreate = runtime.run(
    "new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)",
  );
  await assert.rejects(secondCreate, (error) => error?.name === "AbortError",
    `${label}: additional SDK create is rejected after probe`);
  assert.equal(runtime.sdkCalls.length, 1, `${label}: only the first native SDK create is allowed`);
  assert.equal(runtime.nativePlaybackSessionCalls.length, 1,
    `${label}: only the first native PlaybackSession constructor is allowed`);
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    `${label}: native generateRequest is never reached`);
  return runtime;
}

async function runProbeMediaFixture(mode, channel) {
  const label = `probe media-playlist / ${channel}`;
  const runtime = createRuntime({mode});
  await publishAndCreate(runtime);
  if (channel === "fetch") await sendPlayback(runtime);
  else sendPlaybackXhr(runtime);
  await prepareSession(runtime);
  if (channel === "fetch") await rejectProbeFetchManifest(runtime, MEDIA_URL, label);
  else rejectProbeXhrManifest(runtime, channel === "xhr-arraybuffer" ? "arraybuffer" : "text", MEDIA_URL, label);
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0);
}

async function runAcceptedChannel(channel) {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  if (channel === "fetch") {
    await sendPlayback(runtime);
    await fetchMasterAndMedia(runtime);
  } else {
    sendPlaybackXhr(runtime);
    xhrMasterAndMedia(runtime, channel === "xhr-arraybuffer" ? "arraybuffer" : "text");
  }
  await prepareSession(runtime);
  await assertAcceptedGenerateAndCleanup(runtime);
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 1);
  return runtime;
}

async function runSecondMasterAfterAccepted() {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  await fetchMasterAndMedia(runtime);
  await prepareSession(runtime);
  await assert.rejects(
    runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`),
    (error) => error?.name === "AbortError",
    "second master fetch is rejected after the single accepted master",
  );
  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    "generateRequest is rejected after a second master is observed",
  );
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    "second master never permits native generateRequest");
}

async function runSecondPlaybackCase(firstChannel, secondChannel) {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  if (firstChannel === "fetch") await sendPlayback(runtime);
  else sendPlaybackXhr(runtime);
  if (secondChannel === "fetch") await rejectPlaybackFetch(runtime, `${firstChannel}->${secondChannel}`);
  else rejectPlaybackXhr(runtime, `${firstChannel}->${secondChannel}`);
  assertOneNativePlayback(runtime, `${firstChannel}->${secondChannel}`);
}

async function runAcceptedStopCase(stopKind) {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  await fetchMasterAndMedia(runtime);
  await prepareSession(runtime);
  if (stopKind === "pagehide") runtime.pagehide();
  else runtime.fire75Seconds();
  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    `${stopKind}: generateRequest is rejected after an accepted master`,
  );
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    `${stopKind}: native generateRequest is not reached after an accepted master`);
}

async function rejectInitialSdk(runtime, label) {
  publishSdkInput(runtime);
  await assert.rejects(
    runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)"),
    (error) => error?.name === "AbortError",
    label,
  );
  assert.equal(runtime.sdkCalls.length, 0, `${label}: native SDK create is never reached`);
}

async function rejectEarlyEme(runtime, label) {
  await assert.rejects(
    runtime.run(`(async () => {
      globalThis.earlyEmeInput = [{initDataTypes: ["cenc"], sessionTypes: ["temporary"]}];
      return navigator.requestMediaKeySystemAccess(
        "com.microsoft.playready.recommendation.3000", earlyEmeInput, {marker: "early-eme"},
      );
    })()`),
    (error) => error?.name === "AbortError",
    label,
  );
  assert.equal(runtime.nativeEmeCalls.length, 0, `${label}: native EME is never reached`);
}

async function rejectEmeWithoutNativeIncrement(runtime, label) {
  const before = runtime.nativeEmeCalls.length;
  await assert.rejects(
    runtime.run(`(async () => {
      globalThis.afterProbeEmeInput = [{initDataTypes: ["cenc"], sessionTypes: ["temporary"]}];
      return navigator.requestMediaKeySystemAccess(
        "com.microsoft.playready.recommendation.3000", afterProbeEmeInput, {marker: "after-probe-eme"},
      );
    })()`),
    (error) => error?.name === "AbortError",
    label,
  );
  assert.equal(runtime.nativeEmeCalls.length, before, `${label}: no additional native EME call is allowed`);
}

async function runEarlySdkGateCases() {
  const postRuntime = createRuntime();
  await rejectPlaybackFetch(postRuntime, "SDK前");
  assert.equal(postRuntime.nativeFetchCalls.filter(({method}) => method === "POST").length, 0,
    "SDK前 playback POST never reaches native fetch");

  const emeRuntime = createRuntime();
  await rejectEarlyEme(emeRuntime, "SDK前 EME");
}

async function runProbePreSdkGenerateCase(mode) {
  const runtime = createRuntime({mode});
  runtime.run(`globalThis.earlyProbeSession = new MediaKeySession("temporary");
    globalThis.earlyProbeInitData = new Uint8Array([7, 8, 9]);`);
  await assert.rejects(
    runtime.run("earlyProbeSession.generateRequest('cenc', earlyProbeInitData)"),
    (error) => error?.name === "AbortError",
    "probe SDK前の直接MediaKeySession.generateRequestは拒否される",
  );
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    "probe SDK前の直接generateRequestはnativeへ到達しない");

  runtime.publishSdk();
  runtime.run(`globalThis.sdkInput = ${JSON.stringify(makeSdkOptions())};
    globalThis.sdkMarker = {marker: "probe-early-sdk"};`);
  await assert.rejects(
    runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)"),
    (error) => error?.name === "AbortError",
    "probe SDK前generateRequest後のSDK作成は中止される",
  );
  assert.equal(runtime.sdkCalls.length, 0,
    "probe SDK前generateRequest後はnative SDK createへ到達しない");
  assert.equal(runtime.nativePlaybackSessionCalls.length, 0,
    "probe SDK前generateRequest後はPlaybackSession constructorへ到達しない");
}

async function runCapturedEarlyFetchCase() {
  const runtime = createRuntime();
  const capturedEarlyFetch = captureCurrentFetch(runtime);
  await publishAndCreate(runtime);
  await rejectCapturedFetch(runtime, capturedEarlyFetch, PLAYBACK_URL,
    "captured early fetch cannot issue a POST after SDK start");
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 0,
    "captured early fetch after SDK start never reaches native POST");
}

async function runOuterFetchDelegationCase() {
  const runtime = createRuntime({outerFetch: true});
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  await fetchMasterAndMedia(runtime);
  await prepareSession(runtime);
  await assertAcceptedGenerateAndCleanup(runtime);
  assert.equal(runtime.sdkCalls.length, 1);
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 1,
    "delegating page outer fetch produces one native playback POST");
  assert.equal(runtime.nativeFetchCalls.filter(({method, url}) => method === "GET" && url === MASTER_URL).length, 1,
    "delegating page outer fetch produces one native master GET");
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 1);
  const outerPosts = runtime.outerFetchCalls.filter(({input, init}) => requestMethod(input, init) === "POST");
  assert.equal(outerPosts.length, 1, "generic observer does not double-count the delegated POST");
}

async function runNonDelegatingOuterMasterCase() {
  const runtime = createRuntime({outerFetch: true, outerFetchMode: "manifest-nondelegating"});
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  const response = await runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`);
  const selected = await response.text();
  assert.equal(countVariants(selected), 1, "final master filter still selects one variant from a non-delegating outer fetch");
  assert.match(selected, /BANDWIDTH=5800000/);
  assert.doesNotMatch(selected, /BANDWIDTH=3200000/);
  assert.equal(runtime.nativeFetchCalls.filter(({method, url}) => method === "GET" && url === MASTER_URL).length, 0,
    "non-delegating outer fetch does not issue a duplicate native master GET");
  await prepareSession(runtime);
  await assertAcceptedGenerateAndCleanup(runtime);
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 1);
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 1);
}

async function runAsyncOuterRequestCase() {
  const runtime = createRuntime();
  runtime.run(`
    const early = globalThis.fetch;
    globalThis.fetch = async function pageAsyncFetch(...args) {
      await Promise.resolve();
      return Reflect.apply(early, this, args);
    };
  `);
  await publishAndCreate(runtime);
  await runtime.run(`fetch(new Request(${JSON.stringify(PLAYBACK_URL)}, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: ${JSON.stringify(makePlaybackBody())}
  }))`);
  assertOneNativePlayback(runtime, "async page wrapper with Request input");
  const forwarded = runtime.nativeFetchCalls.find(({method}) => method === "POST");
  assert.equal(forwarded.input.url, PLAYBACK_SCENARIO_URL);
  assert.deepEqual(JSON.parse(await forwarded.input.clone().text()), {
    playback: {attributes: {resolution: {max: ["1920x1080"]}}},
  });
  await fetchMasterAndMedia(runtime);
  await prepareSession(runtime);
  await assertAcceptedGenerateAndCleanup(runtime);
}

async function runCloningAndDuplicateOuterPostCases() {
  const unconfirmed = createRuntime();
  unconfirmed.run(`globalThis.fetch = async function nonDelegatingPost() {
    return new Response('{}', {status: 200, headers: {'content-type':'application/json'}});
  };`);
  await publishAndCreate(unconfirmed);
  await rejectPlaybackFetch(unconfirmed, "unconfirmed early-gate dispatch rejects the returned response");
  await rejectEarlyEme(unconfirmed, "EME after unconfirmed dispatch");
  assert.equal(unconfirmed.nativeFetchCalls.length, 0);

  const cloning = createRuntime();
  cloning.run(`
    const early = globalThis.fetch;
    globalThis.fetch = function cloningPageFetch(input, init) {
      return Reflect.apply(early, this, [input, init ? {...init} : init]);
    };
  `);
  await publishAndCreate(cloning);
  await rejectPlaybackFetch(cloning, "page wrapper cloning the dispatch identity");
  assert.equal(cloning.nativeFetchCalls.filter(({method}) => method === "POST").length, 0);

  const duplicate = createRuntime();
  duplicate.run(`
    const early = globalThis.fetch;
    globalThis.fetch = async function retryingPageFetch(...args) {
      await Reflect.apply(early, this, args);
      return Reflect.apply(early, this, args);
    };
  `);
  await publishAndCreate(duplicate);
  await rejectPlaybackFetch(duplicate, "page wrapper repeating the same dispatch");
  assertOneNativePlayback(duplicate, "page wrapper cannot consume dispatch permit twice");
}

async function runEarlyReplacementCases() {
  const requestRuntime = createRuntime();
  requestRuntime.run(`
    globalThis.savedEarlyRequest = globalThis.Request;
    globalThis.Request = class EarlyReplacedRequest extends savedEarlyRequest {};
  `);
  await rejectInitialSdk(requestRuntime, "SDK前 Request constructor replacement");

  const xhrRuntime = createRuntime();
  xhrRuntime.run(`
    globalThis.savedEarlyXhr = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = class EarlyReplacedXMLHttpRequest extends savedEarlyXhr {};
  `);
  await rejectInitialSdk(xhrRuntime, "SDK前 XMLHttpRequest constructor replacement");

  const emeRuntime = createRuntime();
  emeRuntime.run(`
    globalThis.savedEarlyGenerate = Object.getOwnPropertyDescriptor(
      globalThis.MediaKeySession.prototype, "generateRequest",
    ).value;
    Object.defineProperty(globalThis.MediaKeySession.prototype, "generateRequest", {
      configurable: true,
      writable: true,
      value: function earlyReplacedGenerateRequest(...args) {
        return Reflect.apply(savedEarlyGenerate, this, args);
      },
    });
  `);
  await rejectInitialSdk(emeRuntime, "SDK前 MediaKeySession.generateRequest replacement");
}

async function runInvalidFetchPropertyCases() {
  for (const [property, label] of [["noncallable", "non-callable fetch"], ["immutable", "immutable fetch property"]]) {
    const runtime = createRuntime({fetchProperty: property});
    await rejectInitialSdk(runtime, label);
  }
}

async function runPostStartIdentityRetryCase(kind) {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  if (kind === "master") await sendPlayback(runtime);
  const captured = captureCurrentFetch(runtime);
  setForwardingFetch(runtime, captured);
  if (kind === "post") {
    await rejectCapturedFetch(runtime, captured, PLAYBACK_URL, "post-start fetch identity mismatch");
    assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 0);
  } else if (kind === "master") {
    await rejectCapturedFetch(runtime, captured, MASTER_URL, "post-start master identity mismatch");
    assert.equal(runtime.nativeFetchCalls.filter(({method, url}) => method === "GET" && url === MASTER_URL).length, 0);
  } else if (kind === "eme") {
    await rejectEarlyEme(runtime, "post-start EME identity mismatch");
  } else {
    throw new Error(`unknown post-start retry kind: ${kind}`);
  }
}

async function runNonDelegatingReplacementGuardCase() {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  const captured = captureCurrentFetch(runtime);
  setNonDelegatingFetch(runtime);
  await rejectCapturedFetch(runtime, captured, MASTER_URL,
    "non-delegating replacement fetch is stopped by the final outer guard");
  assert.equal(runtime.nativeFetchCalls.filter(({method, url}) => method === "GET" && url === MASTER_URL).length, 0,
    "non-delegating replacement cannot bypass the master filter to native fetch");
}

async function runUnacceptedCase(kind) {
  const runtime = createRuntime({master: kind === "rejected" ? REJECTED_MASTER : MASTER_PLAYLIST});
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  await prepareSession(runtime);
  if (kind === "rejected") {
    await assert.rejects(runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`), (error) => error?.name === "AbortError");
  } else if (kind === "retired") {
    runtime.pagehide();
  } else if (kind === "timeout") {
    runtime.fire75Seconds();
  }
  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    `${kind}: generateRequest is blocked before an accepted master`,
  );
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    `${kind}: native generateRequest is never called`);
  return runtime;
}

async function publishNormalAndCreate(runtime) {
  runtime.publishSdk();
  const options = makeSdkOptions();
  runtime.run(`globalThis.sdkInput = ${JSON.stringify(options)}; globalThis.sdkMarker = {marker: "sdk"};`);
  const result = runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  assert.equal(result, runtime.sdkPromise);
  await result;
  assert.equal(runtime.sdkCalls.length, 1);
  assert.equal(runtime.sdkCalls[0].args[0], runtime.context.sdkInput);
  assert.equal(runtime.sdkCalls[0].args[1], runtime.context.sdkMarker);
  await runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  assert.equal(runtime.sdkCalls.length, 2, "normal mode permits a second native SDK create");
}

async function runSingleSdkDoubleCreateGuard() {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  const second = runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  await assert.rejects(second, (error) => error?.name === "AbortError", "second SDK create is blocked");
  assert.equal(runtime.sdkCalls.length, 1, "a second SDK create never reaches the native stub");
}

async function runReplacementGuardCase(kind) {
  const runtime = createRuntime();
  await publishAndCreate(runtime);
  // Keep a valid session ready so the generateRequest assertion measures the
  // replacement guard after one native SDK start, not an earlier EME setup failure.
  await prepareSession(runtime);
  runtime.run(`
    globalThis.savedSingleFetch = globalThis.fetch;
    globalThis.savedSingleXhr = globalThis.XMLHttpRequest;
    globalThis.savedSingleGenerate = Object.getOwnPropertyDescriptor(
      globalThis.MediaKeySession.prototype, "generateRequest",
    ).value;
  `);
  if (kind === "fetch") {
    runtime.run(`globalThis.fetch = function replacedFetch(...args) {
      return Reflect.apply(savedSingleFetch, this, args);
    };`);
  } else if (kind === "constructor") {
    runtime.run(`globalThis.XMLHttpRequest = class ReplacedXMLHttpRequest extends savedSingleXhr {};`);
  } else if (kind === "generateRequest") {
    runtime.run(`Object.defineProperty(globalThis.MediaKeySession.prototype, "generateRequest", {
      configurable: true,
      writable: true,
      value: function replacedGenerateRequest(...args) {
        return Reflect.apply(savedSingleGenerate, this, args);
      },
    });`);
  } else {
    throw new Error(`unknown replacement kind: ${kind}`);
  }

  const secondCreate = runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  await assert.rejects(
    secondCreate,
    (error) => error?.name === "AbortError",
    `${kind}: additional SDK create is rejected after a runtime replacement`,
  );
  assert.equal(runtime.sdkCalls.length, 1, `${kind}: the first native SDK create remains the only one`);

  if (kind === "constructor") rejectPlaybackXhr(runtime, `${kind} replacement`);
  else await rejectPlaybackFetch(runtime, `${kind} replacement`);
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === "POST").length, 0,
    `${kind}: rejected playback POST never reaches native fetch`);
  assert.equal(runtime.nativeXhrCalls.filter(({method}) => method === "POST").length, 0,
    `${kind}: rejected playback POST never reaches native XHR`);

  await assert.rejects(
    runtime.run("emESession.generateRequest('cenc', testInitData)"),
    (error) => error?.name === "AbortError",
    `${kind}: native generateRequest is rejected after a runtime replacement`,
  );
  assert.equal(runtime.nativeSessionMethodCalls.filter(({method}) => method === "generateRequest").length, 0,
    `${kind}: native generateRequest is never reached`);
}

async function runNormalMode() {
  const runtime = createRuntime({mode: "original"});
  // The normal-mode service is not wrapped, so the helper must forward the
  // same object and permit an ordinary second call.
  await publishNormalAndCreate(runtime);

  const body = JSON.stringify({playback: {attributes: {resolution: {max: ["1280x720"]}}}});
  await runtime.run(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method: "POST", body: ${JSON.stringify(body)}})`);
  const playback = runtime.nativeFetchCalls.at(-1);
  assert.equal(playback.url, PLAYBACK_URL, "normal mode keeps the original playback URL");
  assert.equal(playback.body, body, "normal mode keeps the original playback body");
  const response = await runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`);
  assert.equal(await response.text(), MASTER_PLAYLIST, "normal mode does not rewrite a master playlist");

  await prepareSession(runtime, {singleVariant: false});
  assert.equal(runtime.nativeEmeCalls[0].args[1], runtime.context.emEInput, "normal mode forwards the original EME config");
  assert.equal(runtime.context.emEInput[0].distinctiveIdentifier, "required");
  return runtime;
}

// Check the public planner shape in a separate no-runtime realm as well as the
// observable network/EME runtime. This keeps the normal-mode comparison explicit.
const planRealm = vm.createContext({URL, DOMException, console, __DP4K_TEST__: true});
vm.runInContext(source, planRealm);
const modePlan = JSON.parse(vm.runInContext(`JSON.stringify(__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(MODE)}])`, planRealm));
assert.deepEqual(modePlan, {
  label: "1080p SDR・HEVC/AACを1候補に固定（75秒比較）",
  scenario: "tv-drm-ctr-h265-atmos",
  resolution: "1920x1080",
  sdkMaxHeight: 1080,
  sdkRecommendationFlow: true,
  singleFhdVariant: true,
});
const probePlan = JSON.parse(vm.runInContext(`JSON.stringify(__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(PROBE_MODE)}])`, planRealm));
assert.deepEqual(probePlan, {
  label: "4K SDR候補の診断のみ（復号しない）",
  scenario: "tv-drm-ctr-h265-atmos",
  resolution: "3840x2160",
  sdkMaxHeight: 2160,
  sdkRecommendationFlow: true,
  sdkUhdPolicy: true,
  singleSdrProbe: true,
}, "the UHD SDR manifest-probe mode keeps the 2160 SDK policy and probe-only contract");
const hdr10ProbePlan = JSON.parse(vm.runInContext(`JSON.stringify(__DP4K_INTERNALS__.MODE_PLANS[${JSON.stringify(HDR10_PROBE_MODE)}])`, planRealm));
assert.deepEqual(hdr10ProbePlan, {
  label: "HDR10一覧の4K SDR候補だけ診断（復号しない）",
  scenario: "tv-drm-ctr-h265-hdr10-atmos",
  resolution: "3840x2160",
  sdkMaxHeight: 2160,
  sdkRecommendationFlow: true,
  sdkUhdPolicy: true,
  singleSdrProbe: true,
}, "the HDR10 UHD SDR manifest-probe mode keeps the 2160 SDK policy and probe-only contract");
const originalPlan = JSON.parse(vm.runInContext("JSON.stringify(__DP4K_INTERNALS__.MODE_PLANS.original)", planRealm));
assert.deepEqual(originalPlan, {label: "無変更", scenario: null, resolution: null});

for (const channel of ["fetch", "xhr-text", "xhr-arraybuffer"]) {
  await runAcceptedChannel(channel);
}
for (const kind of ["unconfirmed", "rejected", "retired", "timeout"]) {
  await runUnacceptedCase(kind);
}
await runSecondMasterAfterAccepted();
for (const [first, second] of [["fetch", "xhr"], ["xhr", "fetch"]]) {
  await runSecondPlaybackCase(first, second);
}
for (const stopKind of ["pagehide", "timeout"]) {
  await runAcceptedStopCase(stopKind);
}
await runSingleSdkDoubleCreateGuard();
for (const replacement of ["fetch", "constructor", "generateRequest"]) {
  await runReplacementGuardCase(replacement);
}
await runEarlySdkGateCases();
await runCapturedEarlyFetchCase();
await runOuterFetchDelegationCase();
await runNonDelegatingOuterMasterCase();
await runAsyncOuterRequestCase();
await runCloningAndDuplicateOuterPostCases();
await runEarlyReplacementCases();
await runInvalidFetchPropertyCases();
for (const retry of ["post", "master", "eme"]) {
  await runPostStartIdentityRetryCase(retry);
}
await runNonDelegatingReplacementGuardCase();
for (const mode of PROBE_MODES) {
  await runProbePreSdkGenerateCase(mode);
  for (const channel of ["fetch", "xhr-text", "xhr-arraybuffer"]) {
    for (const [master, label] of [
      [MASTER_PLAYLIST, "FHD-only master"],
      [UHD_SDR_MASTER, "UHD SDR master"],
      [UHD_HDR_MASTER, "UHD HDR master"],
      [INVALID_MASTER, "invalid master"],
    ]) {
      await runProbeFixture(mode, channel, master, `${mode} / ${channel} / ${label}`);
    }
    await runProbeMediaFixture(mode, channel);
  }
}
await runNormalMode();

// Normal full-HD keeps the same strict SDR selector but removes experiment
// duration/request counters. This is mocked continuity, not real CDM playback.
{
  const runtime = createRuntime({mode: 'fullhd'});
  const control = runtime.context.__DisneyPlusEdgeEnhancedToolbar;
  assert.equal(control.getState().mode, 'fullhd');
  assert.equal(control.getState().debugVisible, false, 'normal startup never mounts a diagnostics panel');
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  await fetchMasterAndMedia(runtime);
  await prepareSession(runtime);
  assert.equal([...runtime.timers.values()].some(({delay}) => delay === 75000 || delay === 30000), false,
    'normal full-HD has no experiment duration timer');
  let pauses = 0;
  runtime.context.document.querySelectorAll = () => [{pause: () => pauses++}];
  runtime.run(`globalThis.Date = class extends Date { static now() { return ${Date.now()} + 7200000; } };`);
  for (let cycle = 0; cycle < 3; cycle++) {
    const generate = runtime.run("emESession.generateRequest('cenc', testInitData)");
    assert.equal(generate, runtime.generatePromise, 'subsequent native key requests remain intact');
    await generate;
    const update = runtime.run('emESession.update(testLicense)');
    assert.equal(update, runtime.updatePromise);
    await update;
    const repeatedMaster = await runtime.run(`fetch(${JSON.stringify(MASTER_URL)})`);
    assert.equal(countVariants(await repeatedMaster.text()), 1, 'repeated masters retain strict FHD selection');
  }
  const secondSdk = runtime.run("new globalThis['playback-service'].PlaybackService().createPlaybackSession(sdkInput, sdkMarker)");
  assert.equal(secondSdk, runtime.sdkPromise, 'site-created subsequent sessions are not stopped by a one-shot limit');
  await secondSdk;
  await runtime.run(`fetch(${JSON.stringify(PLAYBACK_URL)}, {method:'POST', body:${JSON.stringify(makePlaybackBody())}})`);
  assert.equal(runtime.nativeFetchCalls.filter(({method}) => method === 'POST').length, 2);
  assert.equal(runtime.sdkCalls.length, 2);
  assert.equal(pauses, 0, 'no helper pause after mock time advancement, key updates or repeated requests');
  assert.equal(control.getState().failed, false);
  const nativeFailure = new DOMException('Mock license failure', 'NotSupportedError');
  runtime.updatePromise = Promise.reject(nativeFailure);
  await assert.rejects(runtime.run('emESession.update(testLicense)'), (error) => error === nativeFailure);
  await Promise.resolve();
  assert.ok(pauses > 0, 'real native errors still stop normal full-HD');
  assert.equal(runtime.context.localStorage.getItem('ioridev.disneyplus4k.mode.v1'), 'original', 'errors disarm the next load');
  await assert.rejects(runtime.run("emESession.generateRequest('cenc', testInitData)"), (error) => error.name === 'AbortError');
}

{
  const runtime = createRuntime({mode: 'fullhd'});
  await publishAndCreate(runtime);
  await sendPlayback(runtime);
  await fetchMasterAndMedia(runtime);
  await prepareSession(runtime);
  runtime.pagehide();
  assert.equal(runtime.context.localStorage.getItem('ioridev.disneyplus4k.mode.v1'), 'fullhd',
    'ordinary navigation preserves the full-HD preference');
  runtime.callbacks.get('pageshow').callback({persisted: true});
  assert.equal(runtime.reloads, 1, 'BFCache restore reloads the retired full-HD document');
  await assert.rejects(runtime.run("emESession.generateRequest('cenc', testInitData)"), (error) => error.name === 'AbortError');
}

console.log('Normal full-HD: no duration cap, repeated SDK/POST/master and native key updates, fatal error disarm, page retirement and BFCache passed (mock only).');
console.log("single-variant runtime: normal-mode identity, v0.4.0 FHD 1080 and HEVC/HDR10 UHD SDR probe 2160 SDK config/recommendation, PlaybackSession UHD policy, one POST/SDK cap, fetch/XHR text+arraybuffer probe rejection, native EME/session arguments, and fail-closed generateRequest gates passed");
