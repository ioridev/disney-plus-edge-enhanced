import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import { createSingleVariantNetworkAdapter, MAX_MANIFEST_BYTES } from "../src/single-variant-network.mjs";

const manifestUrl = "https://cdn.example.test/master.m3u8?sig=secret";
const mediaUrl = "https://cdn.example.test/video.m3u8?sig=secret";
const parser = (text) => {
  if (text.includes("#EXT-X-TARGETDURATION")) return { kind: "media" };
  if (!text.startsWith("#EXTM3U")) return { kind: "reject" };
  if (text.includes("REJECT")) return { kind: "reject" };
  if (!text.includes("TARGET-ONE")) return { kind: "master", changed: false };
  return { kind: "master", changed: true, text: "#EXTM3U\n#TARGET-ONE\n" };
};

function responseFromBytes(bytes, init = {}) {
  const headers = {
    "content-type": "application/vnd.apple.mpegurl",
    "content-length": String(bytes.byteLength),
    "content-encoding": "gzip",
    etag: '"stale"',
    digest: "sha-256=stale",
    "repr-digest": "sha-256=stale",
    "x-keep": "yes",
    ...(init.headers || {}),
  };
  const { headers: _ignored, ...rest } = init;
  return new Response(bytes, {
    status: 200,
    statusText: "OK",
    ...rest,
    headers,
  });
}

function streamResponse(text, init = {}) {
  return responseFromBytes(new TextEncoder().encode(text), init);
}

function makeAdapter(overrides = {}) {
  const decisions = [];
  const failures = [];
  let active = true;
  let retired = false;
  const adapter = createSingleVariantNetworkAdapter({
    parser,
    enabled: () => active,
    retired: () => retired,
    isManifestUrl: (url) => String(url).split("?")[0].endsWith(".m3u8"),
    onDecision: (value) => decisions.push(value),
    onFailure: (value) => failures.push(value),
    ...overrides,
  });
  return { adapter, decisions, failures, setActive: (value) => { active = value; }, setRetired: (value) => { retired = value; } };
}

// Disabled/normal mode is strict identity and does not even invoke URL parsing.
{
  let urlCalls = 0;
  const native = async () => streamResponse("#EXTM3U\nTARGET-ONE\n");
  const instance = makeAdapter({
    enabled: () => false,
    isManifestUrl: () => { urlCalls += 1; throw new Error("must not inspect"); },
  });
  const wrapped = instance.adapter.wrapFetch(native);
  assert.equal(wrapped, native);
  const response = await wrapped(manifestUrl);
  assert.equal(urlCalls, 0);
  assert.equal(await response.text(), "#EXTM3U\nTARGET-ONE\n");
  class NormalXHR {}
  assert.equal(instance.adapter.wrapXMLHttpRequest(NormalXHR), NormalXHR);
}

// Fetch rewrites only a successful target master and preserves Response actual-slot behavior.
{
  const instance = makeAdapter();
  let nativeCalls = 0;
  const native = async () => {
    nativeCalls += 1;
    return streamResponse("#EXTM3U\nTARGET-ONE\n", { headers: { "x-keep": "yes" } });
  };
  const wrapped = instance.adapter.wrapFetch(native);
  const response = await wrapped(manifestUrl);
  assert.equal(nativeCalls, 1);
  assert.equal(response.url, "");
  assert.equal(response.type, "default");
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get("x-keep"), "yes");
  for (const header of ["content-length", "content-encoding", "etag", "digest", "content-digest", "repr-digest"]) {
    assert.equal(response.headers.has(header), false, header);
  }
  const clone = response.clone();
  assert.equal(await response.text(), "#EXTM3U\n#TARGET-ONE\n");
  assert.equal(await clone.text(), "#EXTM3U\n#TARGET-ONE\n");
  assert.equal(clone.type, "default");
  assert.deepEqual(instance.decisions, [{ kind: "master-rewritten", channel: "fetch", bytes: 19 }]);
  assert.deepEqual(instance.failures, []);
}

// Response contract fields are copied from the source response and clone remains a real Response.
{
  const instance = makeAdapter();
  const source = streamResponse("#EXTM3U\nTARGET-ONE\n");
  Object.defineProperty(source, "url", { configurable: true, value: manifestUrl });
  Object.defineProperty(source, "type", { configurable: true, value: "cors" });
  Object.defineProperty(source, "redirected", { configurable: true, value: true });
  const response = await instance.adapter.wrapFetch(async () => source)(manifestUrl);
  assert.equal(response.url, manifestUrl);
  assert.equal(response.type, "cors");
  assert.equal(response.redirected, true);
  const clone = response.clone();
  assert.equal(clone.url, manifestUrl);
  assert.equal(clone.type, "cors");
  assert.equal(clone.redirected, true);
  const other = streamResponse("#EXTM3U\n#OTHER\n");
  Object.defineProperty(other, "url", { configurable: true, value: "https://other.example.test/master.m3u8" });
  const receiverClone = response.clone.call(other);
  assert.equal(await receiverClone.text(), "#EXTM3U\n#OTHER\n");
  assert.equal(receiverClone.url, "https://other.example.test/master.m3u8");
}

// Media playlists remain the original response, including body identity and headers.
{
  const instance = makeAdapter();
  let source;
  const native = async () => {
    source = streamResponse("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.m4s\n");
    return source;
  };
  const response = await instance.adapter.wrapFetch(native)(mediaUrl);
  assert.equal(response, source);
  assert.equal(response.headers.get("content-length"), String(new TextEncoder().encode(await response.clone().text()).byteLength));
  assert.equal(instance.decisions[0].kind, "media-playlist");
  assert.deepEqual(instance.failures, []);
}

// Master parser rejection is a controlled AbortError, never an unmodified fallback.
{
  const instance = makeAdapter();
  await assert.rejects(
    instance.adapter.wrapFetch(async () => streamResponse("#EXTM3U\nREJECT\n"))(manifestUrl),
    (error) => error.name === "AbortError" && error.message === "Single-variant network comparison aborted",
  );
  assert.equal(instance.failures[0].kind, "parser-rejected");
  assert.deepEqual(Object.keys(instance.failures[0]).sort(), ["bytes", "channel", "kind"]);
  assert.equal(Object.hasOwn(instance.failures[0], "url"), false);
  assert.equal(Object.hasOwn(instance.failures[0], "body"), false);
}

// UTF-8 fatal handling and the 2 MiB reader limit are bounded; cancellation is not awaited.
{
  const instance = makeAdapter();
  const invalid = new Response(new Uint8Array([0xc3, 0x28]), { status: 200 });
  await assert.rejects(instance.adapter.wrapFetch(async () => invalid)(manifestUrl), (error) => error.name === "AbortError");
  assert.equal(instance.failures.at(-1).kind, "manifest-utf8");

  await assert.rejects(
    instance.adapter.wrapFetch(async () => streamResponse("\uFEFF#EXTM3U\nTARGET-ONE\n"))(manifestUrl),
    (error) => error.name === "AbortError",
  );
  assert.equal(instance.failures.at(-1).kind, "parser-rejected");

  let cancelled = 0;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(MAX_MANIFEST_BYTES + 1));
    },
    cancel() { cancelled += 1; },
  });
  const oversized = {
    status: 200,
    ok: true,
    url: manifestUrl,
    type: "basic",
    redirected: false,
    headers: new Headers(),
    clone: () => ({ body }),
  };
  await assert.rejects(instance.adapter.wrapFetch(async () => oversized)(manifestUrl), (error) => error.name === "AbortError");
  assert.equal(instance.failures.at(-1).kind, "manifest-oversize");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, 1);
}

// Retirement is checked before and after the native fetch, with no URI/body in callbacks.
{
  const instance = makeAdapter();
  let nativeCalls = 0;
  instance.setRetired(true);
  await assert.rejects(instance.adapter.wrapFetch(async () => { nativeCalls += 1; })(manifestUrl), (error) => error.name === "AbortError");
  assert.equal(nativeCalls, 0);
  assert.equal(instance.failures[0].kind, "retired");
}

// Retired state, native failures, and deadline handling are scoped to targeted manifests.
{
  const instance = makeAdapter();
  instance.setRetired(true);
  const rawError = new Error("telemetry-native-failure");
  const native = async () => { throw rawError; };
  await assert.rejects(
    instance.adapter.wrapFetch(native)("https://telemetry.example.test/collect", { signal: "caller-signal" }),
    (error) => error === rawError,
  );
  assert.deepEqual(instance.failures, []);

  const deadlineInstance = makeAdapter({ deadlineMs: 10 });
  let receivedInit;
  const callerInit = { signal: "caller-signal" };
  const pending = () => new Promise(() => {});
  const deadlineNative = (_input, init) => { receivedInit = init; return pending(); };
  await assert.rejects(
    deadlineInstance.adapter.wrapFetch(deadlineNative)(manifestUrl, callerInit),
    (error) => error.name === "AbortError",
  );
  assert.equal(receivedInit, callerInit);
  assert.equal(receivedInit.signal, "caller-signal");
  assert.equal(deadlineInstance.failures.at(-1).kind, "deadline");
}

// A synthetic XHR exposes own getters immediately after open; listeners and readyState are untouched.
{
  class FakeXHR {
    constructor() {
      this.readyState = 0;
      this.status = 0;
      this.responseType = "";
      this.responseURL = "";
      this._responseText = "";
      this._response = "";
      this._headers = "content-type: application/vnd.apple.mpegurl\r\ncontent-length: 20\r\nx-keep: yes\r\n";
      this.events = [];
    }
    open(method, url) { this.method = method; this.requestUrl = url; this.readyState = 1; }
    send() { this.readyState = 4; this.status = 200; this.responseURL = this.requestUrl; }
    addEventListener(...args) { this.events.push(args); }
    get response() { return this._response; }
    get responseText() {
      if (this.responseType !== "" && this.responseType !== "text") {
        throw new DOMException("Invalid state", "InvalidStateError");
      }
      return this._responseText;
    }
    getResponseHeader(name) {
      const found = this._headers.split("\r\n").find((line) => line.toLowerCase().startsWith(`${String(name).toLowerCase()}:`));
      return found ? found.slice(found.indexOf(":") + 1).trim() : null;
    }
    getAllResponseHeaders() { return this._headers; }
  }
  const instance = makeAdapter();
  const XHR = instance.adapter.wrapXMLHttpRequest(FakeXHR);
  const xhr = new XHR();
  xhr.open("GET", manifestUrl);
  assert.equal(Object.hasOwn(xhr, "response"), true);
  assert.equal(Object.hasOwn(xhr, "responseText"), true);
  xhr._responseText = "#EXTM3U\nTARGET-ONE\n";
  xhr._response = xhr._responseText;
  xhr.readyState = 3;
  assert.equal(xhr.responseText, "");
  xhr.send();
  assert.equal(xhr.readyState, 4);
  assert.equal(xhr.responseText, "#EXTM3U\n#TARGET-ONE\n");
  assert.equal(xhr.response, "#EXTM3U\n#TARGET-ONE\n");
  assert.equal(xhr.getResponseHeader("content-length"), null);
  assert.equal(xhr.getResponseHeader("x-keep"), "yes");
  assert.equal(xhr.getAllResponseHeaders().toLowerCase().includes("content-length"), false);
  assert.equal(xhr.getAllResponseHeaders().toLowerCase().includes("x-keep"), true);
  assert.deepEqual(xhr.events, []);
}

// XHR arraybuffer uses fatal UTF-8 and preserves the native responseText exception.
{
  class BinaryXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseType = "arraybuffer"; this.responseURL = ""; this._response = new ArrayBuffer(0); }
    open(_method, url) { this.requestUrl = url; this.readyState = 1; }
    send() { this.readyState = 4; this.status = 200; this.responseURL = this.requestUrl; }
    get response() { return this._response; }
    get responseText() { throw new DOMException("Invalid state", "InvalidStateError"); }
    getResponseHeader() { return ""; }
    getAllResponseHeaders() { return ""; }
  }
  const instance = makeAdapter();
  const XHR = instance.adapter.wrapXMLHttpRequest(BinaryXHR);
  const xhr = new XHR();
  xhr.open("GET", manifestUrl);
  xhr._response = new TextEncoder().encode("#EXTM3U\nTARGET-ONE\n").buffer;
  xhr.readyState = 3;
  assert.equal(xhr.response, null);
  xhr.send();
  assert.deepEqual(Array.from(new Uint8Array(xhr.response)), Array.from(new TextEncoder().encode("#EXTM3U\n#TARGET-ONE\n")));
  assert.throws(() => xhr.responseText, (error) => error.name === "InvalidStateError");
}

// Re-open gives a new generation/cache; a stale transformed value must not leak.
{
  class GenerationXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseType = ""; this.responseURL = ""; this._responseText = ""; }
    open(_method, url) { this.requestUrl = url; this.readyState = 1; this.openRead = this.responseText; }
    send() { this.readyState = 4; this.status = 200; this.responseURL = this.requestUrl; }
    get response() { return this._responseText; }
    get responseText() { return this._responseText; }
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ""; }
  }
  const instance = makeAdapter();
  const XHR = instance.adapter.wrapXMLHttpRequest(GenerationXHR);
  const xhr = new XHR();
  xhr.open("GET", manifestUrl);
  xhr._responseText = "#EXTM3U\nTARGET-ONE\n";
  xhr.send();
  assert.equal(xhr.responseText, "#EXTM3U\n#TARGET-ONE\n");
  xhr._responseText = "#EXTM3U\n#NO-CHANGE\n";
  xhr.open("GET", manifestUrl);
  assert.equal(xhr.openRead, "#EXTM3U\n#NO-CHANGE\n");
  xhr.send();
  assert.equal(xhr.responseText, "#EXTM3U\n#NO-CHANGE\n");
}

// A completed target cache remains readable after its deadline, but retirement still fails closed.
{
  class CachedXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseType = ""; this.responseURL = ""; this._responseText = ""; }
    open(_method, url) { this.requestUrl = url; this.readyState = 1; }
    send() { this.readyState = 4; this.status = 200; this.responseURL = this.requestUrl; }
    get response() { return this._responseText; }
    get responseText() { return this._responseText; }
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ""; }
  }
  let clock = 0;
  const instance = makeAdapter({ deadlineMs: 10, now: () => clock });
  const XHR = instance.adapter.wrapXMLHttpRequest(CachedXHR);
  const xhr = new XHR();
  xhr.open("GET", manifestUrl);
  xhr._responseText = "#EXTM3U\nTARGET-ONE\n";
  xhr.send();
  assert.equal(xhr.responseText, "#EXTM3U\n#TARGET-ONE\n");
  clock = 100;
  assert.equal(xhr.responseText, "#EXTM3U\n#TARGET-ONE\n");
  instance.setRetired(true);
  assert.throws(() => xhr.responseText, (error) => error.name === "AbortError");
  assert.equal(instance.failures.at(-1).kind, "retired");
}

// Non-target XHR open/send/reads remain native even when the adapter is retired.
{
  class NonTargetXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseType = ""; this.responseURL = ""; this._responseText = "telemetry"; }
    open(_method, url) { this.requestUrl = url; this.readyState = 1; }
    send() { this.readyState = 4; this.status = 200; }
    get response() { return this._responseText; }
    get responseText() { return this._responseText; }
    getResponseHeader() { throw new Error("native header failure"); }
    getAllResponseHeaders() { throw new Error("native headers failure"); }
  }
  const instance = makeAdapter();
  instance.setRetired(true);
  const XHR = instance.adapter.wrapXMLHttpRequest(NonTargetXHR);
  const xhr = new XHR();
  xhr.open("GET", "https://telemetry.example.test/collect");
  xhr.send();
  assert.equal(Object.hasOwn(xhr, "response"), false);
  assert.equal(xhr.responseText, "telemetry");
  assert.throws(() => xhr.getResponseHeader("x"), /native header failure/);
  assert.deepEqual(instance.failures, []);
}

// A non-configurable own native property refuses the active XHR adapter before open/send.
{
  class LockedXHR {
    constructor() {
      this.readyState = 0;
      this.status = 0;
      this.responseType = "";
      this.responseURL = "";
      Object.defineProperty(this, "response", { configurable: false, value: "native" });
    }
    open() { throw new Error("native open must not run"); }
    send() { throw new Error("native send must not run"); }
    get response() { return "native"; }
    get responseText() { return "native"; }
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ""; }
  }
  const instance = makeAdapter();
  const XHR = instance.adapter.wrapXMLHttpRequest(LockedXHR);
  assert.throws(() => new XHR().open("GET", manifestUrl), (error) => error.name === "AbortError");
  assert.equal(instance.failures.at(-1).kind, "xhr-descriptor");
}

console.log("single-variant network adapter: identity, bounded fetch/XHR transform, Response/XHR semantics, fail-closed parser, UTF-8, limits, retirement and generation isolation passed");
