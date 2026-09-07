// ==UserScript==
// @name         Disney+ Edge Enhanced
// @name:ja      Disney+ Edge Enhanced・画質とフレーム進行
// @namespace    https://github.com/ioridev/disney-plus-edge-enhanced
// @homepageURL  https://github.com/ioridev/disney-plus-edge-enhanced
// @supportURL   https://github.com/ioridev/disney-plus-edge-enhanced/issues
// @license      MIT
// @version      0.4.0
// @description  Full-HD request mode and optional playback diagnostics for Disney+ on Windows Edge. Alt+Shift+4 opens the panel. Does not bypass DRM.
// @description:ja Disney+のフルHD要求モードと任意表示の再生診断。Alt+Shift+4でパネルを開閉します。DRMは回避しません。
// @match        https://www.disneyplus.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "0.4.0";
  const STORAGE_KEY = "ioridev.disneyplus4k.mode.v1";
  const TEST_TICKET_KEY = "ioridev.disneyplus4k.once.v0.4.0";
  const CHECKPOINT_KEY = "ioridev.disneyplus4k.checkpoint.v1";
  const DEFAULT_MODE = "original";
  const DEBUG_UI_KEY = "ioridev.disneyplus.debug-ui.v1";
  const TOOLBAR_CONTROL = "__DisneyPlusEdgeEnhancedToolbar";
  const TEST_TICKET_TTL_MS = 30000;
  const PLAYBACK_HOST = "disney.playback.edge.bamgrid.com";
  const PLAYBACK_PATH = /^\/v7\/playback\/([^/?#]+)$/;
  const INSTALL_GUARD = "__ioridevDisneyPlus4kEdgeV1";
  const HARDWARE_PLAYREADY = "com.microsoft.playready.recommendation.3000";
  const capturedPromiseThen = Promise.prototype.then;
  const SESSION_CLOSED_REASONS = Object.freeze([
    "internal-error", "closed-by-application", "release-acknowledged",
    "hardware-context-reset", "resource-evicted",
  ]);
  const KEY_STATUS_LABELS = Object.freeze([
    "usable", "expired", "released", "output-restricted", "output-downscaled",
    "usable-in-future", "status-pending", "internal-error",
  ]);
  const SESSION_MESSAGE_TYPES = Object.freeze([
    "license-request", "license-renewal", "license-release", "individualization-request",
  ]);
  const SESSION_TYPE_LABELS = Object.freeze([
    "temporary", "persistent-license", "persistent-usage-record",
  ]);
  const SDK_KEY_CONFIGURATION_FIELDS = Object.freeze([
    "drmKeyRotationSupported",
    "drmKeyPrefetchSupported",
    "drmPlayReadyRecommendationFlow",
  ]);
  const SDK_KEY_CONFIGURATION_UNKNOWN = "unknown";
  const SDK_KEY_CONFIGURATION_ABSENT = "absent";
  const SUPPORTED_PLAYBACK_SDK = "26.10.0-jasmine";
  const MUTABLE_SCENARIOS = new Set([
    "ctr-regular",
    "ctr-high",
    "tv-drm-ctr-h265-atmos",
    "tv-drm-ctr-h265-hdr10-atmos",
  ]);

  // SINGLE_VARIANT_MODULES_START
  // Generated from src/hls-single-variant.mjs and src/single-variant-network.mjs.
  const { selectSingleFhdVariant, selectSingleUhdVariant, selectSingleHdrUhdVariant, summarizeUhdVariantRanges, createSingleVariantNetworkAdapter } = (() => {
/*
 * Pure, bounded HLS Master Playlist selectors for fixed FHD (1920x1080) and
 * UHD (3840x2160) targets.  The public wrappers do not accept caller-supplied
 * dimensions.
 *
 * The parser deliberately keeps URI and attribute text private.  Its public
 * result is limited to a fixed reason, counts, dimensions, and the playlist
 * body.  It never fetches or rewrites a URI, key, credential, or token.
 *
 * RFC 8216 permits a Master Playlist to contain several regular Variant
 * Streams, while an EXT-X-I-FRAME-STREAM-INF line stands alone.  Only regular
 * STREAM-INF + following-URI pairs are candidates for removal here.
 * A single selected Variant does not eliminate time-based key rotation in the
 * referenced Media Playlist or in the CDM.
 */

const MAX_UTF8_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 20_000;
const FHD_WIDTH = 1920;
const FHD_HEIGHT = 1080;
const UHD_WIDTH = 3840;
const UHD_HEIGHT = 2160;

const MEDIA_TAG_PREFIXES = Object.freeze([
  "#EXTINF",
  "#EXT-X-TARGETDURATION",
  "#EXT-X-MEDIA-SEQUENCE",
  "#EXT-X-ALLOW-CACHE",
  "#EXT-X-DISCONTINUITY",
  "#EXT-X-DISCONTINUITY-SEQUENCE",
  "#EXT-X-DATERANGE",
  "#EXT-X-KEY",
  "#EXT-X-MAP",
  "#EXT-X-PROGRAM-DATE-TIME",
  "#EXT-X-BYTERANGE",
  "#EXT-X-ENDLIST",
  "#EXT-X-PLAYLIST-TYPE",
  "#EXT-X-I-FRAMES-ONLY",
  "#EXT-X-PART",
  "#EXT-X-PART-INF",
  "#EXT-X-SERVER-CONTROL",
  "#EXT-X-PRELOAD-HINT",
  "#EXT-X-SKIP",
  "#EXT-X-GAP",
  "#EXT-X-RENDITION-REPORT",
  "#EXT-X-PREFETCH",
  "#EXT-X-PREFETCH-DISCONTINUITY",
]);

const ATTRIBUTE_LIST_TAGS = Object.freeze([
  "#EXT-X-DEFINE",
  "#EXT-X-SESSION-DATA",
  "#EXT-X-START",
  "#EXT-X-CONTENT-STEERING",
  "#EXT-X-IMAGE-STREAM-INF",
]);

function makeResult(input, reason, variantCount = 0, candidateCount = 0, width = null, height = null) {
  // Do not coerce arbitrary input.  In particular, a Proxy/getter/toString
  // supplied by a caller must never be observed by diagnostics.
  const original = typeof input === "string" ? input : "";
  return {
    changed: false,
    text: original,
    reason,
    variantCount,
    candidateCount,
    width,
    height,
  };
}

function makeSuccess(input, changed, reason, variantCount, candidateCount, width, height) {
  const original = typeof input === "string" ? input : "";
  return {
    changed,
    text: original,
    reason,
    variantCount,
    candidateCount,
    width,
    height,
  };
}

function utf8ByteLength(value) {
  // TextEncoder is intentionally not used: this keeps the function
  // deterministic and avoids consulting a replaceable global implementation.
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        // TextEncoder's replacement encoding for an unpaired surrogate.
        bytes += 3;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      bytes += 3;
    } else {
      bytes += 3;
    }
    if (bytes > MAX_UTF8_BYTES) {
      return bytes;
    }
  }
  return bytes;
}

function splitLines(value) {
  const records = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\r") {
      if (value[index + 1] !== "\n") {
        return null;
      }
      continue;
    }
    if (character !== "\n") {
      continue;
    }
    const contentEnd = index > start && value[index - 1] === "\r" ? index - 1 : index;
    records.push({
      content: value.slice(start, contentEnd),
      newline: value.slice(contentEnd, index + 1),
    });
    start = index + 1;
  }
  if (start < value.length || records.length === 0) {
    records.push({ content: value.slice(start), newline: "" });
  }
  return records;
}

function isAttributeNameCharacter(character) {
  const code = character.charCodeAt(0);
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39) || character === "-";
}

function parseAttributeList(raw) {
  if (raw.length === 0) {
    return { kind: "invalid" };
  }
  const attrs = Object.create(null);
  let index = 0;
  while (index < raw.length) {
    const nameStart = index;
    while (index < raw.length && isAttributeNameCharacter(raw[index])) {
      index += 1;
    }
    if (index === nameStart || raw[index] !== "=") {
      return { kind: "invalid" };
    }
    const name = raw.slice(nameStart, index);
    if (Object.prototype.hasOwnProperty.call(attrs, name)) {
      return { kind: "duplicate" };
    }
    index += 1;

    let quoted = false;
    let rawValue;
    let value;
    if (raw[index] === '"') {
      quoted = true;
      const valueStart = index + 1;
      index = valueStart;
      while (index < raw.length && raw[index] !== '"') {
        const character = raw[index];
        if (character === "\r" || character === "\n") {
          return { kind: "invalid" };
        }
        index += 1;
      }
      if (index >= raw.length) {
        return { kind: "invalid" };
      }
      if (index === valueStart) {
        return { kind: "invalid" };
      }
      value = raw.slice(valueStart, index);
      rawValue = raw.slice(valueStart - 1, index + 1);
      index += 1;
    } else {
      const valueStart = index;
      while (index < raw.length && raw[index] !== ",") {
        const character = raw[index];
        if (character === '"' || character === "\r" || character === "\n") {
          return { kind: "invalid" };
        }
        index += 1;
      }
      if (index === valueStart) {
        return { kind: "invalid" };
      }
      rawValue = raw.slice(valueStart, index);
      value = rawValue;
      if (/\s/u.test(value)) {
        return { kind: "invalid" };
      }
    }
    attrs[name] = { raw: rawValue, value, quoted };
    if (index === raw.length) {
      break;
    }
    if (raw[index] !== ",") {
      return { kind: "invalid" };
    }
    index += 1;
    if (index === raw.length) {
      return { kind: "invalid" };
    }
  }
  return { kind: "ok", attrs };
}

function parseTagAttributeLine(line, tag) {
  const prefix = `${tag}:`;
  if (!line.startsWith(prefix)) {
    return { kind: "invalid" };
  }
  return parseAttributeList(line.slice(prefix.length));
}

function positiveDecimalInteger(attribute) {
  if (!attribute || attribute.quoted || !/^[0-9]+$/u.test(attribute.value)) {
    return null;
  }
  if (attribute.value.length > 20) {
    return null;
  }
  let parsed;
  try {
    parsed = BigInt(attribute.value);
  } catch {
    return null;
  }
  if (parsed <= 0n || parsed > 18446744073709551615n) {
    return null;
  }
  return parsed;
}

function isMediaTag(line) {
  for (const prefix of MEDIA_TAG_PREFIXES) {
    if (line === prefix || line.startsWith(`${prefix}:`)) {
      return true;
    }
  }
  return false;
}

function isCandidate(variant, targetWidth, targetHeight, requiredVideoRange) {
  const attrs = variant.attrs;
  const resolution = attrs.RESOLUTION;
  const range = attrs["VIDEO-RANGE"];
  const codecs = attrs.CODECS;
  const frameRate = attrs["FRAME-RATE"];

  // This comparison cannot account for an externally supplied VIDEO group.
  // Treat it as incompatible rather than making an assumption about the
  // variant set that CONTENT-STEERING or another external source may provide.
  if (attrs.VIDEO) {
    return false;
  }
  if (!resolution || resolution.quoted || resolution.value !== `${targetWidth}x${targetHeight}`) {
    return false;
  }
  if (!range || range.quoted || range.value !== requiredVideoRange) {
    return false;
  }
  if (!codecs || !codecs.quoted) {
    return false;
  }
  const codecList = codecs.value.split(",");
  if (codecList.length !== 2 || codecList.some((codec) => codec.length === 0)) {
    return false;
  }
  const hasHevc = codecList.some((codec) => /^(?:hvc1|hev1)(?:\.[A-Za-z0-9]+)*$/u.test(codec));
  const hasAac = codecList.some((codec) => codec === "mp4a.40.2");
  if (!hasHevc || !hasAac) {
    return false;
  }
  if (!frameRate || frameRate.quoted || !/^(?:0|[0-9]+)(?:\.[0-9]+)?$/u.test(frameRate.value)) {
    return false;
  }
  const parsedFrameRate = Number(frameRate.value);
  if (!Number.isFinite(parsedFrameRate) || parsedFrameRate <= 0 || parsedFrameRate > 60) {
    return false;
  }
  return true;
}

function validateReferencedGroups(variants, groups) {
  const groupAttributes = ["AUDIO", "SUBTITLES", "CLOSED-CAPTIONS"];
  for (const variant of variants) {
    for (const attributeName of groupAttributes) {
      const attribute = variant.attrs[attributeName];
      if (!attribute) {
        continue;
      }
      if (attributeName === "CLOSED-CAPTIONS" && !attribute.quoted && attribute.value === "NONE") {
        continue;
      }
      if (!attribute.quoted) {
        return false;
      }
      const typeGroups = groups[attributeName];
      if (!typeGroups || !typeGroups.has(attribute.value)) {
        return false;
      }
    }
  }
  return true;
}

function isUriLine(line) {
  return line.length > 0 && !line.startsWith("#");
}

function hasWhitespace(value) {
  return /\s/u.test(value);
}

function isMalformedControlText(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code <= 0x1f && code !== 0x0a && code !== 0x0d) || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

function genericAttributeLine(line) {
  const colon = line.indexOf(":");
  if (colon < 0 || !line.startsWith("#EXT")) {
    return { kind: "ok" };
  }
  const tag = line.slice(0, colon);
  const raw = line.slice(colon + 1);
  if (ATTRIBUTE_LIST_TAGS.includes(tag)) {
    return parseAttributeList(raw);
  }
  if (!raw.includes("=")) {
    return { kind: "ok" };
  }
  return parseAttributeList(raw);
}

function sameLineRecords(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].content !== right[index].content || left[index].newline !== right[index].newline) {
      return false;
    }
  }
  return true;
}

function selectSingleVariant(input, targetWidth, targetHeight, requiredVideoRange) {
  if (typeof input !== "string") {
    return makeResult(input, "invalid-input");
  }

  try {
    if (utf8ByteLength(input) > MAX_UTF8_BYTES) {
      return makeResult(input, "oversize");
    }
    if (input.length > 0 && input.charCodeAt(0) === 0xfeff) {
      // RFC 8216 says a playlist MUST NOT contain a BOM; fail closed and
      // return the body unchanged rather than silently stripping it.
      return makeResult(input, "bom");
    }
    if (isMalformedControlText(input)) {
      return makeResult(input, "invalid-control");
    }

    const records = splitLines(input);
    if (!records) {
      return makeResult(input, "invalid-newline");
    }
    if (records.length > MAX_LINES) {
      return makeResult(input, "line-limit");
    }
    if (records.length === 0 || records[0].content !== "#EXTM3U") {
      return makeResult(input, "not-master");
    }

    const variants = [];
    const groups = {
      AUDIO: new Set(),
      VIDEO: new Set(),
      SUBTITLES: new Set(),
      "CLOSED-CAPTIONS": new Set(),
    };
    let sawMediaTag = false;
    let sawOrphanUri = false;

    for (let index = 1; index < records.length; index += 1) {
      const line = records[index].content;
      if (line === "" || line.startsWith("#") && !line.startsWith("#EXT")) {
        continue;
      }
      if (isUriLine(line)) {
        sawOrphanUri = true;
        continue;
      }
      if (isMediaTag(line)) {
        sawMediaTag = true;
        continue;
      }

      if (line === "#EXT-X-CONTENT-STEERING" || line.startsWith("#EXT-X-CONTENT-STEERING:")) {
        return makeResult(input, "external-variant-config", variants.length);
      }

      if (
        line === "#EXT-X-STREAM-INF" ||
        line === "#EXT-X-MEDIA" ||
        line === "#EXT-X-I-FRAME-STREAM-INF" ||
        line === "#EXT-X-SESSION-KEY"
      ) {
        return makeResult(input, "malformed-attribute-list", variants.length);
      }

      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const parsed = parseTagAttributeLine(line, "#EXT-X-STREAM-INF");
        if (parsed.kind === "duplicate") {
          return makeResult(input, "duplicate-attribute", variants.length);
        }
        if (parsed.kind !== "ok" || !positiveDecimalInteger(parsed.attrs.BANDWIDTH)) {
          return makeResult(input, "malformed-attribute-list", variants.length);
        }
        const next = index + 1;
        if (next >= records.length || !isUriLine(records[next].content) || hasWhitespace(records[next].content)) {
          return makeResult(input, "incomplete-variant", variants.length);
        }
        variants.push({ index, uriIndex: next, attrs: parsed.attrs });
        index = next;
        continue;
      }

      if (line.startsWith("#EXT-X-MEDIA:")) {
        const parsed = parseTagAttributeLine(line, "#EXT-X-MEDIA");
        if (parsed.kind === "duplicate") {
          return makeResult(input, "duplicate-attribute", variants.length);
        }
        if (parsed.kind !== "ok") {
          return makeResult(input, "malformed-attribute-list", variants.length);
        }
        const type = parsed.attrs.TYPE;
        const groupId = parsed.attrs["GROUP-ID"];
        const name = parsed.attrs.NAME;
        if (!type || type.quoted || !groups[type.value] || !groupId || !groupId.quoted || !name || !name.quoted) {
          return makeResult(input, "malformed-attribute-list", variants.length);
        }
        if (type.value === "CLOSED-CAPTIONS" && parsed.attrs.URI) {
          return makeResult(input, "malformed-attribute-list", variants.length);
        }
        groups[type.value].add(groupId.value);
        continue;
      }

      if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
        const parsed = parseTagAttributeLine(line, "#EXT-X-I-FRAME-STREAM-INF");
        if (parsed.kind === "duplicate") {
          return makeResult(input, "duplicate-attribute", variants.length);
        }
        if (parsed.kind !== "ok" || !positiveDecimalInteger(parsed.attrs.BANDWIDTH) || !parsed.attrs.URI || !parsed.attrs.URI.quoted || parsed.attrs.URI.value.length === 0) {
          return makeResult(input, "malformed-attribute-list", variants.length);
        }
        continue;
      }

      if (line.startsWith("#EXT-X-SESSION-KEY:")) {
        const parsed = parseTagAttributeLine(line, "#EXT-X-SESSION-KEY");
        if (parsed.kind === "duplicate") {
          return makeResult(input, "duplicate-attribute", variants.length);
        }
        if (parsed.kind !== "ok") {
          return makeResult(input, "malformed-attribute-list", variants.length);
        }
        continue;
      }

      const generic = genericAttributeLine(line);
      if (generic.kind === "duplicate") {
        return makeResult(input, "duplicate-attribute", variants.length);
      }
      if (generic.kind !== "ok") {
        return makeResult(input, "malformed-attribute-list", variants.length);
      }
    }

    if (sawMediaTag) {
      return makeResult(input, variants.length > 0 ? "mixed-playlist" : "media-playlist", variants.length);
    }
    if (sawOrphanUri) {
      return makeResult(input, "orphan-uri", variants.length);
    }

    if (!validateReferencedGroups(variants, groups)) {
      return makeResult(input, "missing-group", variants.length);
    }

    const candidates = variants.filter((variant) => isCandidate(variant, targetWidth, targetHeight, requiredVideoRange));
    if (candidates.length === 0) {
      return makeResult(input, "no-compatible-candidate", variants.length, 0);
    }

    let maximumBandwidth = null;
    for (const candidate of candidates) {
      const bandwidth = positiveDecimalInteger(candidate.attrs.BANDWIDTH);
      if (maximumBandwidth === null || bandwidth > maximumBandwidth) {
        maximumBandwidth = bandwidth;
      }
    }
    const top = candidates.filter((candidate) => positiveDecimalInteger(candidate.attrs.BANDWIDTH) === maximumBandwidth);
    if (top.length !== 1) {
      return makeResult(input, "ambiguous-candidate", variants.length, candidates.length);
    }

    const selected = top[0];
    if (variants.length === 1) {
      return makeSuccess(input, false, "already-single-compatible", variants.length, candidates.length, targetWidth, targetHeight);
    }

    const removed = new Set();
    for (const variant of variants) {
      if (variant !== selected) {
        removed.add(variant.index);
        removed.add(variant.uriIndex);
      }
    }
    const output = records
      .filter((_record, index) => !removed.has(index))
      .map((record) => `${record.content}${record.newline}`)
      .join("");
    const retainedRecords = records.filter((_record, index) => !removed.has(index));
    const reparsedRecords = splitLines(output);
    // Reparse the generated body before returning it.  This guards the
    // adapter boundary against a future edit that accidentally drops a line,
    // changes a line ending, or leaves more than one compatible Variant.
    if (!sameLineRecords(retainedRecords, reparsedRecords)) {
      return makeResult(input, "output-invariant-failed", variants.length, candidates.length);
    }
    const reparsed = selectSingleVariant(output, targetWidth, targetHeight, requiredVideoRange);
    if (
      reparsed.reason !== "already-single-compatible" ||
      reparsed.variantCount !== 1 ||
      reparsed.candidateCount !== 1 ||
      reparsed.width !== targetWidth ||
      reparsed.height !== targetHeight ||
      reparsed.text !== output
    ) {
      return makeResult(input, "output-invariant-failed", variants.length, candidates.length);
    }
    const result = makeSuccess(input, true, "selected-compatible-variant", variants.length, candidates.length, targetWidth, targetHeight);
    result.text = output;
    return result;
  } catch {
    // A malformed primitive string must never make a diagnostic path throw.
    // Do not expose parser internals, raw attributes, or URI material.
    return makeResult(input, "invalid-input");
  }
}

function selectSingleFhdVariant(input) {
  return selectSingleVariant(input, FHD_WIDTH, FHD_HEIGHT, "SDR");
}

function selectSingleUhdVariant(input) {
  return selectSingleVariant(input, UHD_WIDTH, UHD_HEIGHT, "SDR");
}

function selectSingleHdrUhdVariant(input) {
  return selectSingleVariant(input, UHD_WIDTH, UHD_HEIGHT, "PQ");
}

// Numeric metadata only, independent of AAC/HEVC/fps compatibility. Unknown
// or absent range declarations are not silently classified as SDR. No URI,
// key declaration, raw attribute, or rewritten body escapes this summary.
function summarizeUhdVariantRanges(input) {
  const result = { status: "invalid-or-non-master", total: 0, sdr: 0, pq: 0, hlg: 0, unspecified: 0, unknown: 0 };
  const checked = selectSingleUhdVariant(input);
  if (!["selected-compatible-variant", "already-single-compatible", "no-compatible-candidate", "ambiguous-candidate"].includes(checked.reason)) return result;
  result.status = "validated-master";
  for (const record of splitLines(input)) {
    if (!record.content.startsWith("#EXT-X-STREAM-INF:")) continue;
    const { attrs } = parseTagAttributeLine(record.content, "#EXT-X-STREAM-INF");
    if (!attrs.RESOLUTION || attrs.RESOLUTION.quoted || attrs.RESOLUTION.value !== "3840x2160") continue;
    result.total++;
    const range = attrs["VIDEO-RANGE"];
    if (!range) result.unspecified++;
    else if (!range.quoted && range.value === "SDR") result.sdr++;
    else if (!range.quoted && range.value === "PQ") result.pq++;
    else if (!range.quoted && range.value === "HLG") result.hlg++;
    else result.unknown++;
  }
  return result;
}

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


function createSingleVariantNetworkAdapter({
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

    return { selectSingleFhdVariant, selectSingleUhdVariant, selectSingleHdrUhdVariant, summarizeUhdVariantRanges, createSingleVariantNetworkAdapter };
  })();
  // SINGLE_VARIANT_MODULES_END

  const MODE_PLANS = Object.freeze({
    fullhd: Object.freeze({
      label: "フルHD（1080p SDR・時間制限なし）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "1920x1080",
      sdkMaxHeight: 1080,
      sdkRecommendationFlow: true,
      singleFhdVariant: true,
      continuousFhd: true,
    }),
    "4k-hdr10-single-pq": Object.freeze({
      label: "4K HDR10・HEVC/AACを1候補に固定（30秒限定）",
      scenario: "tv-drm-ctr-h265-hdr10-atmos",
      resolution: "3840x2160",
      sdkMaxHeight: 2160,
      sdkRecommendationFlow: true,
      sdkUhdPolicy: true,
      singleHdrVariant: true,
    }),
    "4k-hdr10-sdr-manifest-probe": Object.freeze({
      label: "HDR10一覧の4K SDR候補だけ診断（復号しない）",
      scenario: "tv-drm-ctr-h265-hdr10-atmos",
      resolution: "3840x2160",
      sdkMaxHeight: 2160,
      sdkRecommendationFlow: true,
      sdkUhdPolicy: true,
      singleSdrProbe: true,
    }),
    "4k-hevc-sdr-manifest-probe": Object.freeze({
      label: "4K SDR候補の診断のみ（復号しない）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "3840x2160",
      sdkMaxHeight: 2160,
      sdkRecommendationFlow: true,
      sdkUhdPolicy: true,
      singleSdrProbe: true,
    }),
    "1080p-hevc-single-sdr": Object.freeze({
      label: "1080p SDR・HEVC/AACを1候補に固定（75秒比較）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "1920x1080",
      sdkMaxHeight: 1080,
      sdkRecommendationFlow: true,
      singleFhdVariant: true,
    }),
    "4k-hevc-sdk-playready": Object.freeze({
      label: "4K HEVC・HDR要求なし（SDKのPlayReady選択）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "3840x2160",
      sdkMaxHeight: 2160,
      sdkRecommendationFlow: true,
      sdkUhdPolicy: true,
    }),
    "4k-hdr10-sdk-playready": Object.freeze({
      label: "4K HDR10（SDKのPlayReady選択）",
      scenario: "tv-drm-ctr-h265-hdr10-atmos",
      resolution: "3840x2160",
      sdkMaxHeight: 2160,
      sdkRecommendationFlow: true,
      sdkUhdPolicy: true,
    }),
    "1080p-hevc-sdk-playready": Object.freeze({
      label: "1080p HEVC（SDKのPlayReady選択）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "1920x1080",
      sdkMaxHeight: 1080,
      sdkRecommendationFlow: true,
    }),
    "1080p-hevc-native-cap": Object.freeze({
      label: "1080p HEVC（標準DRM・内部上限修正）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "1920x1080",
      sdkMaxHeight: 1080,
    }),
    "sdk-inspect": Object.freeze({
      label: "SDKの解像度上限を診断（再生しない）",
      scenario: null,
      resolution: null,
      sdkInspectOnly: true,
    }),
    "1080p-hevc-hw-persistent-cap": Object.freeze({
      label: "1080p HEVC + HWPR（内部上限修正）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "1920x1080",
      hardwarePlayReady: true,
      persistentSession: true,
      sdkMaxHeight: 1080,
    }),
    "1080p-hevc-hw-persistent": Object.freeze({
      label: "1080p HEVC + HWPR（persistent切り分け）",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "1920x1080",
      hardwarePlayReady: true,
      persistentSession: true,
    }),
    "4k-hdr10-hw-persistent": Object.freeze({
      label: "UHD HDR10 + HWPR（persistent互換テスト）",
      scenario: "tv-drm-ctr-h265-hdr10-atmos",
      resolution: "3840x2160",
      hardwarePlayReady: true,
      persistentSession: true,
    }),
    "4k-hdr10-hw": Object.freeze({
      label: "UHD HDR10 + ハードウェアPlayReady",
      scenario: "tv-drm-ctr-h265-hdr10-atmos",
      resolution: "3840x2160",
      hardwarePlayReady: true,
    }),
    "4k-hevc-hw": Object.freeze({
      label: "UHD HEVC + ハードウェアPlayReady",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "3840x2160",
      hardwarePlayReady: true,
    }),
    "4k-sdr": Object.freeze({
      label: "UHD HEVC/Atmos要求",
      scenario: "tv-drm-ctr-h265-atmos",
      resolution: "3840x2160",
    }),
    "4k-hdr10": Object.freeze({
      label: "UHD HDR10シナリオ要求",
      scenario: "tv-drm-ctr-h265-hdr10-atmos",
      resolution: "3840x2160",
    }),
    "1080p": Object.freeze({
      label: "1080p上限要求",
      scenario: "ctr-high",
      resolution: "1920x1080",
    }),
    original: Object.freeze({
      label: "無変更",
      scenario: null,
      resolution: null,
    }),
  });

  function getModePlan(mode) {
    return Object.prototype.hasOwnProperty.call(MODE_PLANS, mode) ? MODE_PLANS[mode] : MODE_PLANS[DEFAULT_MODE];
  }

  function isExperimentalMode(mode) {
    const plan = getModePlan(mode);
    if (plan.continuousFhd) return false;
    return Boolean(plan.hardwarePlayReady || plan.sdkMaxHeight || plan.sdkInspectOnly || mode === "4k-hdr10");
  }

  function readSdkOwnData(object, key) {
    try {
      if (!object || typeof object !== "object" || Array.isArray(object)) return { kind: SDK_KEY_CONFIGURATION_UNKNOWN };
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor) return { kind: SDK_KEY_CONFIGURATION_ABSENT };
      if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) return { kind: SDK_KEY_CONFIGURATION_UNKNOWN };
      return { kind: "value", value: descriptor.value };
    } catch (_) {
      return { kind: SDK_KEY_CONFIGURATION_UNKNOWN };
    }
  }

  function readSdkDataPath(root, path) {
    let current = root;
    for (const key of path) {
      const entry = readSdkOwnData(current, key);
      if (entry.kind !== "value") return entry;
      current = entry.value;
    }
    try {
      if (!current || typeof current !== "object" || Array.isArray(current)) return { kind: SDK_KEY_CONFIGURATION_UNKNOWN };
    } catch (_) {
      return { kind: SDK_KEY_CONFIGURATION_UNKNOWN };
    }
    return { kind: "value", value: current };
  }

  function sdkKeyConfigurationFields(value) {
    return Object.freeze(Object.fromEntries(SDK_KEY_CONFIGURATION_FIELDS.map((key) => [key, value])));
  }

  function inspectSdkKeyConfigurationFields(engineResult) {
    if (engineResult.kind !== "value") {
      return sdkKeyConfigurationFields(engineResult.kind === SDK_KEY_CONFIGURATION_ABSENT
        ? SDK_KEY_CONFIGURATION_ABSENT : SDK_KEY_CONFIGURATION_UNKNOWN);
    }
    const result = {};
    for (const key of SDK_KEY_CONFIGURATION_FIELDS) {
      const entry = readSdkOwnData(engineResult.value, key);
      result[key] = entry.kind === "value" && typeof entry.value === "boolean"
        ? entry.value
        : entry.kind === SDK_KEY_CONFIGURATION_ABSENT
          ? SDK_KEY_CONFIGURATION_ABSENT
          : SDK_KEY_CONFIGURATION_UNKNOWN;
    }
    return Object.freeze(result);
  }

  function inspectSdkKeyConfiguration(service, options) {
    // Descriptor-only reads: do not invoke ConfigurationManager getters, stringify
    // config objects, or expose any unrecognized value from the SDK arguments.
    const base = inspectSdkKeyConfigurationFields(readSdkDataPath(service, [
      "configurationManager", "hiveDmp", "engine",
    ]));
    const override = inspectSdkKeyConfigurationFields(readSdkDataPath(options, [
      "clientParameters", "configOverrides", "hive-dmp", "engine",
    ]));
    // The two views are deliberately separate. This helper does not claim an
    // effective value because the native service performs the final merge.
    return Object.freeze({ base, override });
  }

  function inspectSdkSessionKeyConfiguration(sessionOptions) {
    // PlaybackSession receives the already-resolved configManager as a data
    // property. Read only configManager.hiveDmp.engine; never call engineConfig.
    return inspectSdkKeyConfigurationFields(readSdkDataPath(sessionOptions, [
      "configManager", "hiveDmp", "engine",
    ]));
  }

  function describeSdkKeyConfigurationFields(fields) {
    if (!fields || typeof fields !== "object") return SDK_KEY_CONFIGURATION_UNKNOWN;
    return SDK_KEY_CONFIGURATION_FIELDS.map((key) => {
      const value = fields[key];
      const rendered = typeof value === "boolean"
        ? (value ? "true" : "false")
        : value === SDK_KEY_CONFIGURATION_ABSENT || value === SDK_KEY_CONFIGURATION_UNKNOWN
          ? value : SDK_KEY_CONFIGURATION_UNKNOWN;
      return `${key}=${rendered}`;
    }).join(", ");
  }

  function describeSdkKeyConfiguration(report) {
    if (!report || typeof report !== "object") return SDK_KEY_CONFIGURATION_UNKNOWN;
    return `base[${describeSdkKeyConfigurationFields(report.base)}] / override[${describeSdkKeyConfigurationFields(report.override)}]（実効値未確定）`;
  }

  function describeSdkSessionKeyConfiguration(fields) {
    return `${describeSdkKeyConfigurationFields(fields)}（セッション作成直前・実効値未確定）`;
  }

  function inspectSdkCapabilities(service) {
    // Read only the published SDK's resolution enums. Never read device IDs,
    // DRM/license data, URLs, getters, or the remainder of the capability object.
    const ownValue = (object, key) => {
      if (!object || typeof object !== "object") throw new TypeError("Missing SDK record");
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new TypeError("Unknown SDK field");
      return descriptor.value;
    };
    const resolutions = (value) => {
      if (!Array.isArray(value)) throw new TypeError("Unknown SDK resolutions");
      const length = ownValue(value, "length");
      if (!Number.isInteger(length) || length < 0 || length > 16) throw new TypeError("Unknown SDK resolutions");
      const allowed = new Set(["SD", "HD", "FHD", "UHD"]);
      const result = [];
      for (let index = 0; index < length; index += 1) {
        const entry = ownValue(value, String(index));
        if (!allowed.has(entry)) throw new TypeError("Unknown SDK resolution");
        if (!result.includes(entry)) result.push(entry);
      }
      return result;
    };
    try {
      const capabilities = ownValue(service, "mediaCapabilitiesInfo");
      return {
        adapter: resolutions(ownValue(capabilities, "videoResolutions")),
        vod: resolutions(ownValue(ownValue(capabilities, "vod"), "videoResolutions")),
      };
    } catch (_) { return null; }
  }

  function planPlaybackSessionOptions(options, mode = DEFAULT_MODE) {
    const plan = getModePlan(mode);
    const unchanged = { options, changed: false };
    if (!plan.sdkMaxHeight) return unchanged;
    // The published createPlaybackSession API accepts clientParameters.configOverrides.
    // Copy the VOD resolution paths and, in its explicit comparison mode, the
    // SDK recommendation-flow flag. Preserve the caller's object and other settings.
    const copyRecord = (value, allowMissing = true) => {
      if (value === undefined && allowMissing) return {};
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid SDK option record");
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null && prototype !== Object.prototype) throw new TypeError("Non-record SDK options");
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some((key) => !Object.prototype.hasOwnProperty.call(descriptors[key], "value"))) {
        throw new TypeError("Accessor SDK options");
      }
      return { ...value };
    };
    try {
      const next = copyRecord(options, false);
      const client = copyRecord(next.clientParameters);
      const overrides = copyRecord(client.configOverrides);
      const hive = copyRecord(overrides["hive-dmp"]);
      if (plan.sdkRecommendationFlow) {
        const engine = copyRecord(hive.engine);
        engine.drmPlayReadyRecommendationFlow = true;
        hive.engine = engine;
      }
      const session = copyRecord(hive.session);
      const vod = copyRecord(session.vod);
      const filtering = copyRecord(vod.playlistFiltering);
      const attributes = copyRecord(vod.playbackAttributesConfig);
      const resolution = copyRecord(attributes.resolution);
      if (filtering.minHeight !== undefined
        && (!Number.isFinite(filtering.minHeight) || filtering.minHeight > plan.sdkMaxHeight)) return unchanged;
      filtering.maxHeight = plan.sdkMaxHeight;
      resolution.max = [plan.resolution];
      attributes.resolution = resolution;
      vod.playlistFiltering = filtering;
      vod.playbackAttributesConfig = attributes;
      session.vod = vod;
      hive.session = session;
      overrides["hive-dmp"] = hive;
      client.configOverrides = overrides;
      next.clientParameters = client;
      return { options: next, changed: true };
    } catch (_) { return unchanged; }
  }

  function planSdkResolutionPolicy(options, mode = DEFAULT_MODE) {
    const unchanged = { options, changed: false, valid: false, before: [], after: [] };
    if (!getModePlan(mode).sdkUhdPolicy) return unchanged;
    // This is the SDK's Windows resolution-selection policy, not a native
    // decoder/CDM capability result. Change only a per-session constructor copy.
    // Native codec checks, DRM preflight, licenses and output restrictions remain.
    const recordDescriptors = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Unknown SDK record");
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Unknown SDK record");
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some((key) => !Object.prototype.hasOwnProperty.call(descriptors[key], "value"))) {
        throw new TypeError("Unknown SDK accessor");
      }
      return descriptors;
    };
    try {
      const optionFields = recordDescriptors(options);
      if (optionFields.playbackServiceVersion?.value !== SUPPORTED_PLAYBACK_SDK) return unchanged;
      const capabilities = optionFields.mediaCapabilities?.value;
      const capabilityFields = recordDescriptors(capabilities);
      const values = capabilityFields.videoResolutions?.value;
      if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) return unchanged;
      const fields = Object.getOwnPropertyDescriptors(values);
      const length = fields.length?.value;
      if (!Number.isInteger(length) || length < 1 || length > 16 || Reflect.ownKeys(fields).length !== length + 1) return unchanged;
      const before = [];
      for (let index = 0; index < length; index += 1) {
        const field = fields[String(index)];
        if (!field || !Object.prototype.hasOwnProperty.call(field, "value")
          || !["SD", "HD", "FHD", "UHD"].includes(field.value) || before.includes(field.value)) return unchanged;
        before.push(field.value);
      }
      if (before.includes("UHD")) return { options, changed: false, valid: true, before, after: [...before] };
      if (!before.includes("FHD")) return unchanged;
      const after = [...before, "UHD"];
      capabilityFields.videoResolutions = { ...capabilityFields.videoResolutions, value: after };
      optionFields.mediaCapabilities = {
        ...optionFields.mediaCapabilities,
        value: Object.create(Object.getPrototypeOf(capabilities), capabilityFields),
      };
      return {
        options: Object.create(Object.getPrototypeOf(options), optionFields),
        changed: true, valid: true, before, after,
      };
    } catch (_) { return unchanged; }
  }

  function clearTestTicket(sessionStore) {
    sessionStore.removeItem(TEST_TICKET_KEY);
    if (sessionStore.getItem(TEST_TICKET_KEY) !== null) throw new Error("Ticket removal failed");
  }

  function storeMode(localStore, mode) {
    localStore.setItem(STORAGE_KEY, mode);
    if (localStore.getItem(STORAGE_KEY) !== mode) throw new Error("Mode persistence failed");
  }

  function consumeStartupMode(localStore, sessionStore, documentUrl, now, navigationType) {
    // Consume before any EME/network hook or playback can run. A crash during the
    // test cannot reuse this ticket on a later document, including session restore.
    try {
      const ticketText = sessionStore.getItem(TEST_TICKET_KEY);
      clearTestTicket(sessionStore);
      const stored = localStore.getItem(STORAGE_KEY);
      let notice = "HW/HDR/SDK実験は選択後の1ページ限り。再読込後は無変更に戻ります。";
      let mode = Object.prototype.hasOwnProperty.call(MODE_PLANS, stored) ? stored : DEFAULT_MODE;
      if (isExperimentalMode(mode)) {
        storeMode(localStore, DEFAULT_MODE);
        mode = DEFAULT_MODE;
        notice = "以前のHW/HDR/SDK実験設定を無変更へ戻しました。再読込で実験を自動再開しません。";
      }
      if (ticketText !== null) {
        let ticket;
        try { ticket = JSON.parse(ticketText); } catch (_) { /* Invalid ticket stays consumed. */ }
        if (ticket?.version === VERSION && isExperimentalMode(ticket.mode)
          && navigationType === "reload" && ticket.documentUrl === documentUrl && Number.isFinite(now) && Number.isFinite(ticket.createdAt)
          && now >= ticket.createdAt && now - ticket.createdAt < TEST_TICKET_TTL_MS
          && localStore.getItem(STORAGE_KEY) === DEFAULT_MODE) {
          storeMode(localStore, DEFAULT_MODE);
          return { mode: ticket.mode, notice: "今回のページのみ実験中。再読込・再起動後は無変更。次のページへ実験設定を引き継ぎません。" };
        }
        // A stale or malformed experimental ticket must never select another
        // saved request mode as an implicit fallback.
        return { mode: DEFAULT_MODE, notice: "実験の開始票が期限切れ・無効のため、無変更で起動しました。" };
      }
      return { mode, notice };
    } catch (_) {
      return { mode: DEFAULT_MODE, notice: "設定領域を確認できないため、無変更で起動しました。実験は開始していません。" };
    }
  }

  function prepareModeReload(mode, localStore, sessionStore, documentUrl, now) {
    if (!Object.prototype.hasOwnProperty.call(MODE_PLANS, mode)) return { reload: false, notice: "未知のモードです。" };
    try {
      clearTestTicket(sessionStore);
      if (isExperimentalMode(mode)) {
        if (typeof documentUrl !== "string" || new URL(documentUrl).origin !== "https://www.disneyplus.com" || !Number.isFinite(now)) throw new Error("Invalid context");
        storeMode(localStore, DEFAULT_MODE);
        const ticket = JSON.stringify({ version: VERSION, mode, documentUrl, createdAt: now });
        sessionStore.setItem(TEST_TICKET_KEY, ticket);
        if (sessionStore.getItem(TEST_TICKET_KEY) !== ticket) throw new Error("Ticket persistence failed");
      } else storeMode(localStore, mode);
      return { reload: true, notice: "設定を確認しました。再読込中…" };
    } catch (_) {
      try { clearTestTicket(sessionStore); } catch (_) { /* Fail closed for this document. */ }
      return { reload: false, notice: "設定を安全に保存できないため切替を中止しました。実験を終了するにはタブを閉じてください。" };
    }
  }

  const CHECKPOINT_PHASES = Object.freeze([
    "test-start", "cdm-create-start", "cdm-create-ok", "cdm-attach-ok", "cdm-detach",
    "session-event", "keys-pending", "keys-usable", "keys-other", "media-error",
    "generateRequest-start", "generateRequest-ok", "update-start", "update-ok",
    "video-metadata", "video-playing", "video-waiting-for-key", "page-exit",
  ]);

  function checkpointPhase(stage, detail) {
    const direct = {
      "CDM作成要求": "cdm-create-start", "CDM作成成功": "cdm-create-ok",
      "CDM接続成功": "cdm-attach-ok", "CDM切断": "cdm-detach", "再生エラー": "media-error",
      "video.loadedmetadata": "video-metadata", "video.playing": "video-playing",
      "video.waitingforkey": "video-waiting-for-key",
    };
    if (Object.prototype.hasOwnProperty.call(direct, stage)) return direct[stage];
    const operation = /^(generateRequest|update) #(?:\d+|\?)$/.exec(stage);
    if (operation && (detail === "開始" || detail === "成功")) return `${operation[1]}-${detail === "開始" ? "start" : "ok"}`;
    if (/^session #\d+$/.test(stage)) return "session-event";
    if (/^鍵状態 #\d+$/.test(stage)) {
      try {
        const statuses = JSON.parse(detail);
        if (Number.isInteger(statuses["status-pending"]) && statuses["status-pending"] > 0) return "keys-pending";
        if (Number.isInteger(statuses.usable) && statuses.usable > 0) return "keys-usable";
      } catch (_) { /* Never persist raw values. */ }
      return "keys-other";
    }
    return null;
  }

  function normalizeSessionClosedReason(reason) {
    if (reason === undefined) return "reason-unavailable";
    if (typeof reason !== "string") return "reason-invalid";
    return SESSION_CLOSED_REASONS.includes(reason) ? reason : "reason-unknown";
  }

  function normalizeSessionType(value) {
    if (value === undefined) return "temporary";
    return typeof value === "string" && SESSION_TYPE_LABELS.includes(value)
      ? value : "session-type-unavailable";
  }

  function describeSessionClosure(metadata) {
    const calls = metadata.closeCalled && metadata.removeCalled ? "close+remove"
      : metadata.closeCalled ? "close" : metadata.removeCalled ? "remove" : "none";
    // These are observed call attempts, not proof of success or closure causality.
    return `closed: ${metadata.closedReason}; app-requested=${calls}`;
  }

  function summarizeSessionStatuses(sessions) {
    const statuses = Object.create(null);
    for (const session of sessions || []) {
      if (session.closed) continue;
      for (const [status, count] of Object.entries(session.statuses)) {
        statuses[status] = (statuses[status] || 0) + count;
      }
    }
    return statuses;
  }

  function readCheckpoint(raw) {
    try {
      if (typeof raw !== "string" || raw.length > 4096) return null;
      const value = JSON.parse(raw);
      if (!/^\d+\.\d+\.\d+$/.test(value.version) || !isExperimentalMode(value.mode) || !Array.isArray(value.steps)) return null;
      return { version: value.version, mode: value.mode, steps: value.steps.slice(-8).filter((step) =>
        Number.isFinite(step?.time) && step.time >= 0 && step.time <= 8640000000000000 && CHECKPOINT_PHASES.includes(step?.phase)
      ).map(({ time, phase }) => ({ time, phase })) };
    } catch (_) { return null; }
  }

  function planEmeRequest(keySystem, configurations, mode) {
    const knownPlayReady = ["com.microsoft.playready", "com.microsoft.playready.recommendation", HARDWARE_PLAYREADY];
    const plan = getModePlan(mode);
    if (plan.sdkRecommendationFlow && knownPlayReady.includes(keySystem)) {
      // The SDK's recommendation flow requests identifiers by default. Tighten
      // that policy before calling the real CDM; never fake a supported result.
      const blocked = { keySystem, configurations, changed: false, blocked: true };
      try {
        if (!Array.isArray(configurations)) return blocked;
        const length = Object.getOwnPropertyDescriptor(configurations, "length")?.value;
        if (!Number.isInteger(length) || length < 1 || length > 16) return blocked;
        const restricted = [];
        for (let index = 0; index < length; index += 1) {
          const entry = Object.getOwnPropertyDescriptor(configurations, String(index));
          if (!entry || !Object.prototype.hasOwnProperty.call(entry, "value")) return blocked;
          const configuration = entry.value;
          if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return blocked;
          const prototype = Object.getPrototypeOf(configuration);
          if (prototype !== null && prototype !== Object.prototype) return blocked;
          const descriptors = Object.getOwnPropertyDescriptors(configuration);
          if (Reflect.ownKeys(descriptors).some((key) => !Object.prototype.hasOwnProperty.call(descriptors[key], "value"))) return blocked;
          descriptors.distinctiveIdentifier = {
            configurable: true, enumerable: true, writable: true,
            ...descriptors.distinctiveIdentifier, value: "not-allowed",
          };
          restricted.push(Object.create(prototype, descriptors));
        }
        return { keySystem, configurations: restricted, changed: true };
      } catch (_) { return blocked; }
    }
    if (!plan.hardwarePlayReady || !knownPlayReady.includes(keySystem)
      || !Array.isArray(configurations)) {
      return { keySystem, configurations, changed: false };
    }
    // The .3000 key system itself requires hardware protection. Numeric robustness
    // belongs to the legacy key system. Preserve codecs, encryption and session policy.
    const normalizeCapabilities = (capabilities) => capabilities.map((capability) => {
      const copy = { ...capability };
      if (copy.robustness === "2000" || copy.robustness === "3000") delete copy.robustness;
      return copy;
    });
    return {
      keySystem: HARDWARE_PLAYREADY,
      configurations: configurations.map((configuration) => ({
        ...configuration,
        ...(plan.persistentSession ? { sessionTypes: ["persistent-license"], persistentState: "required" } : {}),
        ...(Array.isArray(configuration.videoCapabilities)
          ? { videoCapabilities: normalizeCapabilities(configuration.videoCapabilities) } : {}),
        ...(Array.isArray(configuration.audioCapabilities)
          ? { audioCapabilities: normalizeCapabilities(configuration.audioCapabilities) } : {}),
      })),
      changed: true,
      sessionTypeOverride: plan.persistentSession ? "persistent-license" : null,
    };
  }

  function planSessionArguments(args, metadata) {
    // Explicit opt-in compatibility test for MF_TYPE_ERR. The CDM still enforces
    // the issued license; no license bytes, IDs, native promises or errors change.
    if (metadata?.keySystem !== HARDWARE_PLAYREADY || metadata.sessionTypeOverride !== "persistent-license"
      || !(args.length === 0 || args[0] === undefined || args[0] === "temporary")) return args;
    return ["persistent-license", ...args.slice(1)];
  }

  function describeSessionPolicy(configuration) {
    if (!configuration || typeof configuration !== "object") return "不明";
    const knownSessions = ["temporary", "persistent-license"];
    const sessions = Array.isArray(configuration.sessionTypes)
      ? configuration.sessionTypes.filter((type) => knownSessions.includes(type)).join(",") || "未指定/未知"
      : "未指定";
    const persistence = ["required", "optional", "not-allowed"].includes(configuration.persistentState)
      ? configuration.persistentState : "未指定/未知";
    const identifier = ["required", "optional", "not-allowed"].includes(configuration.distinctiveIdentifier)
      ? configuration.distinctiveIdentifier : "未指定/未知";
    return `sessionTypes=${sessions}; persistentState=${persistence}; distinctiveIdentifier=${identifier}`;
  }

  function updateFailureHresult(error) {
    const message = error && error.message ? String(error.message) : "";
    const match = message.match(/\bUpdate failed \((0x[0-9a-f]{8}|\d{10}|-\d{9,10})\)/i);
    if (!match) return "";
    const value = Number(match[1]);
    if (!Number.isInteger(value) || value < -2147483648 || value > 4294967295) return "";
    return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
  }

  function safeError(error) {
    const name = error && error.name ? String(error.name) : "Error";
    const message = error && error.message ? String(error.message) : String(error || "");
    const hresult = updateFailureHresult(error);
    return `${name}: ${message}${hresult ? ` [${hresult}]` : ""}`.replace(/https?:\/\/[^\s"'<>]+/gi, "[URL省略]")
      .replace(/[A-Za-z0-9_+/=-]{80,}/g, "[長い値省略]").slice(0, 350);
  }

  function rewritePlaybackUrl(rawUrl, mode = DEFAULT_MODE, baseUrl) {
    const original = String(rawUrl);
    const fallbackBase = baseUrl || "https://www.disneyplus.com/";

    try {
      const parsed = new URL(original, fallbackBase);
      const match = parsed.hostname === PLAYBACK_HOST
        ? parsed.pathname.match(PLAYBACK_PATH)
        : null;

      if (!match) {
        return {
          url: original,
          isPlayback: false,
          changed: false,
          eligible: false,
          fromScenario: null,
          toScenario: null,
        };
      }

      const plan = getModePlan(mode);
      const fromScenario = match[1];
      const eligible = MUTABLE_SCENARIOS.has(fromScenario);
      if (!eligible) {
        return {
          url: original,
          isPlayback: true,
          changed: false,
          eligible: false,
          fromScenario,
          toScenario: fromScenario,
        };
      }
      if (!plan.scenario) {
        return {
          url: original,
          isPlayback: true,
          changed: false,
          eligible: true,
          fromScenario,
          toScenario: fromScenario,
        };
      }

      parsed.pathname = `/v7/playback/${plan.scenario}`;
      return {
        url: parsed.href,
        isPlayback: true,
        changed: fromScenario !== plan.scenario,
        eligible: true,
        fromScenario,
        toScenario: plan.scenario,
      };
    } catch (_error) {
      return {
        url: original,
        isPlayback: false,
        changed: false,
        eligible: false,
        fromScenario: null,
        toScenario: null,
      };
    }
  }

  function forceResolution(root, targetResolution) {
    if (!root || typeof root !== "object" || !targetResolution) {
      return 0;
    }

    const attributes = root.playback && typeof root.playback === "object"
      && root.playback.attributes && typeof root.playback.attributes === "object"
      && !Array.isArray(root.playback.attributes)
      ? root.playback.attributes
      : null;
    if (!attributes) return 0;

    const selectionKeys = [
      "audioTypes",
      "hdrTypes",
      "codecs",
      "protocol",
      "ads",
      "frameRates",
      "assetInsertionStrategies",
      "resolution",
    ];
    if (!selectionKeys.some((key) => Object.prototype.hasOwnProperty.call(attributes, key))) {
      return 0;
    }

    const resolution = attributes.resolution;
    if (resolution === undefined || resolution === null) {
      attributes.resolution = { max: [targetResolution] };
      return 1;
    }
    if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
      return 0;
    }
    if (Array.isArray(resolution.max)
      && resolution.max.length === 1
      && resolution.max[0] === targetResolution) {
      return 0;
    }
    resolution.max = [targetResolution];
    return 1;
  }

  function rewritePlaybackBody(body, mode = DEFAULT_MODE) {
    const plan = getModePlan(mode);
    if (!plan.resolution || typeof body !== "string" || body.length === 0) {
      return { body, changed: false, edits: 0, resolutionMatched: false, error: null };
    }

    try {
      const parsed = JSON.parse(body);
      const edits = forceResolution(parsed, plan.resolution);
      const maximum = parsed?.playback?.attributes?.resolution?.max;
      return {
        body: edits > 0 ? JSON.stringify(parsed) : body,
        changed: edits > 0,
        edits,
        resolutionMatched: Array.isArray(maximum) && maximum.length === 1 && maximum[0] === plan.resolution,
        error: null,
      };
    } catch (error) {
      return {
        body,
        changed: false,
        edits: 0,
        resolutionMatched: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function extractMaxResolution(text) {
    if (typeof text !== "string" || text.length === 0) {
      return null;
    }

    const candidates = [];
    const add = (width, height) => {
      const w = Number(width);
      const h = Number(height);
      if (Number.isFinite(w) && Number.isFinite(h) && w >= 320 && h >= 180) {
        candidates.push({ width: w, height: h });
      }
    };

    for (const match of text.matchAll(/RESOLUTION\s*=\s*(\d{3,5})\s*x\s*(\d{3,5})/gi)) {
      add(match[1], match[2]);
    }

    for (const match of text.matchAll(/<Representation\b[^>]*>/gi)) {
      const tag = match[0];
      const width = tag.match(/\bwidth\s*=\s*["'](\d{3,5})["']/i);
      const height = tag.match(/\bheight\s*=\s*["'](\d{3,5})["']/i);
      if (width && height) {
        add(width[1], height[1]);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates.reduce((best, candidate) => (
      candidate.width * candidate.height > best.width * best.height ? candidate : best
    ));
  }

  function extractHlsPlaybackResolutions(text) {
    // Read declarations only, never fetch a playlist or modify its contents.
    // RFC 8216 distinguishes normal variants from I-frame trick-play variants.
    if (typeof text !== "string" || text.length > 2 * 1024 * 1024
      || !/^\uFEFF?#EXTM3U(?:\r?\n|$)/.test(text)) return [];
    const lines = text.split(/\r?\n/);
    const resolutions = new Map();
    for (let index = 1; index < lines.length; index += 1) {
      if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
      const attributes = lines[index].slice("#EXT-X-STREAM-INF:".length);
      const fields = Object.create(null);
      const fieldPattern = /(?:^|,)([A-Z0-9-]+)=("[^"\r\n]*"|[^,"\r\n]*)/g;
      let position = 0;
      let valid = true;
      for (const field of attributes.matchAll(fieldPattern)) {
        if (field.index !== position || Object.prototype.hasOwnProperty.call(fields, field[1])) {
          valid = false;
          break;
        }
        fields[field[1]] = field[2];
        position = field.index + field[0].length;
      }
      if (!valid || position !== attributes.length) continue;
      const size = /^(\d{3,5})x(\d{3,5})$/.exec(fields.RESOLUTION || "");
      if (!size || Number(size[1]) < 320 || Number(size[2]) < 180) continue;
      // A declaration without its following media-playlist URI is incomplete.
      let next = index + 1;
      while (next < lines.length && (!lines[next].trim()
        || (lines[next].startsWith("#") && !lines[next].startsWith("#EXT")))) next += 1;
      if (next >= lines.length || lines[next].startsWith("#") || /\s/.test(lines[next])) continue;
      const width = Number(size[1]);
      const height = Number(size[2]);
      resolutions.set(`${width}x${height}`, { width, height });
    }
    return [...resolutions.values()]
      .sort((left, right) => right.width * right.height - left.width * left.height)
      .slice(0, 20);
  }

  function isManifestUrl(rawUrl, baseUrl) {
    try {
      const parsed = new URL(String(rawUrl), baseUrl || "https://www.disneyplus.com/");
      const path = parsed.pathname.toLowerCase();
      return path.endsWith(".m3u8") || path.endsWith(".mpd");
    } catch (_error) {
      return false;
    }
  }

  function summarizeHlsKeyDeclarations(text) {
    // Declarations only, not distinct keys, SDK prefetch execution, or rotation
    // evidence. Keep counts only; never return URI, KID, date-range ID or data.
    if (typeof text !== "string" || text.length > 2 * 1024 * 1024
      || !/^\uFEFF?#EXTM3U(?:\r?\n|$)/.test(text)) return null;
    const lines = text.split(/\r?\n/);
    if (lines.length > 20000) return null;
    const result = { mediaKeyTags: 0, sessionKeyTags: 0, prefetchDateRanges: 0 };
    for (const line of lines) {
      if (line.startsWith("#EXT-X-KEY:")) result.mediaKeyTags += 1;
      if (line.startsWith("#EXT-X-SESSION-KEY:")) result.sessionKeyTags += 1;
      if (!line.startsWith("#EXT-X-DATERANGE:")) continue;
      const attributes = line.slice("#EXT-X-DATERANGE:".length);
      const fields = new Set();
      let position = 0;
      let valid = true;
      let prefetch = false;
      for (const field of attributes.matchAll(/(?:^|,)([A-Z0-9-]+)=("[^"\r\n]*"|[^,"\r\n]*)/g)) {
        if (field.index !== position || fields.has(field[1]) || fields.size >= 128) {
          valid = false;
          break;
        }
        fields.add(field[1]);
        if (field[1] === "X-TYPE" && field[2] === '"PREFETCH-KEY"') prefetch = true;
        position = field.index + field[0].length;
      }
      if (valid && position === attributes.length && prefetch) result.prefetchDateRanges += 1;
    }
    return result;
  }

  function measure4kProgress(previous, sample) {
    // videoWidth/videoHeight also exist at HAVE_METADATA with zero decoded frames.
    // Require advancing non-dropped frame counts and media time for 5 seconds.
    // This is conservative browser-reported evidence, not an HDCP/HDR/output test.
    const empty = { confirmed: false, elapsedMs: 0, frames: 0, sample: null };
    if (!sample || !(sample.width >= 3840 && sample.height >= 2160)
      || !(sample.readyState >= 2) || sample.paused || sample.ended || sample.seeking || sample.hasError
      || !Number.isFinite(sample.now) || !Number.isFinite(sample.currentTime)
      || !Number.isFinite(sample.total) || !Number.isFinite(sample.dropped)
      || sample.total < 0 || sample.dropped < 0 || sample.dropped > sample.total) return empty;
    const current = { ...sample, rendered: sample.total - sample.dropped };
    const before = previous?.sample;
    if (!before || before.element !== sample.element || before.source !== sample.source
      || before.generation !== sample.generation
      || before.width !== sample.width || before.height !== sample.height
      || sample.now <= before.now || sample.now - before.now > 2500
      || sample.currentTime <= before.currentTime
      || sample.currentTime - before.currentTime > 5
      || sample.total < before.total || sample.dropped < before.dropped
      || current.rendered <= before.rendered) return { ...empty, sample: current };
    const elapsedMs = previous.elapsedMs + sample.now - before.now;
    const frames = previous.frames + current.rendered - before.rendered;
    return { confirmed: elapsedMs >= 5000 && frames > 0, elapsedMs, frames, sample: current };
  }

  function intentionalStopLabel(stopped, reason, hasMediaError) {
    if (!stopped || hasMediaError) return "";
    if (reason === "time-limit-75s" || reason === "time-limit-30s") return "比較の時間制限で停止・4K継続再生の判定は終了";
    if (reason === "second-generate-forbidden") return "第2鍵要求の前に比較停止・継続再生の判定は終了";
    if (reason === "manifest-probe-complete") return "候補一覧の診断を完了・復号/4K再生は未実施";
    return "";
  }

  if (globalThis.__DP4K_TEST__) {
    globalThis.__DP4K_INTERNALS__ = Object.freeze({
      MODE_PLANS,
      getModePlan,
      inspectSdkCapabilities,
      inspectSdkKeyConfiguration,
      inspectSdkSessionKeyConfiguration,
      planPlaybackSessionOptions,
      planSdkResolutionPolicy,
      rewritePlaybackUrl,
      forceResolution,
      rewritePlaybackBody,
      extractMaxResolution,
      extractHlsPlaybackResolutions,
      summarizeHlsKeyDeclarations,
      isManifestUrl,
      planEmeRequest,
      planSessionArguments,
      describeSessionPolicy,
      safeError,
      updateFailureHresult,
      measure4kProgress,
      intentionalStopLabel,
      isExperimentalMode,
      consumeStartupMode,
      prepareModeReload,
      checkpointPhase,
      readCheckpoint,
      normalizeSessionClosedReason,
      describeSessionClosure,
      summarizeSessionStatuses,
      STORAGE_KEY,
      TEST_TICKET_KEY,
      CHECKPOINT_KEY,
    });
    return;
  }

  if (globalThis[INSTALL_GUARD]) {
    return;
  }
  Object.defineProperty(globalThis, INSTALL_GUARD, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  function readStartup() {
    try {
      const navigationType = globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type;
      return consumeStartupMode(localStorage, sessionStorage, location.href, Date.now(), navigationType);
    } catch (_error) {
      return { mode: DEFAULT_MODE, notice: "設定領域を利用できないため、無変更で起動しました。" };
    }
  }

  const startup = readStartup();
  const state = {
    mode: startup.mode,
    guardNotice: startup.notice,
    modeReloadPending: false,
    retiredDocument: false,
    previousCheckpoint: null,
    checkpointSteps: [],
    playbackRequests: 0,
    lastRewrite: "再生待ち",
    bodyEdits: 0,
    bodyResolutionStatus: "再生要求待ち",
    sdkConfigEdits: 0,
    sdkConfigAttempt: 0,
    sdkConfigReady: false,
    sdkConfigStatus: "未適用",
    sdkKeyConfiguration: null,
    sdkKeyConfigurationStatus: "未観測",
    sdkSessionKeyConfiguration: null,
    sdkSessionKeyConfigurationStatus: "未観測",
    sdkUhdHookArmed: false,
    sdkUhdServiceStarted: false,
    sdkUhdConstructed: false,
    sdkUhdPolicyReady: false,
    sdkUhdPolicyStatus: "未適用",
    sdkCapabilityStatus: "未観測",
    singleVariantNetworkReady: false,
    singleVariantSdkStarted: false,
    singleVariantPlaybackSent: false,
    singleVariantAccepted: false,
    singleVariantFailed: false,
    singleVariantStatus: "未使用",
    singleVariantProbeResult: "未観測",
    singleVariantRangeSummary: "未観測",
    singleVariantSourceCount: 0,
    singleVariantCandidateCount: 0,
    singleVariantMasters: 0,
    singleVariantGenerateCalls: 0,
    singleVariantGuardSnapshot: "未観測",
    manifestMax: null,
    hlsKeyDeclarations: null,
    hlsPlaybackResolutions: [],
    manifestUrl: "",
    video: null,
    progress4k: measure4kProgress(null, null),
    playbackBlocked: false,
    emeAttempts: [],
    mseTypes: [],
    lastError: "",
    mediaErrors: [],
    events: [],
    network: [],
    environment: "未チェック",
    overlay: null,
    debugVisible: false,
  };
  const accessMetadata = new WeakMap();
  const keysMetadata = new WeakMap();
  const videoKeys = new WeakMap();
  const observedVideos = new WeakSet();
  const sessionMetadata = new WeakMap();
  let nextSession = 0;
  let nativeEmeRequest = null;
  let guardedEmeRequest = null;
  let sdkUhdPublicationSetter = null;
  let sdkUhdNamespace = null;
  let sdkUhdConstructor = null;
  let sdkUhdExportGetter = null;
  let singleVariantFetch = null;
  let singleVariantXhr = null;
  let singleVariantEmeGuard = null;
  let singleVariantTimer = null;
  let singleVariantFetchDispatch = null;

  function singleVariantMode() {
    const plan = getModePlan(state.mode);
    return Boolean(plan.singleFhdVariant || plan.singleSdrProbe || plan.singleHdrVariant);
  }

  function stopSingleVariant(reason) {
    if (!singleVariantMode() || state.singleVariantFailed) return;
    state.singleVariantFailed = true;
    state.singleVariantAccepted = false;
    state.playbackBlocked = true;
    state.singleVariantStatus = reason;
    if (singleVariantTimer !== null) clearTimeout(singleVariantTimer);
    singleVariantTimer = null;
    if (getModePlan(state.mode).continuousFhd && !state.retiredDocument) {
      // Do not automatically re-arm a failed full-HD session on the next load.
      // A late callback from a departed page must not clear the preference
      // that the next page is already using.
      safelyObserve(() => {
        if (localStorage.getItem(STORAGE_KEY) === "fullhd") storeMode(localStorage, DEFAULT_MODE);
      });
    }
    // A fixed classification only. Never retain the manifest, URL, or native
    // error/challenge/license content. Do not close/remove native sessions.
    recordEvent("単一候補比較停止", reason);
    for (const video of document.querySelectorAll("video")) safelyObserve(() => video.pause());
  }

  function singleVariantAbort(reason) {
    stopSingleVariant(reason);
    return new DOMException("単一候補比較の確認条件を満たさないため中止しました", "AbortError");
  }

  function isSingleVariantRuntimeIntact() {
    try {
      const conditions = {
        network: state.singleVariantNetworkReady,
        active: !state.singleVariantFailed && !state.retiredDocument,
        fetch: globalThis.fetch === singleVariantFetch,
        xhr: globalThis.XMLHttpRequest === singleVariantXhr,
        eme: Boolean(singleVariantEmeGuard)
          && Object.getOwnPropertyDescriptor(globalThis.MediaKeySession?.prototype, "generateRequest")?.value === singleVariantEmeGuard,
      };
      if (!state.singleVariantFailed) {
        state.singleVariantGuardSnapshot = Object.entries(conditions).map(([name, value]) => `${name}=${Boolean(value)}`).join(", ");
      }
      return Object.values(conditions).every(Boolean);
    } catch (_) { return false; }
  }

  function beginSingleVariantSdk() {
    if (!singleVariantMode()) return;
    if (getModePlan(state.mode).continuousFhd && state.singleVariantSdkStarted
      && !state.singleVariantFailed && !state.retiredDocument) {
      if (!isSingleVariantRuntimeIntact() || !isEmeIdentifierGuardActive()) throw singleVariantAbort("sdk-start-guard");
      // Keep the already-installed boundary. Normal site-created sessions are
      // not a one-shot experiment; the helper itself never creates/retries one.
      return;
    }
    if (state.singleVariantSdkStarted || state.singleVariantFailed || state.retiredDocument) {
      throw singleVariantAbort("sdk-start-guard");
    }
    // The page installs an outer fetch wrapper during startup. Install the
    // final transport boundary only once, immediately before native SDK create,
    // preserving that wrapper rather than silently treating it as equivalent.
    // EME and the pre-SDK playback POST gate have been active since document-start.
    if (globalThis.XMLHttpRequest !== NativeXhr || globalThis.Request !== NativeRequest || !singleVariantEmeGuard
      || Object.getOwnPropertyDescriptor(globalThis.MediaKeySession?.prototype, "generateRequest")?.value !== singleVariantEmeGuard
      || !isEmeIdentifierGuardActive()) {
      throw singleVariantAbort("sdk-preinstall-guard");
    }
    if (!installFetchObserver()) throw singleVariantAbort("fetch-install-failed");
    installSingleVariantNetwork();
    if (!isSingleVariantRuntimeIntact()) throw singleVariantAbort("sdk-start-guard");
    state.singleVariantSdkStarted = true;
    const plan = getModePlan(state.mode);
    const hdrLimited = Boolean(plan.singleHdrVariant);
    if (plan.continuousFhd) {
      state.singleVariantStatus = "フルHD master待機（再生時間制限なし・自動再試行なし）";
      return;
    }
    state.singleVariantStatus = hdrLimited
      ? "master待機（30秒・generateRequest 1回・自動再試行なし）"
      : "master待機（75秒・自動再試行なし）";
    singleVariantTimer = setTimeout(() => stopSingleVariant(hdrLimited ? "time-limit-30s" : "time-limit-75s"), hdrLimited ? 30000 : 75000);
  }

  function assertSingleVariantPlayback(rewrite, bodyResult) {
    if (!singleVariantMode()) return;
    if (!isSingleVariantRuntimeIntact() || !state.singleVariantSdkStarted
      || (!getModePlan(state.mode).continuousFhd && state.singleVariantPlaybackSent)
      || !rewrite.eligible || !bodyResult?.resolutionMatched) {
      throw singleVariantAbort("playback-post-guard");
    }
    state.singleVariantPlaybackSent = true;
  }

  function installSingleVariantNetwork() {
    if (!singleVariantMode()) return;
    try {
      const adapter = createSingleVariantNetworkAdapter({
        enabled: singleVariantMode,
        // A captured adapter must not accept a master after its installed outer
        // boundary was replaced, even before another POST or EME call notices.
        retired: () => !isSingleVariantRuntimeIntact(),
        isManifestUrl: (url) => isManifestUrl(url, location.href),
        parser: (text) => {
          if (!state.singleVariantPlaybackSent || state.singleVariantFailed || state.retiredDocument) {
            return { kind: "reject" };
          }
          const plan = getModePlan(state.mode);
          const selected = plan.singleHdrVariant ? selectSingleHdrUhdVariant(text)
            : plan.singleSdrProbe ? selectSingleUhdVariant(text) : selectSingleFhdVariant(text);
          if (plan.singleSdrProbe) {
            // Read only bounded numeric/enum diagnostics from the original
            // master. Never pass a master/media playlist onward in probe mode,
            // even if it contains an explicitly SDR 4K candidate.
            updateManifest(text, "");
            state.singleVariantSourceCount = selected.variantCount;
            state.singleVariantCandidateCount = selected.candidateCount;
            state.singleVariantProbeResult = selected.reason;
            const ranges = summarizeUhdVariantRanges(text);
            state.singleVariantRangeSummary = `${ranges.status} / total=${ranges.total}, SDR=${ranges.sdr}, PQ=${ranges.pq}, HLG=${ranges.hlg}, absent=${ranges.unspecified}, unknown=${ranges.unknown}`;
            state.singleVariantStatus = ["selected-compatible-variant", "already-single-compatible", "no-compatible-candidate", "ambiguous-candidate"].includes(selected.reason)
              ? "manifest-probe-complete" : selected.reason;
            recordEvent("4K SDR候補診断", `${selected.reason} / 通常variant=${selected.variantCount}, SDR適合=${selected.candidateCount}（再生へ渡さず中止）`);
            return { kind: "reject" };
          }
          if (selected.reason === "media-playlist") {
            updateManifest(text, "");
            return { kind: "media" };
          }
          state.singleVariantSourceCount = selected.variantCount;
          state.singleVariantCandidateCount = selected.candidateCount;
          state.singleVariantStatus = selected.reason;
          if ((!plan.continuousFhd && state.singleVariantMasters !== 0)
            || !["selected-compatible-variant", "already-single-compatible"].includes(selected.reason)) {
            return { kind: "reject" };
          }
          updateManifest(selected.text, "");
          return { kind: "master", changed: selected.changed, text: selected.text };
        },
        onDecision: ({ kind, channel }) => {
          if (kind !== "master-rewritten" && kind !== "master-unchanged") return;
          if (state.singleVariantFailed || state.retiredDocument
            || (!getModePlan(state.mode).continuousFhd && state.singleVariantMasters !== 0)) {
            stopSingleVariant("duplicate-master");
            return;
          }
          state.singleVariantMasters++;
          state.singleVariantAccepted = true;
          const target = getModePlan(state.mode).singleHdrVariant ? "3840x2160 PQ HEVC/AAC" : "1920x1080 SDR HEVC/AAC";
          state.singleVariantStatus = `${kind}/${channel}: ${state.singleVariantSourceCount} → 1（候補${state.singleVariantCandidateCount}・${target}）`;
          recordEvent("HLS単一候補確認", state.singleVariantStatus);
        },
        onFailure: ({ kind }) => {
          // Preserve the selector's fixed rejection reason in the diagnostic.
          const reason = kind === "parser-rejected" ? state.singleVariantStatus : kind;
          stopSingleVariant(reason);
        },
      });
      const fetch = adapter.wrapFetch(globalThis.fetch);
      const Xhr = adapter.wrapXMLHttpRequest(globalThis.XMLHttpRequest);
      Object.defineProperty(globalThis, "fetch", { value: fetch, writable: true, configurable: true, enumerable: true });
      Object.defineProperty(globalThis, "XMLHttpRequest", { value: Xhr, writable: true, configurable: true, enumerable: false });
      singleVariantFetch = fetch;
      singleVariantXhr = Xhr;
      state.singleVariantNetworkReady = true;
      state.singleVariantStatus = "通信ガード準備済み・master未確認";
    } catch (_) {
      stopSingleVariant("network-install-failed");
    }
  }

  function isSdkResolutionHookIntact() {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, "playback-session");
      if (!descriptor) return false;
      if (sdkUhdNamespace) {
        const exported = Object.getOwnPropertyDescriptor(sdkUhdNamespace, "PlaybackSession");
        return descriptor.value === sdkUhdNamespace && (exported && Object.prototype.hasOwnProperty.call(exported, "value")
          ? exported.value === sdkUhdConstructor
          : Boolean(sdkUhdExportGetter && exported?.get === sdkUhdExportGetter && exported.set === undefined));
      }
      return Boolean(sdkUhdPublicationSetter && descriptor.set === sdkUhdPublicationSetter);
    } catch (_) { return false; }
  }

  function isSdkResolutionPolicyReady() {
    return state.sdkUhdPolicyReady && isSdkResolutionHookIntact() && !state.retiredDocument;
  }

  function isEmeIdentifierGuardActive() {
    if (!guardedEmeRequest) return false;
    try {
      let owner = navigator;
      while (owner) {
        const descriptor = Object.getOwnPropertyDescriptor(owner, "requestMediaKeySystemAccess");
        if (descriptor) return Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.value === guardedEmeRequest;
        owner = Object.getPrototypeOf(owner);
      }
    } catch (_) { /* An unknown or replaced API must not enable the SDK flow. */ }
    return false;
  }

  function safelyObserve(callback) {
    try { return callback(); } catch (_) { /* Diagnostics must never change playback results. */ }
  }

  function saveCheckpoint(phase) {
    if (!isExperimentalMode(state.mode) || !CHECKPOINT_PHASES.includes(phase)) return;
    safelyObserve(() => {
      state.checkpointSteps.push({ time: Date.now(), phase });
      state.checkpointSteps = state.checkpointSteps.slice(-8);
      // Stage names and time only: no URL, title, account, error text, IDs or bytes.
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: VERSION, mode: state.mode, steps: state.checkpointSteps }));
    });
  }

  safelyObserve(() => { state.previousCheckpoint = readCheckpoint(localStorage.getItem(CHECKPOINT_KEY)); });
  saveCheckpoint("test-start");

  function recordEvent(stage, detail) {
    safelyObserve(() => {
      saveCheckpoint(checkpointPhase(stage, detail));
      state.events.push(`${new Date().toISOString().slice(11, 19)} ${stage}: ${detail}`);
      state.events = state.events.slice(-30);
      renderOverlay();
    });
  }

  function recordMediaError(stage, error) {
    safelyObserve(() => {
      state.playbackBlocked = true;
      state.progress4k = measure4kProgress(null, null);
      if (getModePlan(state.mode).singleHdrVariant || getModePlan(state.mode).continuousFhd) stopSingleVariant("media-error");
      const value = `${stage}: ${safeError(error)}`;
      if (!state.mediaErrors.includes(value)) {
        state.mediaErrors.push(value);
        state.mediaErrors = state.mediaErrors.slice(-10);
        recordEvent("再生エラー", value);
      }
    });
  }

  function observePromise(result, success, failure) {
    safelyObserve(() => {
      const safely = (callback, value) => safelyObserve(() => { if (callback) callback(value); });
      if (result && typeof result.then === "function") {
        result.then((value) => safely(success, value), (error) => safely(failure, error));
      } else safely(success, result);
    });
    return result;
  }

  function observeNativePromise(result, success, failure, unavailable) {
    const safely = (callback, value) => safelyObserve(() => { if (callback) callback(value); });
    try {
      // Do not invoke an arbitrary result.then getter or a foreign thenable.
      Reflect.apply(capturedPromiseThen, result, [
        (value) => safely(success, value), (error) => safely(failure, error),
      ]);
    } catch (_) { safely(unavailable); }
    return result;
  }

  function installSdkResolutionPolicy() {
    if (!getModePlan(state.mode).sdkUhdPolicy) return;
    const globalName = "playback-session";
    const fail = (message) => {
      state.sdkUhdPolicyReady = false;
      state.sdkUhdPolicyStatus = message;
      state.lastError = message;
      state.playbackBlocked = true;
      renderOverlay();
      return new DOMException(message, "AbortError");
    };
    // The real bundle publishes a read-only webpack getter. Its export object
    // cannot be patched in place. Intercept its one UMD publication and return
    // a namespace copy with only the constructor replaced. Do not alter the
    // service instance, global prototypes, bundle source or native capability APIs.
    if (Object.getOwnPropertyDescriptor(globalThis, globalName)) {
      state.sdkUhdPolicyStatus = "セッションSDKが公開済みのためUHD比較を中止";
      return;
    }
    sdkUhdPublicationSetter = (exported) => {
      try {
        const scriptUrl = new URL(document.currentScript?.src || "");
        if (scriptUrl.protocol !== "https:" || scriptUrl.hostname !== "hiveplayer-static.bamgrid.com"
          || scriptUrl.port || scriptUrl.username || scriptUrl.password || scriptUrl.search || scriptUrl.hash
          || scriptUrl.pathname !== `/artifacts/hive/playback-session/${SUPPORTED_PLAYBACK_SDK}/all_browser_es6/playback-session.js`) {
          throw new Error("Unsupported session SDK source");
        }
        if (!exported || typeof exported !== "object" || Array.isArray(exported)
          || Object.getPrototypeOf(exported) !== Object.prototype) throw new Error("Unknown session SDK export");
        const descriptors = Object.getOwnPropertyDescriptors(exported);
        const entry = descriptors.PlaybackSession;
        // Invoke only the known webpack export getter, after matching the
        // exact public SDK script URL. Other export getters are never called.
        const NativeSession = entry && Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value
          : entry && typeof entry.get === "function" && entry.set === undefined ? Reflect.apply(entry.get, exported, []) : null;
        if (typeof NativeSession !== "function" || !NativeSession.prototype) throw new Error("Unknown SDK constructor");
        sdkUhdConstructor = new Proxy(NativeSession, {
          construct(target, args, newTarget) {
            if (state.retiredDocument || !state.sdkConfigReady || !state.sdkUhdServiceStarted
              || state.sdkUhdConstructed || !isSdkResolutionHookIntact() || !isEmeIdentifierGuardActive()) {
              throw fail("SDK選別ポリシーの適用条件を確認できず、セッション作成を中止");
            }
            const planned = planSdkResolutionPolicy(args[0], state.mode);
            if (!planned.valid) throw fail("未知のSDK解像度リスト・引数のためUHD比較を中止");
            const sessionKeyConfiguration = inspectSdkSessionKeyConfiguration(args[0]);
            state.sdkSessionKeyConfiguration = sessionKeyConfiguration;
            state.sdkSessionKeyConfigurationStatus = describeSdkSessionKeyConfiguration(sessionKeyConfiguration);
            state.sdkUhdConstructed = true;
            state.sdkUhdPolicyReady = true;
            state.sdkUhdPolicyStatus = `セッションのSDK選別リスト: ${planned.before.join("/")} → ${planned.after.join("/")}（${planned.changed ? "実験上書き" : "既指定"}・ブラウザ能力の証明ではない）`;
            recordEvent("SDK選別ポリシー", "セッション単位でUHD候補を許可（DRM・復号判定は維持）");
            try {
              return Reflect.construct(target, [planned.options, ...args.slice(1)], newTarget);
            } catch (error) {
              state.sdkUhdPolicyReady = false;
              state.sdkUhdPolicyStatus = "セッション構築失敗・UHD比較を中止";
              throw error;
            }
          },
        });
        if (Object.prototype.hasOwnProperty.call(entry, "value")) {
          descriptors.PlaybackSession = { ...entry, value: sdkUhdConstructor };
        } else {
          sdkUhdExportGetter = () => sdkUhdConstructor;
          descriptors.PlaybackSession = { ...entry, get: sdkUhdExportGetter };
        }
        sdkUhdNamespace = Object.create(Object.getPrototypeOf(exported), descriptors);
        Object.defineProperty(globalThis, globalName, {
          value: sdkUhdNamespace, configurable: true, enumerable: true, writable: true,
        });
      } catch (_) {
        // No unverified constructor may start the experimental playback path.
        // A fresh document restores the original SDK publication behavior.
        Object.defineProperty(globalThis, globalName, {
          value: undefined, configurable: true, enumerable: true, writable: true,
        });
        throw fail("対応セッションSDKを確認できず、UHD比較を中止");
      }
    };
    try {
      Object.defineProperty(globalThis, globalName, {
        configurable: true, enumerable: true, get: () => undefined, set: sdkUhdPublicationSetter,
      });
      state.sdkUhdHookArmed = true;
      state.sdkUhdPolicyStatus = "対応セッションSDKの公開待ち（選別ポリシーはまだ未変更）";
    } catch (_) {
      state.sdkUhdPolicyStatus = "セッションSDKを監視できずUHD比較を中止";
    }
  }

  function installPlaybackSdkOverride() {
    if (!getModePlan(state.mode).sdkMaxHeight && !getModePlan(state.mode).sdkInspectOnly) return;
    const globalName = "playback-service";
    const patchExport = (exported) => {
      try {
        const Service = exported?.PlaybackService;
        if (typeof Service !== "function" || Service.version !== SUPPORTED_PLAYBACK_SDK) {
          state.sdkConfigStatus = "対応SDKを確認できず、内部上限は未変更";
          renderOverlay();
          return;
        }
        const prototype = Service.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "createPlaybackSession");
        if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) return;
        const nativeCreate = descriptor.value;
        Object.defineProperty(prototype, "createPlaybackSession", {
          ...descriptor,
          value: function createPlaybackSession(...args) {
            try { beginSingleVariantSdk(); }
            catch (error) { return Promise.reject(error); }
            if (getModePlan(state.mode).sdkUhdPolicy) {
              if (state.sdkUhdServiceStarted || !state.sdkUhdHookArmed || !isSdkResolutionHookIntact()) {
                return Promise.reject(new DOMException("UHD比較は1ページ1セッション作成限定・適用条件外の作成を中止", "AbortError"));
              }
              state.sdkUhdServiceStarted = true;
            }
            const attempt = ++state.sdkConfigAttempt;
            state.sdkConfigReady = false;
            if (state.retiredDocument) {
              return Promise.reject(new DOMException("終了した実験ページのセッション作成を中止しました", "AbortError"));
            }
            if (getModePlan(state.mode).sdkInspectOnly) {
              const capabilities = inspectSdkCapabilities(this);
              const keyConfiguration = inspectSdkKeyConfiguration(this, args[0]);
              state.sdkKeyConfiguration = keyConfiguration;
              state.sdkKeyConfigurationStatus = describeSdkKeyConfiguration(keyConfiguration);
              state.sdkCapabilityStatus = capabilities
                ? `アダプター申告=${capabilities.adapter.join("/") || "なし"}; VOD=${capabilities.vod.join("/") || "なし"}（実再生能力の証明ではない）`
                : "対応する能力一覧を安全に取得できませんでした";
              state.sdkConfigStatus = "診断のみ・設定未変更・セッション作成前に中止";
              state.playbackBlocked = true;
              recordEvent("SDK能力診断", `セッション作成を中止（再生・ライセンス適用を試さない） / 鍵設定: ${state.sdkKeyConfigurationStatus}`);
              return Promise.reject(new DOMException("SDK能力診断のため再生セッションを作成せず中止しました", "AbortError"));
            }
            if (getModePlan(state.mode).sdkRecommendationFlow && !isEmeIdentifierGuardActive()) {
              state.sdkConfigStatus = "EME識別子ガードを確認できず、SDKのPlayReady比較を中止";
              state.lastError = state.sdkConfigStatus;
              state.playbackBlocked = true;
              renderOverlay();
              return Promise.reject(new DOMException(state.sdkConfigStatus, "AbortError"));
            }
            const planned = planPlaybackSessionOptions(args[0], state.mode);
            if (!planned.changed) {
              state.sdkConfigStatus = "引数を確認できず、内部上限は未変更";
              renderOverlay();
              if (singleVariantMode()) {
                return Promise.reject(singleVariantAbort("sdk-config-unrecognized"));
              }
              if (getModePlan(state.mode).sdkUhdPolicy) {
                return Promise.reject(new DOMException("SDK設定引数を確認できずUHD比較を中止", "AbortError"));
              }
              return Reflect.apply(nativeCreate, this, args);
            }
            state.sdkConfigEdits += 1;
            state.sdkConfigReady = true;
            const plan = getModePlan(state.mode);
            state.sdkConfigStatus = `VOD maxHeight=${plan.sdkMaxHeight} / resolution.max=${plan.resolution} の設定上書きを渡しました (${state.sdkConfigEdits}回・実再生は別判定)`;
            if (plan.sdkRecommendationFlow) {
              state.sdkConfigStatus += " / SDK PlayReady recommendation flowを有効化（EME識別子は禁止）";
            }
            recordEvent("SDK設定", `セッション単位のVOD上限を${plan.sdkMaxHeight}pへ設定`);
            const clearFailedAttempt = () => {
              if (state.sdkConfigAttempt !== attempt) return;
              state.sdkConfigReady = false;
              state.sdkConfigStatus = "設定上書き後のセッション作成に失敗（再生は未確認）";
              if (singleVariantMode()) stopSingleVariant("sdk-create-failed");
              if (getModePlan(state.mode).sdkUhdPolicy) {
                state.sdkUhdPolicyReady = false;
                state.sdkUhdPolicyStatus = "SDKセッション作成失敗・UHD比較を中止";
              }
              renderOverlay();
            };
            try {
              const result = Reflect.apply(nativeCreate, this, [planned.options, ...args.slice(1)]);
              return observePromise(result, null, clearFailedAttempt);
            } catch (error) {
              clearFailedAttempt();
              throw error;
            }
          },
        });
        state.sdkConfigStatus = "対応SDKのセッション作成を監視中（まだ設定未適用）";
        renderOverlay();
      } catch (_) {
        state.sdkConfigStatus = "SDKフックを設定できず、内部上限は未変更";
        renderOverlay();
      }
    };
    const existing = Object.getOwnPropertyDescriptor(globalThis, globalName);
    if (existing) {
      // Do not replace someone else's getter/setter or non-writable global.
      if (Object.prototype.hasOwnProperty.call(existing, "value")) patchExport(existing.value);
      return;
    }
    try {
      // UMD publishes this export synchronously. Restore a normal data property
      // immediately, before the app can use it; no polling or permanent setter.
      Object.defineProperty(globalThis, globalName, {
        configurable: true,
        enumerable: true,
        get: () => undefined,
        set: (value) => {
          Object.defineProperty(globalThis, globalName, { value, configurable: true, enumerable: true, writable: true });
          patchExport(value);
        },
      });
    } catch (_) { state.sdkConfigStatus = "SDK公開先を監視できず、内部上限は未変更"; }
  }

  function assertSdkOverrideForPlayback() {
    if (getModePlan(state.mode).sdkInspectOnly) {
      state.lastError = "SDK能力診断モードのため再生POSTを中止しました";
      state.playbackBlocked = true;
      renderOverlay();
      throw new DOMException(state.lastError, "AbortError");
    }
    if (getModePlan(state.mode).sdkRecommendationFlow && !isEmeIdentifierGuardActive()) {
      state.lastError = "EME識別子ガードを確認できないため、この比較モードの再生要求を中止しました";
      state.playbackBlocked = true;
      renderOverlay();
      throw new DOMException(state.lastError, "AbortError");
    }
    if (getModePlan(state.mode).sdkMaxHeight && !state.sdkConfigReady) {
      state.lastError = "SDKへ内部上限の設定上書きを渡せていないため、この比較モードの再生要求を中止しました";
      renderOverlay();
      throw new DOMException(state.lastError, "AbortError");
    }
    if (getModePlan(state.mode).sdkUhdPolicy && !isSdkResolutionPolicyReady()) {
      state.lastError = "SDK選別ポリシーの適用を確認できないため、UHD再生要求を中止しました";
      renderOverlay();
      throw new DOMException(state.lastError, "AbortError");
    }
  }

  installSdkResolutionPolicy();
  installPlaybackSdkOverride();

  function networkKind(rawUrl) {
    try {
      const url = new URL(String(rawUrl), location.href);
      if (url.hostname === PLAYBACK_HOST && PLAYBACK_PATH.test(url.pathname)) return "再生API";
      if (isManifestUrl(url.href)) return "manifest";
      if (/(^|\.)(bamgrid\.com|disneyplus\.com)$/.test(url.hostname)
        && /\/(?:license|licenses|playready|widevine|drm)(?:\/|$)/i.test(url.pathname)) return "ライセンスHTTP";
    } catch (_) { /* unrelated URL */ }
    return "";
  }

  function recordNetwork(url, status) {
    const kind = networkKind(url);
    if (!kind) return;
    const entry = `${kind}: ${status}`;
    if (state.network[state.network.length - 1] !== entry) {
      state.network.push(entry);
      state.network = state.network.slice(-12);
    }
    if (status === "通信失敗" || (typeof status === "number" && status >= 400)) {
      recordMediaError(kind, new Error(`HTTP ${status}`));
    }
    renderOverlay();
  }

  function displayScenario(scenario) {
    if (!scenario) return "—";
    return scenario.length > 37 ? `${scenario.slice(0, 34)}…` : scenario;
  }

  function reportPlaybackRequest(rewrite, bodyResult) {
    state.playbackRequests += 1;
    if (!singleVariantMode() || !state.singleVariantFailed) state.playbackBlocked = false;
    state.progress4k = measure4kProgress(null, null);
    state.manifestMax = null;
    state.hlsKeyDeclarations = null;
    state.hlsPlaybackResolutions = [];
    state.manifestUrl = "";
    state.bodyEdits += bodyResult && bodyResult.edits ? bodyResult.edits : 0;
    const resolution = getModePlan(state.mode).resolution;
    state.bodyResolutionStatus = !rewrite.eligible || !resolution ? "変更対象外"
      : bodyResult?.resolutionMatched
        ? `${resolution}（${bodyResult.changed ? "本文を書き換え" : "要求元で指定済み・本文は保持"}）`
        : "対象の上限を確認できませんでした";
    state.lastRewrite = rewrite.changed
      ? `${displayScenario(rewrite.fromScenario)} → ${displayScenario(rewrite.toScenario)}`
      : displayScenario(rewrite.fromScenario);
    if (!rewrite.eligible) {
      state.lastError = "未知のplayback scenarioのため要求を変更していません";
    } else if (bodyResult && bodyResult.error) {
      state.lastError = "再生JSONは解析できなかったため、本文は変更していません";
    } else if (bodyResult && resolution && !bodyResult.changed && !bodyResult.resolutionMatched) {
      state.lastError = "確認済みのplayback.attributes.resolutionがなく、本文は変更していません";
    } else {
      state.lastError = "";
    }
    renderOverlay();
  }

  function updateManifest(text, url) {
    const declarations = summarizeHlsKeyDeclarations(text);
    if (declarations) {
      const previous = state.hlsKeyDeclarations;
      state.hlsKeyDeclarations = Object.fromEntries(Object.entries(declarations)
        .map(([name, count]) => [name, Math.max(previous?.[name] || 0, count)]));
      if (declarations.prefetchDateRanges > 0 && !previous?.prefetchDateRanges) {
        recordEvent("HLS先読み宣言候補", "PREFETCH-KEY属性あり（SDKの実行・第二セッションの発生元は未確定）");
      }
    }
    const normalHls = extractHlsPlaybackResolutions(text);
    if (normalHls.length) {
      const combined = new Map(state.hlsPlaybackResolutions.concat(normalHls)
        .map((size) => [`${size.width}x${size.height}`, size]));
      state.hlsPlaybackResolutions = [...combined.values()]
        .sort((left, right) => right.width * right.height - left.width * left.height)
        .slice(0, 20);
    }
    const found = extractMaxResolution(text);
    if (!found) {
      if (declarations) renderOverlay();
      return;
    }
    if (!state.manifestMax
      || found.width * found.height >= state.manifestMax.width * state.manifestMax.height) {
      state.manifestMax = found;
      state.manifestUrl = singleVariantMode() ? "" : String(url);
    }
    renderOverlay();
  }

  function inspectFetchResponse(response, url) {
    // The single-variant adapter already reads a bounded stream and supplies
    // enum/count diagnostics. Do not clone it again through this legacy path.
    if (singleVariantMode()) return;
    if (!response || response.ok === false || !isManifestUrl(url, location.href)) return;
    try {
      const copy = response.clone();
      void copy.text()
        .then((text) => updateManifest(text, url))
        .catch(() => {});
    } catch (_error) {
      // Reading diagnostics must never interfere with the real response.
    }
  }

  const NativeRequest = globalThis.Request;
  function installFetchObserver() {
    const nativeFetch = globalThis.fetch;
    if (typeof nativeFetch !== "function") return false;
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

    async function prepareRequestObject(input, init, rewrite) {
      const fromInit = (key, fallback) => init && hasOwn(init, key) ? init[key] : fallback;
      const method = String(fromInit("method", input.method || "GET")).toUpperCase();
      const mayHaveBody = method !== "GET" && method !== "HEAD";
      const headers = fromInit("headers", input.headers);
      const normalizedHeaders = new Headers(headers);
      const contentType = normalizedHeaders.get("content-type") || "";
      let body;

      if (mayHaveBody && !/\b(?:application|text)\/[^;]*json\b/i.test(contentType)) {
        throw new TypeError("対象RequestのContent-TypeがJSONではありません");
      }
      if (init && hasOwn(init, "body")) {
        body = init.body;
      } else if (mayHaveBody) {
        body = await input.clone().text();
      }

      const bodyResult = rewritePlaybackBody(body, state.mode);
      const requestInit = {
        method,
        headers,
        mode: fromInit("mode", input.mode),
        credentials: fromInit("credentials", input.credentials),
        cache: fromInit("cache", input.cache),
        redirect: fromInit("redirect", input.redirect),
        referrerPolicy: fromInit("referrerPolicy", input.referrerPolicy),
        integrity: fromInit("integrity", input.integrity),
        keepalive: fromInit("keepalive", input.keepalive),
        signal: fromInit("signal", input.signal),
      };

      const referrer = fromInit("referrer", input.referrer);
      if (referrer) requestInit.referrer = referrer;
      if (mayHaveBody && body !== undefined && body !== null) requestInit.body = bodyResult.body;
      if (init && hasOwn(init, "priority")) requestInit.priority = init.priority;
      if (init && hasOwn(init, "duplex")) requestInit.duplex = init.duplex;

      return {
        input: new NativeRequest(rewrite.url, requestInit),
        init: undefined,
        bodyResult,
      };
    }

    const wrappedFetch = async function fetch(input, init) {
      const isRequestObject = typeof NativeRequest === "function" && input instanceof NativeRequest;
      const originalUrl = isRequestObject ? input.url : String(input);
      const rewrite = rewritePlaybackUrl(originalUrl, state.mode, location.href);
      const method = String(init && Object.prototype.hasOwnProperty.call(init, "method")
        ? init.method
        : isRequestObject
          ? input.method
          : "GET").toUpperCase();
      const isPlaybackPost = rewrite.isPlayback && method === "POST";
      const shouldMutate = isPlaybackPost
        && rewrite.eligible
        && Boolean(getModePlan(state.mode).scenario);
      let nextInput = input;
      let nextInit = init;
      let bodyResult = null;

      if (shouldMutate) {
        try {
          if (isRequestObject) {
            const prepared = await prepareRequestObject(input, init, rewrite);
            nextInput = prepared.input;
            nextInit = prepared.init;
            bodyResult = prepared.bodyResult;
          } else {
            nextInput = rewrite.url;
            nextInit = init ? { ...init } : undefined;
            if (nextInit && Object.prototype.hasOwnProperty.call(nextInit, "body")) {
              bodyResult = rewritePlaybackBody(nextInit.body, state.mode);
              nextInit.body = bodyResult.body;
            }
          }
          reportPlaybackRequest(rewrite, bodyResult);
        } catch (error) {
          if (singleVariantMode()) throw singleVariantAbort("request-preparation-failed");
          state.lastError = `Fetch変更を安全に作成できず元の要求を使用: ${String(error)}`;
          nextInput = input;
          nextInit = init;
          renderOverlay();
        }
      } else if (isPlaybackPost) {
        reportPlaybackRequest(rewrite, null);
      }

      try {
        if (state.retiredDocument && isExperimentalMode(state.mode) && isPlaybackPost) {
          throw new DOMException("終了した実験ページの再生要求を中止しました", "AbortError");
        }
        if (isPlaybackPost && rewrite.eligible) assertSdkOverrideForPlayback();
        if (isPlaybackPost) assertSingleVariantPlayback(rewrite, bodyResult);
        let response;
        if (singleVariantMode() && isPlaybackPost) {
          // This permit is an in-memory identity pair, never copied to a request
          // or diagnostics. A captured pre-start fetch cannot send a second POST.
          const permit = { input: nextInput, init: nextInit };
          singleVariantFetchDispatch = permit;
          try {
            response = await Reflect.apply(nativeFetch, this, [nextInput, nextInit]);
            if (singleVariantFetchDispatch === permit) {
              throw singleVariantAbort("fetch-dispatch-unconfirmed");
            }
          }
          finally {
            if (singleVariantFetchDispatch === permit) singleVariantFetchDispatch = null;
          }
        } else {
          response = await Reflect.apply(nativeFetch, this, [nextInput, nextInit]);
        }
        recordNetwork(response.url || originalUrl, response.status);
        inspectFetchResponse(response, response.url || rewrite.url || originalUrl);
        return response;
      } catch (error) {
        recordNetwork(originalUrl, "通信失敗");
        throw error;
      }
    };

    try {
      Object.defineProperty(globalThis, "fetch", {
        value: wrappedFetch,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    } catch (_error) {
      state.lastError = "Fetch監視を設定できませんでした";
      return false;
    }
    return globalThis.fetch === wrappedFetch;
  }

  if (singleVariantMode()) {
    const originalFetch = globalThis.fetch;
    try {
      if (typeof originalFetch !== "function") throw new TypeError("fetch unavailable");
      const earlyGate = function fetch(input, init) {
        const isRequestObject = typeof NativeRequest === "function" && input instanceof NativeRequest;
        const url = isRequestObject ? input.url : String(input);
        const method = String(init && Object.prototype.hasOwnProperty.call(init, "method")
          ? init.method : isRequestObject ? input.method : "GET").toUpperCase();
        if (method === "POST" && rewritePlaybackUrl(url, state.mode, location.href).isPlayback) {
          const permit = singleVariantFetchDispatch;
          if (!state.singleVariantSdkStarted || !state.singleVariantPlaybackSent
            || !isSingleVariantRuntimeIntact() || !permit || permit.input !== input || permit.init !== init) {
            return Promise.reject(singleVariantAbort("early-fetch-post-guard"));
          }
          singleVariantFetchDispatch = null;
        }
        return Reflect.apply(originalFetch, this, [input, init]);
      };
      Object.defineProperty(globalThis, "fetch", { value: earlyGate, writable: true, configurable: true, enumerable: true });
      state.singleVariantStatus = "SDK開始待ち（事前の再生POST/EME禁止）";
    } catch (_) { stopSingleVariant("early-fetch-install-failed"); }
  } else {
    installFetchObserver();
  }

  const NativeXhr = globalThis.XMLHttpRequest;
  if (typeof NativeXhr === "function") {
    const xhrState = Symbol("dp4kXhrState");
    const nativeOpen = NativeXhr.prototype.open;
    const nativeSend = NativeXhr.prototype.send;
    const nativeAddEventListener = NativeXhr.prototype.addEventListener;

    NativeXhr.prototype.open = function open(method, url, ...rest) {
      const rewrite = rewritePlaybackUrl(url, state.mode, location.href);
      const normalizedMethod = String(method).toUpperCase();
      const shouldMutate = normalizedMethod === "POST"
        && rewrite.eligible
        && Boolean(getModePlan(state.mode).scenario);
      const requestedUrl = shouldMutate ? rewrite.url : String(url);
      this[xhrState] = {
        method: normalizedMethod,
        mutate: shouldMutate,
        rewrite: shouldMutate ? rewrite : { ...rewrite, url: String(url), changed: false },
        requestedUrl,
        manifest: isManifestUrl(requestedUrl, location.href),
      };
      return Reflect.apply(nativeOpen, this, [method, requestedUrl, ...rest]);
    };

    NativeXhr.prototype.send = function send(body) {
      const requestState = this[xhrState];
      if (state.retiredDocument && isExperimentalMode(state.mode)
        && requestState?.rewrite.isPlayback && requestState.method === "POST") {
        throw new DOMException("終了した実験ページの再生要求を中止しました", "AbortError");
      }
      if (requestState?.rewrite.eligible && requestState.method === "POST") assertSdkOverrideForPlayback();
      let nextBody = body;
      let bodyResult = null;

      if (requestState && requestState.rewrite.isPlayback && requestState.method === "POST") {
        if (requestState.mutate) {
          bodyResult = rewritePlaybackBody(body, state.mode);
          nextBody = bodyResult.body;
        }
        reportPlaybackRequest(requestState.rewrite, bodyResult);
        assertSingleVariantPlayback(requestState.rewrite, bodyResult);
      }

      if (requestState && requestState.manifest && !singleVariantMode()) {
        Reflect.apply(nativeAddEventListener, this, ["loadend", () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            const text = typeof this.responseText === "string"
              ? this.responseText
              : typeof this.response === "string"
                ? this.response
                : "";
            updateManifest(text, this.responseURL || requestState.requestedUrl);
          } catch (_error) {
            // responseText is unavailable for non-text response types.
          }
        }, { once: true }]);
      }

      if (requestState && networkKind(requestState.requestedUrl)) {
        Reflect.apply(nativeAddEventListener, this, ["loadend", () => {
          recordNetwork(this.responseURL || requestState.requestedUrl, this.status || "通信失敗");
        }, { once: true }]);
      }

      return Reflect.apply(nativeSend, this, [nextBody]);
    };
  }

  function installEmeObserver() {
    if (typeof navigator.requestMediaKeySystemAccess !== "function") return;

    let owner = navigator;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, "requestMediaKeySystemAccess")) {
      owner = Object.getPrototypeOf(owner);
    }
    if (!owner) return;

    const descriptor = Object.getOwnPropertyDescriptor(owner, "requestMediaKeySystemAccess");
    const nativeRequest = descriptor && descriptor.value;
    if (typeof nativeRequest !== "function" || descriptor.configurable === false) return;
    nativeEmeRequest = nativeRequest;

    let sequence = 0;
    const collectRobustness = (configurations) => {
      const robustness = [];
      try {
        for (const configuration of configurations || []) {
          for (const capability of configuration.videoCapabilities || []) {
            if (capability.robustness) robustness.push(capability.robustness);
          }
          for (const capability of configuration.audioCapabilities || []) {
            if (capability.robustness) robustness.push(capability.robustness);
          }
        }
      } catch (_error) {
        // Observation only.
      }
      return [...new Set(robustness)];
    };

    const updateAttempt = (id, patch) => {
      const attempt = state.emeAttempts.find((item) => item.id === id);
      if (attempt) Object.assign(attempt, patch);
      renderOverlay();
    };

    const wrapped = function requestMediaKeySystemAccess(...args) {
      const [keySystem, configurations] = args;
      const id = ++sequence;
      if (singleVariantMode() && !isSingleVariantRuntimeIntact()) {
        return Promise.reject(singleVariantAbort("eme-runtime-guard"));
      }
      if (getModePlan(state.mode).sdkUhdPolicy && !isSdkResolutionPolicyReady()) {
        const error = new DOMException("SDK選別ポリシーの適用前・退避後のEME比較を中止しました", "AbortError");
        recordMediaError("SDK選別ガード", error);
        return Promise.reject(error);
      }
      const request = safelyObserve(() => planEmeRequest(keySystem, configurations, state.mode))
        || { keySystem, configurations, changed: false };
      if (request.blocked) {
        const error = new DOMException("PlayReadyの識別子禁止を安全に適用できないため、EME要求を中止しました", "NotSupportedError");
        recordMediaError("EME識別子ガード", error);
        return Promise.reject(error);
      }
      const requestedRobustness = collectRobustness(request.configurations);
      const attempt = {
        id,
        originalKeySystem: String(keySystem),
        keySystem: String(request.keySystem),
        requestedRobustness,
        acceptedRobustness: [],
        sessionTypeOverride: request.sessionTypeOverride || null,
        requestedSessionPolicy: Array.isArray(request.configurations)
          ? request.configurations.map(describeSessionPolicy).join(" | ") : "不明",
        acceptedSessionPolicy: "未取得",
        status: "確認中",
      };
      state.emeAttempts.push(attempt);
      state.emeAttempts = state.emeAttempts.slice(-16);
      renderOverlay();
      let result;
      try {
        const forwarded = request.changed ? [request.keySystem, request.configurations, ...args.slice(2)] : args;
        result = Reflect.apply(nativeRequest, this, forwarded);
      } catch (error) {
        safelyObserve(() => updateAttempt(id, { status: safeError(error) }));
        throw error;
      }
      return observePromise(result,
        (access) => {
          let acceptedRobustness = [];
          let acceptedSessionPolicy = "未取得";
          try {
            const accepted = access.getConfiguration();
            acceptedRobustness = collectRobustness([accepted]);
            acceptedSessionPolicy = describeSessionPolicy(accepted);
          } catch (_error) {
            // Older implementations may not expose the accepted configuration.
          }
          updateAttempt(id, {
            keySystem: String(access.keySystem || keySystem),
            acceptedRobustness,
            acceptedSessionPolicy,
            status: "API利用可",
          });
          accessMetadata.set(access, attempt);
        },
        (error) => {
          updateAttempt(id, {
            status: `拒否 (${safeError(error)})`,
          });
        },
      );
    };

    Object.defineProperty(owner, "requestMediaKeySystemAccess", {
      ...descriptor,
      value: wrapped,
    });
    guardedEmeRequest = wrapped;
  }

  function displayedEmeAttempt() {
    const attempts = state.emeAttempts;
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
      const attempt = attempts[index];
      if (/playready/i.test(attempt.keySystem)) {
        return attempt;
      }
    }
    return attempts.length ? attempts[attempts.length - 1] : null;
  }

  function describeEmeAttempt(attempt) {
    if (!attempt) return "再生開始待ち";
    const robustness = attempt.acceptedRobustness.length
      ? attempt.acceptedRobustness.join(", ")
      : attempt.requestedRobustness.length
        ? `要求:${attempt.requestedRobustness.join(", ")}`
        : "robustness指定なし";
    return `${attempt.keySystem} / ${robustness} / ${attempt.status}`;
  }

  function installPlaybackObservers() {
    const wrap = (prototype, name, factory) => {
      if (!prototype) return;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor || !descriptor.configurable || typeof descriptor.value !== "function") return;
      Object.defineProperty(prototype, name, { ...descriptor, value: factory(descriptor.value) });
    };
    wrap(globalThis.MediaKeySystemAccess?.prototype, "createMediaKeys", (native) => function createMediaKeys(...args) {
      const metadata = safelyObserve(() => accessMetadata.get(this) || { keySystem: this.keySystem, acceptedRobustness: [] })
        || { keySystem: "不明", acceptedRobustness: [] };
      recordEvent("CDM作成要求", metadata.keySystem);
      try {
        return observePromise(Reflect.apply(native, this, args), (keys) => {
          keysMetadata.set(keys, { ...metadata, sessions: [] });
          recordEvent("CDM作成成功", metadata.keySystem);
        }, (error) => recordMediaError("createMediaKeys", error));
      } catch (error) { recordMediaError("createMediaKeys", error); throw error; }
    });
    wrap(globalThis.HTMLMediaElement?.prototype, "setMediaKeys", (native) => function setMediaKeys(...args) {
      const [keys] = args;
      const video = this;
      try {
        return observePromise(Reflect.apply(native, video, args), () => {
          if (keys) {
            videoKeys.set(video, keys);
            recordEvent("CDM接続成功", keysMetadata.get(keys)?.keySystem || "不明");
          } else { videoKeys.delete(video); recordEvent("CDM切断", "完了"); }
        }, (error) => recordMediaError("setMediaKeys", error));
      } catch (error) { recordMediaError("setMediaKeys", error); throw error; }
    });
    wrap(globalThis.MediaKeys?.prototype, "createSession", (native) => function createSession(...args) {
      let session;
      const forwarded = safelyObserve(() => planSessionArguments(args, keysMetadata.get(this))) || args;
      try {
        session = Reflect.apply(native, this, forwarded);
      } catch (error) { recordMediaError("createSession", error); throw error; }
      safelyObserve(() => {
        const metadata = {
          id: ++nextSession, keys: this, statuses: {}, sessionType: normalizeSessionType(forwarded[0]),
          closed: false, closedReason: null, closeCalled: false, removeCalled: false,
        };
        sessionMetadata.set(session, metadata);
        const parent = keysMetadata.get(this);
        if (parent) {
          if (!parent.sessions) parent.sessions = [];
          parent.sessions.push(metadata);
          parent.sessions = parent.sessions.slice(-8);
        }
        recordEvent(`session #${metadata.id}`, forwarded !== args
          ? `${normalizeSessionType(args[0])} → ${metadata.sessionType}（互換テスト）` : metadata.sessionType);
        const observationFailed = () => recordEvent(`session #${metadata.id}`, "closed-observation-failed");
        try {
          observeNativePromise(session.closed, (reason) => {
            metadata.closed = true;
            metadata.closedReason = normalizeSessionClosedReason(reason);
            metadata.statuses = {};
            recordEvent(`session #${metadata.id}`, describeSessionClosure(metadata));
          }, observationFailed, observationFailed);
        } catch (_) { observationFailed(); }
        safelyObserve(() => session.addEventListener("message", (event) => safelyObserve(() => {
          const type = event.messageType;
          recordEvent(`session #${metadata.id}`, typeof type === "string" && SESSION_MESSAGE_TYPES.includes(type)
            ? type : "message-type-unavailable");
        })));
        safelyObserve(() => session.addEventListener("keystatuseschange", () => {
          if (metadata.closed) return;
          try {
            const statuses = Object.create(null);
            // Only enum counts: never inspect key IDs, initialization data or license bytes.
            session.keyStatuses.forEach((value) => {
              const status = typeof value === "string" && KEY_STATUS_LABELS.includes(value) ? value : "unknown";
              statuses[status] = (statuses[status] || 0) + 1;
            });
            metadata.statuses = statuses;
            recordEvent(`鍵状態 #${metadata.id}`, JSON.stringify(statuses));
          } catch (_) {
            metadata.statuses = {};
            recordEvent(`鍵状態 #${metadata.id}`, "status-map-unavailable");
          }
        }));
      });
      return session;
    });
    for (const method of ["generateRequest", "update"]) {
      wrap(globalThis.MediaKeySession?.prototype, method, (native) => {
        const wrapped = function (...args) {
        if (method === "generateRequest" && getModePlan(state.mode).singleSdrProbe) {
          return Promise.reject(singleVariantAbort("probe-generate-forbidden"));
        }
        if (method === "generateRequest" && singleVariantMode()
          && (!isSingleVariantRuntimeIntact() || !state.singleVariantAccepted)) {
          return Promise.reject(singleVariantAbort("master-not-accepted"));
        }
        if (method === "generateRequest" && getModePlan(state.mode).singleHdrVariant) {
          // A page-wide budget, not a per-session budget: another session or
          // reentrant call must not reach the second native challenge that
          // preceded the earlier HWDRM reset. Never inspect the request bytes.
          // This does not guarantee safety of the first native HDR operation.
          if (state.singleVariantGenerateCalls !== 0) {
            return Promise.reject(singleVariantAbort("second-generate-forbidden"));
          }
          state.singleVariantGenerateCalls++;
        }
        const id = sessionMetadata.get(this)?.id || "?";
        recordEvent(`${method} #${id}`, "開始");
        try {
          return observePromise(Reflect.apply(native, this, args), () => recordEvent(`${method} #${id}`, "成功"),
            (error) => recordMediaError(`${method} #${id}`, error));
        } catch (error) { recordMediaError(`${method} #${id}`, error); throw error; }
        };
        if (method === "generateRequest" && singleVariantMode()) singleVariantEmeGuard = wrapped;
        return wrapped;
      });
    }
    for (const method of ["close", "remove"]) {
      wrap(globalThis.MediaKeySession?.prototype, method, (native) => function (...args) {
        const metadata = sessionMetadata.get(this);
        const stage = `${method} #${metadata?.id || "?"}`;
        safelyObserve(() => {
          if (metadata) metadata[method === "close" ? "closeCalled" : "removeCalled"] = true;
          recordEvent(stage, "開始");
        });
        let result;
        try { result = Reflect.apply(native, this, args); }
        catch (error) { recordEvent(stage, "同期例外"); throw error; }
        // Merely observe teardown initiated by the site. Never initiate cleanup,
        // retry, or block playback because a cleanup promise rejected.
        return observeNativePromise(result,
          () => recordEvent(stage, "成功"), () => recordEvent(stage, "拒否"),
          () => recordEvent(stage, "結果未観測"));
      });
    }
  }

  function describeActiveCdm() {
    const keys = state.video?.element && (state.video.element.mediaKeys || videoKeys.get(state.video.element));
    if (!keys) return "表示中videoにCDM接続未検出";
    const metadata = keysMetadata.get(keys);
    if (!metadata) return "CDM接続あり（種類未観測）";
    const statuses = summarizeSessionStatuses(metadata.sessions);
    return `${metadata.keySystem} / 鍵（直近8セッション中、終了未観測の状態スナップショット）: ${Object.entries(statuses).map(([key, count]) => `${key}=${count}`).join(", ") || "待機中"}`;
  }

  async function checkEnvironment() {
    const result = [];
    const hevc = 'video/mp4; codecs="hvc1.2.4.L153.B0"';
    result.push(`HEVC Main10 MSE=${Boolean(globalThis.MediaSource?.isTypeSupported(hevc))}`);
    result.push(`HDR画面=${matchMedia("(dynamic-range: high)").matches}`);
    result.push(`viewport=${innerWidth}x${innerHeight}, DPR=${devicePixelRatio}`);
    if (getModePlan(state.mode).sdkUhdPolicy || singleVariantMode()) {
      result.push("ハードウェアPlayReady=比較中は別途問い合わせを省略（SDKの実接続CDM欄を参照）");
    } else if (nativeEmeRequest) {
      try {
        const access = await Reflect.apply(nativeEmeRequest, navigator, [HARDWARE_PLAYREADY, [{
          initDataTypes: ["cenc"],
          videoCapabilities: [{ contentType: hevc }],
          sessionTypes: ["temporary"],
        }]]);
        result.push(`ハードウェアPlayReady=${access.keySystem}`);
        // Capability query only: no license request and no media session are created.
      } catch (error) { result.push(`ハードウェアPlayReady=${safeError(error)}`); }
    }
    state.environment = result.join(" | ");
    renderOverlay();
  }

  function installMseObserver() {
    if (!globalThis.MediaSource || typeof MediaSource.prototype.addSourceBuffer !== "function") return;
    const nativeAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function addSourceBuffer(...args) {
      let buffer;
      try {
        buffer = Reflect.apply(nativeAddSourceBuffer, this, args);
      } catch (error) { recordMediaError("addSourceBuffer", error); throw error; }
      safelyObserve(() => {
        const value = String(args[0]);
        buffer.addEventListener("error", () => recordMediaError("MSE SourceBuffer", new Error(`append/decode error (${value})`)));
        if (!state.mseTypes.includes(value)) {
          state.mseTypes.push(value);
          state.mseTypes = state.mseTypes.slice(-4);
          renderOverlay();
        }
      });
      return buffer;
    };
  }

  try {
    installEmeObserver();
    installPlaybackObservers();
    installMseObserver();
  } catch (error) {
    state.lastError = `診断フックの一部を設定できませんでした: ${String(error)}`;
  }

  function updateVideoMeasurement() {
    if (singleVariantMode() && state.singleVariantFailed) {
      for (const video of document.querySelectorAll("video")) safelyObserve(() => video.pause());
    }
    const allVideos = Array.from(document.querySelectorAll("video"));
    for (const candidate of allVideos) {
      if (candidate.error) recordMediaError(`video.error ${candidate.error.code}`, candidate.error);
      if (!observedVideos.has(candidate)) {
        observedVideos.add(candidate);
        for (const name of ["error", "waitingforkey", "loadedmetadata", "playing"]) {
          candidate.addEventListener(name, () => {
            if (name === "error") recordMediaError(`video.error ${candidate.error?.code}`, candidate.error);
            else recordEvent(`video.${name}`, `${candidate.videoWidth}x${candidate.videoHeight}`);
          });
        }
      }
    }
    const videos = allVideos
      .filter((candidate) => {
        if (!candidate.isConnected) return false;
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 1
          && rect.height > 1
          && style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity || "1") > 0;
      });
    videos.sort((left, right) => {
      const leftPlaying = !left.paused && !left.ended && left.readyState >= 2 ? 1 : 0;
      const rightPlaying = !right.paused && !right.ended && right.readyState >= 2 ? 1 : 0;
      if (leftPlaying !== rightPlaying) return rightPlaying - leftPlaying;
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });
    const video = videos[0] || null;

    if (!video) {
      state.video = null;
      state.progress4k = measure4kProgress(null, null);
      renderOverlay();
      return;
    }

    let dropped = null;
    let total = null;
    try {
      if (typeof video.getVideoPlaybackQuality === "function") {
        const quality = video.getVideoPlaybackQuality();
        dropped = quality.droppedVideoFrames;
        total = quality.totalVideoFrames;
      }
    } catch (_error) {
      // Some protected pipelines expose only dimensions.
    }

    state.video = {
      element: video,
      width: video.videoWidth,
      height: video.videoHeight,
      dropped,
      total,
      paused: video.paused,
      readyState: video.readyState,
      currentTime: video.currentTime,
    };
    state.progress4k = measure4kProgress(state.progress4k, {
      ...state.video,
      source: video.currentSrc,
      generation: state.playbackRequests,
      now: Date.now(),
      ended: video.ended,
      seeking: video.seeking,
      hasError: Boolean(video.error) || state.playbackBlocked,
    });
    renderOverlay();
  }

  function describe4kProgress() {
    if (getModePlan(state.mode).sdkInspectOnly) return "SDK診断専用・再生未実施（4K成功ではありません）";
    const plannedStop = intentionalStopLabel(state.singleVariantFailed, state.singleVariantStatus,
      Boolean(state.video?.element?.error) || state.mediaErrors.length > 0 || Boolean(state.lastError));
    if (plannedStop) return plannedStop;
    if (state.playbackBlocked) return "再生エラーあり・4K再生未確認（次の再生要求で再判定）";
    if (state.progress4k.confirmed) {
      return `4K寸法で${(state.progress4k.elapsedMs / 1000).toFixed(1)}秒のフレーム進行を観測 (${state.progress4k.frames}枚)`;
    }
    if (state.video?.width >= 3840 && state.video?.height >= 2160) {
      return `4K寸法あり・再生確認待ち (${(state.progress4k.elapsedMs / 1000).toFixed(1)}/5秒、${state.progress4k.frames}枚)`;
    }
    return "4K再生未確認（寸法・API受付・manifestだけでは成功としません）";
  }

  function diagnosticReport() {
    const plan = getModePlan(state.mode);
    const actual = state.video?.width && state.video?.height
      ? `${state.video.width}x${state.video.height}`
      : "未検出";
    const manifest = state.manifestMax
      ? `${state.manifestMax.width}x${state.manifestMax.height}`
      : "未検出";
    const eme = describeEmeAttempt(displayedEmeAttempt());
    return [
      `Disney+ Edge Enhanced v${VERSION}`,
      `モード: ${plan.label}`,
      `実験ガード: ${state.guardNotice}`,
      `前回の実験段階（保存できた範囲・今回の成功証拠ではない）: ${state.previousCheckpoint ? `${state.previousCheckpoint.mode} v${state.previousCheckpoint.version}: ${state.previousCheckpoint.steps.map((step) => `${new Date(step.time).toISOString()} ${step.phase}`).join(" → ")}` : "記録なし"}`,
      `再生要求: ${state.lastRewrite} (${state.playbackRequests}回 / 解像度編集${state.bodyEdits}件)`,
      `要求本文の解像度上限: ${state.bodyResolutionStatus}`,
      `SDK内部上限: ${getModePlan(state.mode).sdkMaxHeight ? state.sdkConfigStatus : "変更対象外"}`,
      `単一候補比較: ${singleVariantMode() ? `${state.singleVariantStatus} / 元variant=${state.singleVariantSourceCount}, 適合候補=${state.singleVariantCandidateCount}, 確認master=${state.singleVariantMasters}` : "変更対象外"}`,
      `HDR限定比較のnative generateRequest呼出し: ${plan.singleHdrVariant ? `${state.singleVariantGenerateCalls}/1` : "変更対象外"}`,
      `4K SDR候補診断（再生へは渡さない）: ${plan.singleSdrProbe ? state.singleVariantProbeResult : "変更対象外"}`,
      `3840x2160通常variantのレンジ宣言（codec条件と独立）: ${plan.singleSdrProbe ? state.singleVariantRangeSummary : "変更対象外"}`,
      `単一候補ガード条件: ${singleVariantMode() ? state.singleVariantGuardSnapshot : "変更対象外"}`,
      `SDK鍵設定（base/override・実効値未確定）: ${state.sdkKeyConfigurationStatus}`,
      `SDKセッション作成直前engine: ${state.sdkSessionKeyConfigurationStatus}`,
      `SDK PlayReady選択: ${getModePlan(state.mode).sdkRecommendationFlow ? (isEmeIdentifierGuardActive() ? "有効化要求・識別子は禁止（実際の選択は接続CDM欄で確認）" : "識別子ガード未確認・比較を中止") : "変更対象外"}`,
      `SDKのUHD候補ポリシー: ${getModePlan(state.mode).sdkUhdPolicy ? state.sdkUhdPolicyStatus : "変更対象外"}`,
      `SDK能力一覧: ${state.sdkCapabilityStatus}`,
      `表示中videoのvideoWidth/Height（メタデータ段階でも取得可）: ${actual}`,
      `4Kフレーム進行: ${describe4kProgress()}`,
      `検出manifest全候補の最大寸法（Iフレーム等を含む）: ${manifest}`,
      `通常HLSの解像度宣言（Iフレーム等を除外・選択/再生の証拠ではない）: ${state.hlsPlaybackResolutions.map((size) => `${size.width}x${size.height}`).join(" | ") || "未検出/HLS対象外"}`,
      `HLS鍵関連タグ候補（1応答内件数の最大値・タグの有効性/鍵の種類数/実行回数ではない）: ${state.hlsKeyDeclarations ? `media-key=${state.hlsKeyDeclarations.mediaKeyTags}, session-key=${state.hlsKeyDeclarations.sessionKeyTags}, prefetch-range=${state.hlsKeyDeclarations.prefetchDateRanges}` : "未観測"}`,
      `EME API応答（CDM利用確定ではない）: ${eme}`,
      `動画へ接続したCDM: ${describeActiveCdm()}`,
      `video状態: ${state.video ? `ready=${state.video.readyState}, paused=${state.video.paused}, time=${state.video.currentTime.toFixed(2)}` : "未検出"}`,
      `MSE宣言: ${state.mseTypes.join(" | ") || "未検出"}`,
      `HTTP経過: ${state.network.join(" → ") || "未検出"}`,
      `再生エラー: ${state.mediaErrors.join(" | ") || "未検出（サイト独自エラーは画面でも確認）"}`,
      `スクリプトエラー: ${state.lastError || "なし"}`,
      `環境チェック: ${state.environment}`,
      `EME一覧:\n${state.emeAttempts.map(describeEmeAttempt).join("\n") || "未検出"}`,
      `EMEセッション設定:\n${state.emeAttempts.map((attempt) => `${attempt.keySystem}\n  要求: ${attempt.requestedSessionPolicy}\n  受付: ${attempt.acceptedSessionPolicy}`).join("\n") || "未検出"}`,
      `処理経過:\n${state.events.join("\n") || "未検出"}`,
      `時刻: ${new Date().toISOString()}`,
    ].join("\n");
  }

  function renderOverlay() {
    safelyObserve(renderOverlayContents);
    publishToolbarState();
  }

  function renderOverlayContents() {
    if (!state.overlay) return;
    const { elements } = state.overlay;
    const plan = getModePlan(state.mode);
    const actual4k = state.progress4k.confirmed && !state.playbackBlocked && !plan.sdkInspectOnly;
    const actualText = state.video?.width && state.video?.height
      ? `${state.video.width} × ${state.video.height}${actual4k ? "  ✓ 4Kフレーム進行" : ""}`
      : "再生開始待ち";
    const frameText = state.video && state.video.total !== null
      ? ` / drop ${state.video.dropped}/${state.video.total}`
      : "";

    elements.badge.textContent = actual4k ? "4K" : "?";
    elements.badge.dataset.ok = actual4k ? "true" : "false";
    if (!state.modeReloadPending) elements.mode.value = state.mode;
    elements.mode.disabled = state.modeReloadPending;
    elements.guard.textContent = state.guardNotice;
    elements.request.textContent = `${state.lastRewrite} (${state.playbackRequests}回)`;
    elements.actual.textContent = `${actualText}${frameText}`;
    elements.progress.textContent = describe4kProgress();
    elements.manifest.textContent = state.manifestMax
      ? `${state.manifestMax.width} × ${state.manifestMax.height}`
      : "未検出";
    elements.drm.textContent = describeEmeAttempt(displayedEmeAttempt());
    elements.activeCdm.textContent = describeActiveCdm();
    elements.codec.textContent = state.mseTypes.length
      ? state.mseTypes[state.mseTypes.length - 1]
      : "未検出";
    elements.error.textContent = [state.lastError, ...state.mediaErrors.slice(-2)].filter(Boolean).join(" / ");
    elements.error.hidden = !elements.error.textContent;
    elements.environment.textContent = state.environment;
    elements.trace.textContent = diagnosticReport();
    elements.note.textContent = actual4k
      ? "video要素の4K寸法と5秒以上のフレーム進行を観測。HDR・HDCP・実ディスプレイ出力の証明ではありません。"
      : `${plan.label}。寸法だけでは4K成功としません。HTTP 200もCDMのライセンス適用成功とは別です。`;
    if (plan.persistentSession || plan.sdkRecommendationFlow) {
      elements.note.textContent += " HWPR+persistentのHDR試験中にOS停止が発生しました（原因未特定）。ライセンスがCDM領域に保存され得ます。再試行ガードはOS停止を防ぐ機能ではありません。";
    }
    if (state.mode === "1080p-hevc-hw-persistent" || plan.sdkMaxHeight === 1080) {
      elements.note.textContent += " 今回はHDR表記のないHEVCシナリオ・最大1080p要求での切り分けです。1080p再生を4K達成とは扱いません。";
    }
    if (plan.sdkUhdPolicy) {
      elements.note.textContent += plan.scenario === "tv-drm-ctr-h265-atmos"
        ? " 今回はHDR表記のないHEVCシナリオ・最大3840×2160要求です。SDR配信・出力を保証せず、WindowsのHDR設定も変更しません。"
        : " 今回はHDR10シナリオ・最大3840×2160要求です。HDR出力も未検証です。";
      elements.note.textContent += " SDKの別の画質制限や配信・出力条件は残ります。通常HLSの4K候補、接続CDM、実フレームを個別に確認してください。";
      elements.note.textContent += " SDKのWindows向け解像度選別リストへ、セッションのコピー内だけUHDを追加します。ブラウザの復号・DRM・HDCP判定を成功扱いにはしません。SDKセッション作成は1ページ1回限定です。";
    }
    if (plan.sdkMaxHeight) {
      elements.note.textContent += plan.sdkUhdPolicy
        ? ` SDKのVOD内部上限も${plan.sdkMaxHeight}pへ揃えます。元serviceの能力一覧・形式除外は保持します。`
        : plan.sdkRecommendationFlow
        ? ` SDKのVOD内部上限も${plan.sdkMaxHeight}pへ揃えます。能力一覧・HDCP・形式除外は変更しません。`
        : ` SDKのVOD内部上限も${plan.sdkMaxHeight}pへ揃えます。能力一覧・HDCP・識別子ポリシー・形式除外は変更しません。`;
      if (!plan.hardwarePlayReady && !plan.sdkRecommendationFlow) {
        elements.note.textContent += " EME要求とcreateSessionの引数はDisney+本来のまま保持し、HWPR/persistentへの変換は行いません。OS停止の再発防止を保証するものではありません。";
      }
    }
    if (plan.sdkRecommendationFlow) {
      elements.note.textContent += " SDKのPlayReady選択・persistentセッション生成/終了処理を一緒に有効化します。EMEは識別子だけnot-allowedに制約し、キーシステム・robustness・セッション種別はSDK指定を保持します。SDK既定とは異なる組合せであり、受付・再生は保証しません。";
    }
    if (plan.singleFhdVariant) {
      elements.note.textContent += " 既存の1920×1080・SDR明示・HEVC/AAC候補を1本だけ残します。音声・字幕・鍵宣言・実解像度は書き換えません。候補なし/曖昧なら中止。時間経過による鍵切替は残り得ます。";
      elements.note.textContent += plan.continuousFhd
        ? " フルHDの再生時間制限はありません。master再取得や正規の鍵更新を回数で打ち切りません。エラー・SDK/通信ガード違反では中止し、次回の起動はOFFに戻します。長時間の実再生は未検証です。"
        : " SDK作成/再生POST/master各1回、75秒で停止し、自動再試行しません。";
    }
    if (plan.singleHdrVariant) {
      elements.note.textContent += " 既存の3840×2160・PQ明示・HEVC/AAC候補を1本だけ残します。レンジ・音声・字幕・鍵宣言・実解像度は書き換えません。候補なし/曖昧なら中止。SDK作成/再生POST/master/native generateRequestは各1回、SDK開始から30秒または第2鍵要求の前に停止し、自動再試行しません。初回処理でもOSフリーズの危険は残り、タイマーはOS停止を防ぐ保証ではありません。";
    }
    if (plan.singleSdrProbe) {
      elements.note.textContent += " 診断専用です。通常HLSの数値寸法と、SDR明示・3840×2160・HEVC/AAC候補の件数だけを表示します。master/mediaを再生処理へ渡さず、generateRequestは常に禁止します。候補なしも診断結果であり、復号の失敗を意味しません。SDK作成/再生POSTは各1回、75秒上限、自動再試行なし。";
      elements.note.textContent += " 3840×2160のSDR/PQ/HLG/未指定/不明宣言も形式適合条件と独立に数えます。HDRシナリオの診断でもHDR映像は再生しません。";
    }
    if (plan.sdkInspectOnly) {
      elements.note.textContent = "対応SDKのセッション作成直前に、アダプター申告とVODの解像度区分だけを取得して中止します。再生成功・ライセンス適用は試しません。要求、DRM、識別子ポリシー、能力一覧は変更しません。作品の再生操作後に詳細欄のSDK能力一覧を確認してください。";
    }
  }

  function mountOverlay() {
    if (state.overlay || !state.debugVisible || !document.documentElement) return;

    const host = document.createElement("div");
    host.id = "ioridev-disneyplus-4k-verifier";
    host.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483647;font-family:Segoe UI,system-ui,sans-serif;color-scheme:dark;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel { width: min(430px, calc(100vw - 28px)); box-sizing: border-box; color: #f7f7fa; background: rgba(12,14,22,.94); border: 1px solid rgba(255,255,255,.16); border-radius: 14px; box-shadow: 0 14px 42px rgba(0,0,0,.48); overflow: hidden; backdrop-filter: blur(14px); font: 12px/1.45 "Segoe UI", system-ui, sans-serif; }
        .head { display:flex; align-items:center; gap:9px; padding:10px 11px; background:rgba(255,255,255,.055); }
        .badge { width:30px; height:30px; border-radius:9px; display:grid; place-items:center; font-weight:800; background:#5c6274; color:white; }
        .badge[data-ok="true"] { background:#00a86b; }
        .title { min-width:0; flex:1; }
        .title strong { display:block; font-size:13px; letter-spacing:.01em; }
        .title span { color:#aeb5c8; }
        button, select { font:inherit; color:inherit; border:1px solid rgba(255,255,255,.17); background:#262a38; border-radius:8px; }
        button { cursor:pointer; padding:5px 8px; }
        button:hover, select:hover { background:#323747; }
        .body { padding:11px; max-height:70vh; overflow:auto; }
        .mode { width:100%; padding:7px 8px; margin-bottom:9px; }
        dl { margin:0; display:grid; grid-template-columns:84px minmax(0,1fr); gap:5px 8px; }
        dt { color:#9ea6ba; }
        dd { margin:0; min-width:0; overflow-wrap:anywhere; }
        .note { margin:9px 0 0; color:#cbd2e4; }
        .guard { margin:0 0 9px; color:#ffd999; }
        .error { margin:8px 0 0; padding:7px 8px; border-radius:8px; color:#ffd5d5; background:rgba(210,55,55,.18); }
        .actions { display:flex; justify-content:flex-end; gap:7px; margin-top:9px; }
        details { margin-top:9px; } summary { cursor:pointer; } pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; }
        .collapsed .body, .collapsed .title span, .collapsed .title strong { display:none; }
        .collapsed { width:auto; }
        .collapsed .head { padding:7px; }
        .collapsed .title { display:none; }
      </style>
      <section class="panel" aria-label="Disney+ Edge Enhanced diagnostics">
        <div class="head">
          <span class="badge">?</span>
          <span class="title"><strong>Disney+ Edge Enhanced v${VERSION}</strong><span>寸法とフレーム進行を別表示</span></span>
          <button class="collapse" type="button" title="Alt+Shift+4でも開閉">閉じる</button>
        </div>
        <div class="body">
          <select class="mode" aria-label="再生要求モード">
            <option value="fullhd">フルHD（1080p SDR・時間制限なし）</option>
            <option value="4k-hdr10-single-pq">4K HDR10・HEVC/AACを1候補に固定（30秒限定）</option>
            <option value="1080p-hevc-single-sdr">1080p SDR・HEVC/AACを1候補に固定（75秒比較）</option>
            <option value="4k-hevc-sdr-manifest-probe">4K SDR候補の診断のみ（復号しない）</option>
            <option value="4k-hdr10-sdr-manifest-probe">HDR10一覧の4K SDR候補だけ診断（復号しない）</option>
            <option value="4k-hevc-sdk-playready">4K HEVC・HDR要求なし（SDKのPlayReady選択）</option>
            <option value="4k-hdr10-sdk-playready">4K HDR10（SDKのPlayReady選択）</option>
            <option value="1080p-hevc-sdk-playready">1080p HEVC（SDKのPlayReady選択）</option>
            <option value="1080p-hevc-native-cap">1080p HEVC（標準DRM・内部上限修正）</option>
            <option value="sdk-inspect">SDKの解像度上限を診断（再生しない）</option>
            <option value="1080p-hevc-hw-persistent-cap">1080p HEVC + HWPR（内部上限修正）</option>
            <option value="1080p-hevc-hw-persistent">1080p HEVC + HWPR（persistent切り分け）</option>
            <option value="4k-hdr10-hw-persistent">UHD HDR10 + HWPR（persistent互換テスト）</option>
            <option value="4k-hdr10-hw">UHD HDR10 + ハードウェアPlayReady</option>
            <option value="4k-hevc-hw">UHD HEVC + ハードウェアPlayReady</option>
            <option value="4k-sdr">UHD HEVC/Atmos要求</option>
            <option value="4k-hdr10">UHD HDR10シナリオ要求</option>
            <option value="1080p">1080p上限要求</option>
            <option value="original">無変更</option>
          </select>
          <p class="guard" role="status"></p>
          <dl>
            <dt>再生要求</dt><dd class="request">再生待ち</dd>
            <dt>video寸法</dt><dd class="actual">再生開始待ち</dd>
            <dt>4K再生判定</dt><dd class="progress">未確認</dd>
            <dt>manifest全候補</dt><dd class="manifest">未検出</dd>
            <dt>EME応答</dt><dd class="drm">再生開始待ち</dd>
            <dt>接続CDM / 鍵</dt><dd class="active-cdm">未検出</dd>
            <dt>MSE宣言</dt><dd class="codec">未検出</dd>
          </dl>
          <p class="note"></p>
          <p class="error" hidden></p>
          <p class="environment">未チェック</p>
          <div class="actions"><button class="check" type="button">環境チェック</button><button class="copy" type="button">診断をコピー</button></div>
          <details><summary>処理経過・エラー詳細</summary><pre class="trace"></pre></details>
        </div>
      </section>`;

    document.documentElement.appendChild(host);
    const panel = shadow.querySelector(".panel");
    const elements = {
      badge: shadow.querySelector(".badge"),
      mode: shadow.querySelector(".mode"),
      guard: shadow.querySelector(".guard"),
      request: shadow.querySelector(".request"),
      actual: shadow.querySelector(".actual"),
      progress: shadow.querySelector(".progress"),
      manifest: shadow.querySelector(".manifest"),
      drm: shadow.querySelector(".drm"),
      activeCdm: shadow.querySelector(".active-cdm"),
      codec: shadow.querySelector(".codec"),
      note: shadow.querySelector(".note"),
      error: shadow.querySelector(".error"),
      environment: shadow.querySelector(".environment"),
      trace: shadow.querySelector(".trace"),
    };
    state.overlay = { host, shadow, panel, elements };
    shadow.querySelector(".check").addEventListener("click", () => {
      state.environment = "チェック中…";
      renderOverlay();
      void checkEnvironment().catch((error) => {
        state.environment = safeError(error);
        renderOverlay();
      });
    });

    shadow.querySelector(".collapse").addEventListener("click", () => {
      setDebugVisibility(false);
    });

    elements.mode.addEventListener("change", () => {
      const selected = elements.mode.value;
      if (state.modeReloadPending) return;
      let outcome;
      try { outcome = prepareModeReload(selected, localStorage, sessionStorage, location.href, Date.now()); }
      catch (_) { outcome = { reload: false, notice: "設定領域を利用できないため切替を中止しました。" }; }
      state.guardNotice = outcome.notice;
      state.modeReloadPending = outcome.reload;
      renderOverlay();
      // Never switch the live EME/request policy midway through an old session.
      if (outcome.reload) {
        try { location.reload(); }
        catch (_) {
          safelyObserve(() => clearTestTicket(sessionStorage));
          state.modeReloadPending = false;
          state.guardNotice = "再読込を開始できませんでした。実験を終了するにはタブを閉じてください。";
          renderOverlay();
        }
      }
    });

    const copyButton = shadow.querySelector(".copy");
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(diagnosticReport());
        copyButton.textContent = "コピー済み";
      } catch (_error) {
        copyButton.textContent = "コピー失敗";
      }
      setTimeout(() => { copyButton.textContent = "診断をコピー"; }, 1400);
    });

    renderOverlay();
  }

  function toolbarState() {
    return { version: VERSION, mode: state.mode, failed: Boolean(state.playbackBlocked || state.singleVariantFailed), debugVisible: state.debugVisible };
  }

  let lastToolbarReport = "";
  function publishToolbarState(force = false) {
    safelyObserve(() => {
      const report = JSON.stringify(toolbarState());
      if (!force && report === lastToolbarReport) return;
      lastToolbarReport = report;
      globalThis.dispatchEvent(new CustomEvent("disney-plus-enhanced:status", { detail: report }));
    });
  }

  function setDebugVisibility(visible) {
    state.debugVisible = Boolean(visible);
    safelyObserve(() => sessionStorage.setItem(DEBUG_UI_KEY, state.debugVisible ? "1" : "0"));
    if (state.debugVisible) mountOverlay();
    if (state.overlay) state.overlay.host.hidden = !state.debugVisible;
    publishToolbarState();
    return toolbarState();
  }

  Object.defineProperty(globalThis, TOOLBAR_CONTROL, {
    value: Object.freeze({
      getState: toolbarState,
      toggleDebug: () => setDebugVisibility(!state.debugVisible),
      prepareToggle: () => {
        if (state.modeReloadPending) return { ok: false, reason: "reload-pending" };
        const mode = getModePlan(state.mode).continuousFhd && !state.singleVariantFailed ? DEFAULT_MODE : "fullhd";
        const outcome = prepareModeReload(mode, localStorage, sessionStorage, location.href, Date.now());
        state.modeReloadPending = outcome.reload;
        state.guardNotice = outcome.notice;
        renderOverlay();
        return { ok: outcome.reload, reload: outcome.reload, mode };
      },
    }),
    configurable: false, enumerable: false, writable: false,
  });
  addEventListener("disney-plus-enhanced:request-status", () => publishToolbarState(true));
  safelyObserve(() => { state.debugVisible = sessionStorage.getItem(DEBUG_UI_KEY) === "1"; });
  if (document.documentElement) {
    mountOverlay();
  } else {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        observer.disconnect();
        mountOverlay();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }

  addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.code === "Digit4") {
      setDebugVisibility(!state.debugVisible);
      event.preventDefault();
    }
  }, true);

  addEventListener("pagehide", () => {
    if (!isExperimentalMode(state.mode) && !getModePlan(state.mode).continuousFhd) return;
    state.retiredDocument = true;
    if (singleVariantTimer !== null) clearTimeout(singleVariantTimer);
    singleVariantTimer = null;
    saveCheckpoint("page-exit");
    // BFCache may retain this document and its CDM. Pause before leaving and
    // rebuild from the consumed-ticket/default mode when history restores it.
    for (const video of document.querySelectorAll("video")) safelyObserve(() => video.pause());
  }, true);
  addEventListener("pageshow", (event) => {
    if (event.persisted && state.retiredDocument) location.reload();
  }, true);

  setInterval(updateVideoMeasurement, 1000);
  publishToolbarState(true);
})();
