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

export function selectSingleFhdVariant(input) {
  return selectSingleVariant(input, FHD_WIDTH, FHD_HEIGHT, "SDR");
}

export function selectSingleUhdVariant(input) {
  return selectSingleVariant(input, UHD_WIDTH, UHD_HEIGHT, "SDR");
}

export function selectSingleHdrUhdVariant(input) {
  return selectSingleVariant(input, UHD_WIDTH, UHD_HEIGHT, "PQ");
}

// Numeric metadata only, independent of AAC/HEVC/fps compatibility. Unknown
// or absent range declarations are not silently classified as SDR. No URI,
// key declaration, raw attribute, or rewritten body escapes this summary.
export function summarizeUhdVariantRanges(input) {
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
