const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const ADAPTER_ABORT_MESSAGE = "Single-variant network comparison aborted";

const STALE_RESPONSE_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "etag",
  "digest",
  "content-digest",
  "repr-digest",
]);

const DECISION_KINDS = new Set([
  "media-playlist",
  "master-unchanged",
  "master-rewritten",
]);

const FAILURE_KINDS = new Set([
  "disabled",
  "retired",
  "deadline",
  "response-clone",
  "response-body",
  "stream-read",
  "manifest-oversize",
  "manifest-utf8",
  "parser-threw",
  "parser-rejected",
  "parser-invalid",
  "parser-output-oversize",
  "response-contract",
  "response-construct",
  "native-fetch",
  "xhr-descriptor",
  "xhr-open",
  "xhr-send",
  "xhr-response-type",
]);

const CHANNELS = new Set(["fetch", "xhr"]);

// The injected parser is deliberately small and non-networking:
//   { kind: "media" }
//   { kind: "master", changed: false }
//   { kind: "master", changed: true, text: "..." }
//   { kind: "reject" }
// Only the changed master text is consumed by this adapter; parser text, URIs,
// and exceptions never reach diagnostics callbacks.

function fixedAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException(ADAPTER_ABORT_MESSAGE, "AbortError");
  }
  const error = new Error(ADAPTER_ABORT_MESSAGE);
  error.name = "AbortError";
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fixedInteger(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function safeCallback(callback, payload) {
  try {
    if (typeof callback === "function") callback(payload);
  } catch (_) {
    // Diagnostics must never change the network result.
  }
}

function findDescriptor(object, key) {
  let current = object;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current);
  }
  return null;
}

function ownDescriptorCanBeReplaced(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return true;
  return descriptor.configurable === true;
}

function readResponseContract(response) {
  try {
    return {
      url: String(response.url),
      type: String(response.type),
      redirected: Boolean(response.redirected),
    };
  } catch (_) {
    return null;
  }
}

function removeStaleHeaders(headers) {
  for (const name of STALE_RESPONSE_HEADERS) headers.delete(name);
  return headers;
}

function filterXhrHeaders(raw) {
  if (typeof raw !== "string" || raw.length === 0) return raw;
  const lines = raw.split("\r\n");
  const filtered = lines.filter((line) => {
    const separator = line.indexOf(":");
    if (separator < 0) return true;
    return !STALE_RESPONSE_HEADERS.has(line.slice(0, separator).trim().toLowerCase());
  });
  return filtered.join("\r\n");
}

function toBytes(value, ArrayBufferCtor, Uint8ArrayCtor) {
  if (value instanceof Uint8ArrayCtor) return value;
  if (ArrayBufferCtor && value instanceof ArrayBufferCtor) return new Uint8ArrayCtor(value);
  if (ArrayBufferCtor && ArrayBufferCtor.isView && ArrayBufferCtor.isView(value)) {
    return new Uint8ArrayCtor(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function getResponseHeaders(HeadersCtor, response) {
  try {
    const headers = new HeadersCtor(response.headers);
    return removeStaleHeaders(headers);
  } catch (_) {
    return null;
  }
}

function defineDataProperty(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    configurable: true,
    enumerable: false,
    writable: false,
  });
}

function installResponseContract(response, contract, HeadersCtor) {
  try {
    defineDataProperty(response, "url", contract.url);
    defineDataProperty(response, "type", contract.type);
    defineDataProperty(response, "redirected", contract.redirected);

    const nativeClone = response.clone;
    if (typeof nativeClone !== "function") return false;
    Object.defineProperty(response, "clone", {
      configurable: true,
      enumerable: false,
      writable: false,
      value() {
        const receiver = this;
        const clone = Reflect.apply(nativeClone, receiver, []);
        const receiverContract = readResponseContract(receiver) || contract;
        if (!installResponseContract(clone, receiverContract, HeadersCtor)) {
          throw fixedAbortError();
        }
        return clone;
      },
    });
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeParserResult(result) {
  if (!isRecord(result) || typeof result.kind !== "string") return null;
  if (result.kind === "media") return { kind: "media" };
  if (result.kind === "master" && typeof result.changed === "boolean") {
    if (result.changed && typeof result.text !== "string") return null;
    return {
      kind: "master",
      changed: result.changed,
      text: result.changed ? result.text : null,
    };
  }
  if (result.kind === "reject") return { kind: "reject" };
  return null;
}

export { MAX_MANIFEST_BYTES };

export function createSingleVariantNetworkAdapter({
  parser,
  enabled = () => false,
  retired = () => false,
  onDecision = () => {},
  onFailure = () => {},
  isManifestUrl,
  ResponseCtor = globalThis.Response,
  HeadersCtor = globalThis.Headers,
  TextDecoderCtor = globalThis.TextDecoder,
  TextEncoderCtor = globalThis.TextEncoder,
  ArrayBufferCtor = globalThis.ArrayBuffer,
  Uint8ArrayCtor = globalThis.Uint8Array,
  now = () => Date.now(),
  deadlineMs = 10000,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  if (typeof parser !== "function") throw new TypeError("parser must be a function");
  if (typeof isManifestUrl !== "function") throw new TypeError("isManifestUrl must be a function");
  if (typeof ResponseCtor !== "function" || typeof HeadersCtor !== "function") {
    throw new TypeError("Response and Headers constructors are required");
  }
  if (typeof TextDecoderCtor !== "function" || typeof TextEncoderCtor !== "function") {
    throw new TypeError("UTF-8 codec constructors are required");
  }
  if (typeof Uint8ArrayCtor !== "function") throw new TypeError("Uint8Array constructor is required");

  function isEnabled() {
    try { return Boolean(enabled()); } catch (_) { return false; }
  }

  function isRetired() {
    try { return Boolean(retired()); } catch (_) { return true; }
  }

  function timestamp() {
    try {
      const value = Number(now());
      return Number.isFinite(value) ? value : NaN;
    } catch (_) {
      return NaN;
    }
  }

  function makeDeadline() {
    const start = timestamp();
    if (!Number.isFinite(start)) return NaN;
    return Number.isFinite(deadlineMs) && deadlineMs >= 0 ? start + deadlineMs : Infinity;
  }

  function notifyDecision(kind, channel, bytes) {
    if (!DECISION_KINDS.has(kind) || !CHANNELS.has(channel)) return;
    safeCallback(onDecision, Object.freeze({
      kind,
      channel,
      bytes: fixedInteger(bytes),
    }));
  }

  function notifyFailure(kind, channel, bytes = 0) {
    if (!FAILURE_KINDS.has(kind) || !CHANNELS.has(channel)) return;
    const payload = {
      kind,
      channel,
      bytes: fixedInteger(bytes),
    };
    if (kind === "manifest-oversize" || kind === "parser-output-oversize") {
      payload.limitBytes = MAX_MANIFEST_BYTES;
    }
    safeCallback(onFailure, Object.freeze(payload));
  }

  function abort(kind, channel, bytes = 0) {
    notifyFailure(kind, channel, bytes);
    throw fixedAbortError();
  }

  function assertActive(deadlineAt, channel, bytes = 0) {
    if (!isEnabled()) return false;
    if (isRetired()) abort("retired", channel, bytes);
    const current = timestamp();
    if (!Number.isFinite(current) || current > deadlineAt) abort("deadline", channel, bytes);
    return true;
  }

  function targetUrl(input) {
    try {
      if (typeof input === "string") return input;
      if (input && typeof input.url === "string") return input.url;
    } catch (_) {
      return null;
    }
    return null;
  }

  function isManifestRequestUrl(inputUrl) {
    if (!inputUrl) return false;
    try { return Boolean(isManifestUrl(inputUrl)); }
    catch (_) { return false; }
  }

  function successfulResponse(response) {
    try {
      const status = Number(response.status);
      return Number.isInteger(status) && status >= 200 && status <= 299 && response.ok !== false;
    } catch (_) {
      return false;
    }
  }

  function cancelNonBlocking(reader) {
    try {
      const result = reader?.cancel?.();
      if (result && typeof result.catch === "function") void result.catch(() => {});
    } catch (_) {
      // Cancellation is best effort and must not delay failure reporting.
    }
  }

  function timeoutPromise(deadlineAt, channel, bytes) {
    if (!Number.isFinite(deadlineAt) || typeof setTimeoutFn !== "function") return null;
    const remaining = deadlineAt - timestamp();
    if (!Number.isFinite(remaining) || remaining <= 0) abort("deadline", channel, bytes);
    let timer;
    const promise = new Promise((_, reject) => {
      timer = setTimeoutFn(() => reject({ __singleVariantDeadline: true }), remaining);
    });
    return { promise, clear: () => {
      try { if (typeof clearTimeoutFn === "function") clearTimeoutFn(timer); } catch (_) { /* noop */ }
    } };
  }

  async function readUtf8Stream(response, deadlineAt, channel) {
    let reader;
    try { reader = response?.body?.getReader?.(); } catch (_) { reader = null; }
    if (!reader || typeof reader.read !== "function") abort("response-body", channel);

    const decoder = new TextDecoderCtor("utf-8", { fatal: true, ignoreBOM: true });
    const parts = [];
    let bytes = 0;
    try {
      for (;;) {
        if (isEnabled()) assertActive(deadlineAt, channel, bytes);
        const timeout = timeoutPromise(deadlineAt, channel, bytes);
        let step;
        try {
          step = timeout
            ? await Promise.race([reader.read(), timeout.promise])
            : await reader.read();
        } catch (error) {
          if (timeout && error && error.__singleVariantDeadline) {
            cancelNonBlocking(reader);
            abort("deadline", channel, bytes);
          }
          cancelNonBlocking(reader);
          abort("stream-read", channel, bytes);
        } finally {
          timeout?.clear();
        }
        if (!step || typeof step !== "object") abort("stream-read", channel, bytes);
        if (step.done) break;
        const chunk = toBytes(step.value, ArrayBufferCtor, Uint8ArrayCtor);
        if (!chunk) abort("stream-read", channel, bytes);
        bytes += chunk.byteLength;
        if (bytes > MAX_MANIFEST_BYTES) {
          cancelNonBlocking(reader);
          abort("manifest-oversize", channel, bytes);
        }
        try { parts.push(decoder.decode(chunk, { stream: true })); }
        catch (_) { cancelNonBlocking(reader); abort("manifest-utf8", channel, bytes); }
        if (isEnabled()) assertActive(deadlineAt, channel, bytes);
      }
      try { parts.push(decoder.decode()); }
      catch (_) { abort("manifest-utf8", channel, bytes); }
      return { text: parts.join(""), bytes };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      cancelNonBlocking(reader);
      abort("stream-read", channel, bytes);
    }
  }

  function encodedText(text, channel, kind = "manifest") {
    let bytes;
    try { bytes = new TextEncoderCtor().encode(text); }
    catch (_) { abort(kind === "parser-output" ? "parser-invalid" : "manifest-utf8", channel); }
    if (bytes.byteLength > MAX_MANIFEST_BYTES) {
      abort(kind === "parser-output" ? "parser-output-oversize" : "manifest-oversize", channel, bytes.byteLength);
    }
    return bytes;
  }

  function constructResponse(original, outputText, channel, bytes) {
    const contract = readResponseContract(original);
    if (!contract) abort("response-contract", channel, bytes);
    const headers = getResponseHeaders(HeadersCtor, original);
    if (!headers) abort("response-contract", channel, bytes);
    const body = encodedText(outputText, channel, "parser-output");
    let replacement;
    try {
      replacement = new ResponseCtor(body, {
        status: original.status,
        statusText: original.statusText,
        headers,
      });
    } catch (_) {
      abort("response-construct", channel, bytes);
    }
    if (!installResponseContract(replacement, contract, HeadersCtor)) {
      abort("response-contract", channel, bytes);
    }
    return { response: replacement, bytes: body.byteLength };
  }

  function processParser(text, bytes, channel) {
    let result;
    try { result = normalizeParserResult(parser(text)); }
    catch (_) { abort("parser-threw", channel, bytes); }
    if (!result) abort("parser-invalid", channel, bytes);
    if (result.kind === "media") {
      notifyDecision("media-playlist", channel, bytes);
      return result;
    }
    if (result.kind === "reject") abort("parser-rejected", channel, bytes);
    if (!result.changed) {
      notifyDecision("master-unchanged", channel, bytes);
      return result;
    }
    const outputBytes = encodedText(result.text, channel, "parser-output");
    return { ...result, outputBytes };
  }

  function wrapFetch(nativeFetch) {
    if (typeof nativeFetch !== "function") throw new TypeError("nativeFetch must be a function");
    if (!isEnabled()) return nativeFetch;
    return async function singleVariantFetch(...args) {
      if (!isEnabled()) return Reflect.apply(nativeFetch, this, args);
      const requestUrl = targetUrl(args[0]);
      if (!isManifestRequestUrl(requestUrl)) return Reflect.apply(nativeFetch, this, args);
      const deadlineAt = makeDeadline();
      if (!Number.isFinite(deadlineAt) && deadlineAt !== Infinity) abort("deadline", "fetch");
      if (isRetired()) abort("retired", "fetch");
      const timeout = timeoutPromise(deadlineAt, "fetch", 0);
      let response;
      try {
        const nativePromise = Promise.resolve(Reflect.apply(nativeFetch, this, args));
        response = timeout
          ? await Promise.race([nativePromise, timeout.promise])
          : await nativePromise;
      } catch (error) {
        if (timeout && error && error.__singleVariantDeadline) {
          notifyFailure("deadline", "fetch");
          throw fixedAbortError();
        }
        notifyFailure("native-fetch", "fetch");
        throw error;
      } finally {
        timeout?.clear();
      }
      if (!isEnabled()) return response;
      assertActive(deadlineAt, "fetch");
      if (!successfulResponse(response)) return response;
      const contract = readResponseContract(response);
      if (!contract || typeof response.clone !== "function") abort("response-clone", "fetch");
      let clone;
      try { clone = Reflect.apply(response.clone, response, []); }
      catch (_) { abort("response-clone", "fetch"); }
      let body;
      try { body = await readUtf8Stream(clone, deadlineAt, "fetch"); }
      catch (error) { if (error?.name === "AbortError") throw error; abort("stream-read", "fetch"); }
      if (!isEnabled()) return response;
      assertActive(deadlineAt, "fetch", body.bytes);
      const parsed = processParser(body.text, body.bytes, "fetch");
      if (parsed.kind === "media" || !parsed.changed) return response;
      const result = constructResponse(response, parsed.text, "fetch", body.bytes);
      notifyDecision("master-rewritten", "fetch", body.bytes);
      return result.response;
    };
  }

  function prepareXhrState(requestUrl, deadlineAt, generation) {
    return {
      requestUrl,
      deadlineAt,
      generation,
      cache: null,
    };
  }

  function responseTypeOf(xhr) {
    try { return String(xhr.responseType || ""); } catch (_) { return null; }
  }

  function xhrLifecycle(state, channel = "xhr") {
    if (!isEnabled()) return false;
    if (isRetired()) abort("retired", channel);
    const current = timestamp();
    if (!Number.isFinite(current) || current > state.deadlineAt) abort("deadline", channel);
    return true;
  }

  function wrapXMLHttpRequest(NativeXHR) {
    if (typeof NativeXHR !== "function") throw new TypeError("NativeXHR must be a constructor");
    if (!isEnabled()) return NativeXHR;
    const nativePrototype = NativeXHR.prototype;
    const nativeOpen = findDescriptor(nativePrototype, "open")?.value;
    const nativeSend = findDescriptor(nativePrototype, "send")?.value;
    const responseDescriptor = findDescriptor(nativePrototype, "response");
    const responseTextDescriptor = findDescriptor(nativePrototype, "responseText");
    const nativeGetResponseHeader = findDescriptor(nativePrototype, "getResponseHeader")?.value;
    const nativeGetAllResponseHeaders = findDescriptor(nativePrototype, "getAllResponseHeaders")?.value;
    if (typeof nativeOpen !== "function" || typeof nativeSend !== "function"
      || !responseDescriptor || typeof responseDescriptor.get !== "function"
      || !responseTextDescriptor || typeof responseTextDescriptor.get !== "function"
      || typeof nativeGetResponseHeader !== "function" || typeof nativeGetAllResponseHeaders !== "function") {
      notifyFailure("xhr-descriptor", "xhr");
      throw fixedAbortError();
    }

    const nativeResponseGetter = responseDescriptor.get;
    const nativeResponseTextGetter = responseTextDescriptor.get;
    const states = new WeakMap();
    const generations = new WeakMap();

    function requestIsManifest(state) {
      return isManifestRequestUrl(state?.requestUrl);
    }

    function nativeBody(xhr, responseType) {
      if (responseType === "" || responseType === "text") {
        return { type: "text", value: Reflect.apply(nativeResponseTextGetter, xhr, []) };
      }
      if (responseType === "arraybuffer") {
        return { type: "arraybuffer", value: Reflect.apply(nativeResponseGetter, xhr, []) };
      }
      abort("xhr-response-type", "xhr");
    }

    function decodeXhrBody(body) {
      if (body.type === "text") {
        if (typeof body.value !== "string") abort("response-body", "xhr");
        if (body.value.includes("\uFFFD")) abort("manifest-utf8", "xhr");
        const encoded = encodedText(body.value, "xhr");
        try {
          const decoded = new TextDecoderCtor("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded);
          if (decoded !== body.value) abort("manifest-utf8", "xhr");
        } catch (_) { abort("manifest-utf8", "xhr"); }
        return { text: body.value, bytes: encoded.byteLength };
      }
      const bytes = toBytes(body.value, ArrayBufferCtor, Uint8ArrayCtor);
      if (!bytes) abort("response-body", "xhr");
      if (bytes.byteLength > MAX_MANIFEST_BYTES) abort("manifest-oversize", "xhr", bytes.byteLength);
      try {
        return {
          text: new TextDecoderCtor("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
          bytes: bytes.byteLength,
        };
      } catch (_) { abort("manifest-utf8", "xhr", bytes.byteLength); }
    }

    function ensureTransform(xhr, state) {
      if (state.cache) {
        if (isRetired()) abort("retired", "xhr");
        if (state.cache.responseType === responseTypeOf(xhr)) return state.cache;
        state.cache = null;
      }
      let readyState;
      let status;
      try {
        readyState = Number(xhr.readyState);
        status = Number(xhr.status);
      } catch (_) { return null; }
      if (readyState !== 4 || !Number.isInteger(status) || status < 200 || status > 299
        || !requestIsManifest(state)) return null;
      if (!xhrLifecycle(state)) return null;
      const type = responseTypeOf(xhr);
      if (type === "arraybuffer") {
        // The native response getter is intentionally the only source for bytes.
      } else if (type !== "" && type !== "text") {
        abort("xhr-response-type", "xhr");
      }
      const body = nativeBody(xhr, type);
      const decoded = decodeXhrBody(body);
      let parsed;
      try { parsed = processParser(decoded.text, decoded.bytes, "xhr"); }
      catch (error) { if (error?.name === "AbortError") throw error; abort("parser-threw", "xhr", decoded.bytes); }
      if (parsed.kind === "media" || !parsed.changed) {
        state.cache = { kind: parsed.kind === "media" ? "media" : "unchanged", responseType: type, native: body.value, bytes: decoded.bytes };
        return state.cache;
      }
      const output = encodedText(parsed.text, "xhr", "parser-output");
      state.cache = {
        kind: "rewritten",
        responseType: type,
        text: parsed.text,
        bytes: decoded.bytes,
        outputBytes: output,
        outputValue: type === "arraybuffer"
          ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
          : parsed.text,
      };
      notifyDecision("master-rewritten", "xhr", decoded.bytes);
      return state.cache;
    }

    function getResponseValue(xhr, key) {
      const state = states.get(xhr);
      const nativeGetter = key === "response" ? nativeResponseGetter : nativeResponseTextGetter;
      if (!state || !isEnabled()) return Reflect.apply(nativeGetter, xhr, []);
      const type = responseTypeOf(xhr);
      // Preserve the platform's responseText InvalidStateError for binary/other types.
      if (key === "responseText" && type !== "" && type !== "text") {
        return Reflect.apply(nativeGetter, xhr, []);
      }
      let readyState;
      try { readyState = Number(xhr.readyState); } catch (_) { readyState = NaN; }
      if (readyState === 3 && requestIsManifest(state)) {
        if (type === "" || type === "text") return "";
        if (type === "arraybuffer" && key === "response") return null;
        if (key === "response") return null;
      }
      const cache = ensureTransform(xhr, state);
      if (!cache || cache.kind === "media" || cache.kind === "unchanged") {
        if (cache?.responseType === "arraybuffer" && key === "response") return cache.native;
        return Reflect.apply(nativeGetter, xhr, []);
      }
      if (cache.responseType === "arraybuffer") {
        if (key === "responseText") return Reflect.apply(nativeGetter, xhr, []);
        return cache.outputValue;
      }
      return cache.text;
    }

    function assertOwnGetterInstallable(xhr) {
      if (!ownDescriptorCanBeReplaced(xhr, "response") || !ownDescriptorCanBeReplaced(xhr, "responseText")) {
        notifyFailure("xhr-descriptor", "xhr");
        throw fixedAbortError();
      }
    }

    function removeInstalledGetters(xhr, state) {
      if (!state) return;
      for (const [key, getter] of [
        ["response", state.responseGetter],
        ["responseText", state.responseTextGetter],
      ]) {
        if (typeof getter !== "function") continue;
        const descriptor = Object.getOwnPropertyDescriptor(xhr, key);
        if (descriptor?.configurable && descriptor.get === getter) {
          try { delete xhr[key]; } catch (_) { /* native property remains visible */ }
        }
      }
    }

    function installGetters(xhr, state) {
      assertOwnGetterInstallable(xhr);
      const responseGetter = () => getResponseValue(xhr, "response");
      const responseTextGetter = () => getResponseValue(xhr, "responseText");
      try {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          enumerable: false,
          get: responseGetter,
        });
        Object.defineProperty(xhr, "responseText", {
          configurable: true,
          enumerable: false,
          get: responseTextGetter,
        });
      } catch (_) {
        notifyFailure("xhr-descriptor", "xhr");
        throw fixedAbortError();
      }
      state.responseGetter = responseGetter;
      state.responseTextGetter = responseTextGetter;
      states.set(xhr, state);
    }

    class SingleVariantXMLHttpRequest extends NativeXHR {
      open(...args) {
        if (!isEnabled()) return Reflect.apply(nativeOpen, this, args);
        let requestUrl = null;
        try { requestUrl = String(args[1]); } catch (_) { /* native open validates it */ }
        const previousState = states.get(this);
        states.delete(this);
        removeInstalledGetters(this, previousState);
        const generation = (generations.get(this) || 0) + 1;
        generations.set(this, generation);
        if (!isManifestRequestUrl(requestUrl)) {
          return Reflect.apply(nativeOpen, this, args);
        }
        if (isRetired()) abort("retired", "xhr");
        assertOwnGetterInstallable(this);
        const deadlineAt = makeDeadline();
        if (!Number.isFinite(deadlineAt) && deadlineAt !== Infinity) abort("deadline", "xhr");
        try {
          const result = Reflect.apply(nativeOpen, this, args);
          const state = prepareXhrState(requestUrl, deadlineAt, generation);
          installGetters(this, state);
          return result;
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          notifyFailure("xhr-open", "xhr");
          throw error;
        }
      }

      send(...args) {
        if (!isEnabled()) return Reflect.apply(nativeSend, this, args);
        const state = states.get(this);
        if (state && requestIsManifest(state)) xhrLifecycle(state);
        try { return Reflect.apply(nativeSend, this, args); }
        catch (error) {
          if (state && requestIsManifest(state)) notifyFailure("xhr-send", "xhr");
          throw error;
        }
      }

      getResponseHeader(...args) {
        const native = Reflect.apply(nativeGetResponseHeader, this, args);
        if (!isEnabled()) return native;
        const state = states.get(this);
        if (!state) return native;
        const cache = ensureTransform(this, state);
        if (cache?.kind === "rewritten" && typeof args[0] === "string"
          && STALE_RESPONSE_HEADERS.has(args[0].toLowerCase())) return null;
        return native;
      }

      getAllResponseHeaders(...args) {
        const native = Reflect.apply(nativeGetAllResponseHeaders, this, args);
        if (!isEnabled()) return native;
        const state = states.get(this);
        if (!state) return native;
        const cache = ensureTransform(this, state);
        return cache?.kind === "rewritten" ? filterXhrHeaders(native) : native;
      }
    }

    return SingleVariantXMLHttpRequest;
  }

  return Object.freeze({
    wrapFetch,
    wrapXMLHttpRequest,
    maxBytes: MAX_MANIFEST_BYTES,
  });
}
