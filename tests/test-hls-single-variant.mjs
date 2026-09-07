import assert from "node:assert/strict";
import { selectSingleFhdVariant, selectSingleHdrUhdVariant, selectSingleUhdVariant, summarizeUhdVariantRanges } from "../src/hls-single-variant.mjs";

const REASONS = new Set([
  "already-single-compatible",
  "ambiguous-candidate",
  "bom",
  "duplicate-attribute",
  "external-variant-config",
  "incomplete-variant",
  "invalid-control",
  "invalid-input",
  "invalid-newline",
  "line-limit",
  "malformed-attribute-list",
  "media-playlist",
  "mixed-playlist",
  "missing-group",
  "no-compatible-candidate",
  "not-master",
  "orphan-uri",
  "oversize",
  "selected-compatible-variant",
  "output-invariant-failed",
]);

function streamFor(width, height, bandwidth, codecs = "hvc1.2.4.L153.B0,mp4a.40.2", extra = "") {
  return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="${codecs}",RESOLUTION=${width}x${height},VIDEO-RANGE=SDR,FRAME-RATE=23.976${extra}`;
}

function stream(bandwidth, codecs = "hvc1.2.4.L153.B0,mp4a.40.2", extra = "") {
  return streamFor(1920, 1080, bandwidth, codecs, extra);
}

function uhdStream(bandwidth, codecs = "hvc1.2.4.L153.B0,mp4a.40.2", extra = "") {
  return streamFor(3840, 2160, bandwidth, codecs, extra);
}

function hdrUhdStream(bandwidth, codecs = "hvc1.2.4.L153.B0,mp4a.40.2", extra = "") {
  return uhdStream(bandwidth, codecs, extra).replace("VIDEO-RANGE=SDR", "VIDEO-RANGE=PQ");
}

function countNormalVariants(text) {
  const lines = text.split(/\r\n|\n/u);
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("#EXT-X-STREAM-INF:")) {
      assert.ok(index + 1 < lines.length && lines[index + 1] && !lines[index + 1].startsWith("#"));
      count += 1;
      index += 1;
    }
  }
  return count;
}

function expectShape(result) {
  assert.deepEqual(Object.keys(result).sort(), [
    "candidateCount",
    "changed",
    "height",
    "reason",
    "text",
    "variantCount",
    "width",
  ]);
  assert.ok(REASONS.has(result.reason), `unexpected fixed reason: ${result.reason}`);
  assert.equal(typeof result.changed, "boolean");
  assert.equal(typeof result.text, "string");
  assert.equal(typeof result.variantCount, "number");
  assert.equal(typeof result.candidateCount, "number");
}

const mediaLines = [
  "#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID=\"video\",NAME=\"Main video\"",
  "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Main, stereo\",DEFAULT=YES,URI=\"audio/main.m3u8?auth=audio-secret\"",
  "#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"sub\",NAME=\"English\",DEFAULT=NO,URI=\"subs/en.m3u8?auth=sub-secret\"",
  "#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID=\"cc\",NAME=\"CC\",INSTREAM-ID=\"CC1\"",
];
const sessionKey = "#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI=\"skd://license.secret?x=1\",KEYFORMAT=\"com.example\",KEYFORMATVERSIONS=\"1\"";
const iframe = "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI=\"iframe.m3u8?auth=iframe-secret\"";
const lowTag = stream(500000, "hvc1.2.4.L153.B0,mp4a.40.2", ",AUDIO=\"aud\",SUBTITLES=\"sub\",CLOSED-CAPTIONS=\"cc\"");
const lowUri = "low.m3u8?auth=low-secret";
const highTag = stream(800000, "hev1.1.6.L93.90,mp4a.40.2", ",AUDIO=\"aud\",SUBTITLES=\"sub\",CLOSED-CAPTIONS=\"cc\"");
const highUri = "high.m3u8?auth=high-secret";
const badTag = stream(700000, "avc1.640028,mp4a.40.2", ",AUDIO=\"aud\",SUBTITLES=\"sub\",CLOSED-CAPTIONS=\"cc\"");
const badUri = "bad.m3u8?auth=bad-secret";

// The HDR wrapper selects only explicit PQ 3840x2160 variants.  It retains
// the same codec, frame-rate, group, maximum-bandwidth, and unique-winner
// constraints as the SDR wrappers, and preserves every non-variant line and
// the selected URI byte-for-byte.
{
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    uhdStream(1800000),
    "uhd-sdr.m3u8?auth=uhd-sdr-secret",
    hdrUhdStream(2300000),
    "uhd-pq-low.m3u8?auth=uhd-pq-low-secret",
    hdrUhdStream(2400000, "hev1.1.6.L93.90,mp4a.40.2"),
    "uhd-pq-high.m3u8?auth=uhd-pq-high-secret",
    hdrUhdStream(2500000, "avc1.640028,mp4a.40.2"),
    "uhd-pq-avc.m3u8?auth=uhd-pq-avc-secret",
    hdrUhdStream(2600000).replace("FRAME-RATE=23.976", "FRAME-RATE=60.001"),
    "uhd-pq-fast.m3u8?auth=uhd-pq-fast-secret",
    hdrUhdStream(2000000).replace("VIDEO-RANGE=PQ", "VIDEO-RANGE=HLG"),
    "uhd-hlg.m3u8?auth=uhd-hlg-secret",
    uhdStream(2700000).replace(",VIDEO-RANGE=SDR", ""),
    "uhd-unspecified.m3u8?auth=uhd-unspecified-secret",
  ];
  const input = `${lines.join("\r\n")}\r\n`;
  const expected = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    hdrUhdStream(2400000, "hev1.1.6.L93.90,mp4a.40.2"),
    "uhd-pq-high.m3u8?auth=uhd-pq-high-secret",
  ];
  const hdrResult = selectSingleHdrUhdVariant(input);
  expectShape(hdrResult);
  assert.equal(hdrResult.changed, true);
  assert.equal(hdrResult.reason, "selected-compatible-variant");
  assert.equal(hdrResult.variantCount, 7);
  assert.equal(hdrResult.candidateCount, 2);
  assert.equal(hdrResult.width, 3840);
  assert.equal(hdrResult.height, 2160);
  assert.equal(hdrResult.text, `${expected.join("\r\n")}\r\n`);
  assert.equal(countNormalVariants(hdrResult.text), 1);
  assert.ok(hdrResult.text.includes(sessionKey));
  assert.ok(hdrResult.text.includes(iframe));
  assert.ok(hdrResult.text.includes("uhd-pq-high-secret"));
  assert.ok(!hdrResult.text.includes("uhd-sdr-secret"));
  assert.ok(!hdrResult.text.includes("uhd-pq-low-secret"));
  assert.ok(!hdrResult.text.includes("uhd-pq-avc-secret"));
  assert.ok(!hdrResult.text.includes("uhd-pq-fast-secret"));
  assert.ok(!hdrResult.text.includes("uhd-hlg-secret"));
  assert.ok(!hdrResult.text.includes("uhd-unspecified-secret"));

  const hdrReselected = selectSingleHdrUhdVariant(hdrResult.text);
  assert.equal(hdrReselected.reason, "already-single-compatible");
  assert.equal(hdrReselected.changed, false);
  assert.equal(hdrReselected.variantCount, 1);
  assert.equal(hdrReselected.candidateCount, 1);
  assert.equal(hdrReselected.width, 3840);
  assert.equal(hdrReselected.height, 2160);
  assert.equal(hdrReselected.text, hdrResult.text);

  // The existing SDR selector keeps its original contract and chooses the
  // SDR variant from the same Master Playlist; PQ is never treated as SDR.
  const sdrResult = selectSingleUhdVariant(input);
  assert.equal(sdrResult.reason, "selected-compatible-variant");
  assert.equal(sdrResult.variantCount, 7);
  assert.equal(sdrResult.candidateCount, 1);
  assert.equal(sdrResult.text, `${[
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    uhdStream(1800000),
    "uhd-sdr.m3u8?auth=uhd-sdr-secret",
  ].join("\r\n")}\r\n`);
}

// PQ selection is fail-closed for HLG, an absent VIDEO-RANGE, and explicit
// SDR; those ranges must never be inferred or reclassified as PQ.
{
  const input = [
    "#EXTM3U",
    hdrUhdStream(2300000).replace("VIDEO-RANGE=PQ", "VIDEO-RANGE=HLG"),
    "hlg.m3u8",
    uhdStream(2200000).replace(",VIDEO-RANGE=SDR", ""),
    "no-range.m3u8",
    hdrUhdStream(2000000).replace("VIDEO-RANGE=PQ", 'VIDEO-RANGE="PQ"'),
    "quoted-pq.m3u8",
    uhdStream(2100000),
    "sdr.m3u8",
  ].join("\n");
  const result = selectSingleHdrUhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "no-compatible-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 4);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.text, input);
}

// Equal maximum PQ BANDWIDTH remains ambiguous, even when the URIs differ.
{
  const input = [
    "#EXTM3U",
    hdrUhdStream(2400000),
    "pq-a.m3u8?token=pq-a-secret",
    hdrUhdStream(2400000, "hev1.1.6.L93.90,mp4a.40.2"),
    "pq-b.m3u8?token=pq-b-secret",
  ].join("\n");
  const result = selectSingleHdrUhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "ambiguous-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 2);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.width, null);
  assert.equal(result.height, null);
  assert.equal(result.text, input);
}

// A quoted comma in CODECS/NAME must not split the attribute list.  The
// CRLF, I-frame, session-key, media lines, comments, and unknown master tag
// are all retained byte-for-byte while regular variant pairs are filtered.
{
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    lowTag,
    lowUri,
    highTag,
    highUri,
    badTag,
    badUri,
  ];
  const input = `${lines.join("\r\n")}\r\n`;
  const expected = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    highTag,
    highUri,
  ];
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.changed, true);
  assert.equal(result.reason, "selected-compatible-variant");
  assert.equal(result.variantCount, 3);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.text, `${expected.join("\r\n")}\r\n`);
  assert.equal(countNormalVariants(result.text), 1);
  assert.ok(result.text.includes(highUri));
  assert.ok(!result.text.includes(lowUri));
  assert.ok(!result.text.includes(badUri));
  assert.ok(result.text.includes(sessionKey));
  assert.ok(result.text.includes(iframe));
  const reparsed = selectSingleFhdVariant(result.text);
  assert.equal(reparsed.reason, "already-single-compatible");
  assert.equal(reparsed.variantCount, 1);
  assert.equal(reparsed.candidateCount, 1);
  assert.equal(reparsed.text, result.text);
}

// UHD selection uses the same SDR, HEVC+AAC, frame-rate, and maximum
// BANDWIDTH rules as FHD.  FHD and HDR variants are not candidates for the
// UHD wrapper, while related Master Playlist tags and the selected URI remain
// byte-for-byte intact.
{
  const hdrUhdTag = uhdStream(2400000).replace("VIDEO-RANGE=SDR", "VIDEO-RANGE=PQ");
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    stream(4200000),
    "fhd-low.m3u8?auth=fhd-low-secret",
    stream(4300000, "hev1.1.6.L93.90,mp4a.40.2"),
    "fhd-high.m3u8?auth=fhd-high-secret",
    uhdStream(1800000),
    "uhd-low.m3u8?auth=uhd-low-secret",
    uhdStream(2200000, "hev1.1.6.L93.90,mp4a.40.2"),
    "uhd-high.m3u8?auth=uhd-high-secret",
    hdrUhdTag,
    "uhd-hdr.m3u8?auth=uhd-hdr-secret",
  ];
  const input = `${lines.join("\r\n")}\r\n`;
  const expected = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    ...mediaLines,
    sessionKey,
    iframe,
    "# a master comment",
    uhdStream(2200000, "hev1.1.6.L93.90,mp4a.40.2"),
    "uhd-high.m3u8?auth=uhd-high-secret",
  ];
  const result = selectSingleUhdVariant(input);
  expectShape(result);
  assert.equal(result.changed, true);
  assert.equal(result.reason, "selected-compatible-variant");
  assert.equal(result.variantCount, 5);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.width, 3840);
  assert.equal(result.height, 2160);
  assert.equal(result.text, `${expected.join("\r\n")}\r\n`);
  assert.equal(countNormalVariants(result.text), 1);
  assert.ok(result.text.includes(sessionKey));
  assert.ok(result.text.includes(iframe));
  assert.ok(result.text.includes("# a master comment"));
  assert.ok(!result.text.includes("fhd-low-secret"));
  assert.ok(!result.text.includes("fhd-high-secret"));
  assert.ok(!result.text.includes("uhd-hdr-secret"));
  const reparsed = selectSingleUhdVariant(result.text);
  assert.equal(reparsed.reason, "already-single-compatible");
  assert.equal(reparsed.variantCount, 1);
  assert.equal(reparsed.candidateCount, 1);
  assert.equal(reparsed.width, 3840);
  assert.equal(reparsed.height, 2160);
  assert.equal(reparsed.text, result.text);
}

// An UHD wrapper does not fall back to FHD when no 3840x2160 variant exists.
{
  const input = [
    "#EXTM3U",
    stream(900000),
    "fhd-a.m3u8",
    stream(800000, "hev1.1.6.L93.90,mp4a.40.2"),
    "fhd-b.m3u8",
  ].join("\n");
  const result = selectSingleUhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "no-compatible-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 2);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.text, input);
}

// HDR-only UHD input is deliberately rejected by the strict SDR comparison.
{
  const input = [
    "#EXTM3U",
    uhdStream(2200000).replace("VIDEO-RANGE=SDR", "VIDEO-RANGE=PQ"),
    "uhd-hdr-only.m3u8",
  ].join("\n");
  const result = selectSingleUhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "no-compatible-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 1);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.text, input);
}

// A UHD stream without VIDEO-RANGE is not treated as SDR by inference.
{
  const input = [
    "#EXTM3U",
    uhdStream(2200000).replace(",VIDEO-RANGE=SDR", ""),
    "uhd-no-range.m3u8",
  ].join("\n");
  const result = selectSingleUhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "no-compatible-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 1);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.text, input);
}

// Equal maximum UHD BANDWIDTH remains ambiguous and leaves the source body
// untouched rather than choosing by playlist order.
{
  const input = [
    "#EXTM3U",
    uhdStream(2200000),
    "uhd-a.m3u8",
    uhdStream(2200000, "hev1.1.6.L93.90,mp4a.40.2"),
    "uhd-b.m3u8",
  ].join("\n");
  const result = selectSingleUhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "ambiguous-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 2);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.width, null);
  assert.equal(result.height, null);
  assert.equal(result.text, input);
}

// With one already-compatible normal Variant, no rewrite is needed.  This
// operation cannot prove or disable time-based key rotation downstream.
{
  const input = `#EXTM3U\n${stream(900000, "hvc1.2.4.L153.B0,mp4a.40.2", ",CLOSED-CAPTIONS=NONE")}\nonly.m3u8\n`;
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "already-single-compatible");
  assert.equal(result.text, input);
  assert.equal(result.variantCount, 1);
  assert.equal(result.candidateCount, 1);
}

// Only the maximum compatible BANDWIDTH is selected; a tie at that maximum is
// deliberately ambiguous and leaves the original body untouched.
{
  const input = [
    "#EXTM3U",
    stream(900000),
    "a.m3u8",
    stream(900000, "hev1.1.6.L93.90,mp4a.40.2"),
    "b.m3u8",
  ].join("\n");
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "ambiguous-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.text, input);
  assert.equal(result.variantCount, 2);
  assert.equal(result.candidateCount, 2);
}

// Missing referenced AUDIO/SUBTITLES/CLOSED-CAPTIONS groups rejects the
// complete master instead of silently deleting the malformed variant.
{
  const input = `#EXTM3U\n${stream(900000, "hvc1.2.4.L153.B0,mp4a.40.2", ",AUDIO=\"missing\"")}\nmissing-group.m3u8`;
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "missing-group");
  assert.equal(result.changed, false);
  assert.equal(result.text, input);
}

// Unsupported codec, explicit non-SDR range, frame rate over 60, and absent
// FRAME-RATE are not compatible candidates.
{
  const input = [
    "#EXTM3U",
    stream(900000, "avc1.640028,mp4a.40.2"),
    "avc.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS=\"hvc1.2.4.L153.B0,mp4a.40.2\",RESOLUTION=1920x1080,VIDEO-RANGE=PQ,FRAME-RATE=30",
    "pq.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=700000,CODECS=\"hvc1.2.4.L153.B0,mp4a.40.2\",RESOLUTION=1920x1080,VIDEO-RANGE=SDR,FRAME-RATE=60.001",
    "fast.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=600000,CODECS=\"hvc1.2.4.L153.B0,mp4a.40.2\",RESOLUTION=1920x1080,VIDEO-RANGE=SDR",
    "unknown-rate.m3u8",
  ].join("\n");
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "no-compatible-candidate");
  assert.equal(result.changed, false);
  assert.equal(result.text, input);
  assert.equal(result.variantCount, 4);
  assert.equal(result.candidateCount, 0);
}

// RFC 8216 attribute-list duplicates and unterminated quoted strings fail
// closed; quoted commas remain valid when the quote is closed.
{
  const duplicate = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,BANDWIDTH=2,CODECS=\"hvc1,mp4a.40.2\"\na.m3u8`;
  const duplicateResult = selectSingleFhdVariant(duplicate);
  expectShape(duplicateResult);
  assert.equal(duplicateResult.reason, "duplicate-attribute");
  assert.equal(duplicateResult.text, duplicate);

  const malformed = `#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"unterminated\n#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS=\"hvc1,mp4a.40.2\",RESOLUTION=1920x1080,VIDEO-RANGE=SDR,FRAME-RATE=24\na.m3u8`;
  const malformedResult = selectSingleFhdVariant(malformed);
  expectShape(malformedResult);
  assert.equal(malformedResult.reason, "malformed-attribute-list");
  assert.equal(malformedResult.text, malformed);
}

// An EXT-X-STREAM-INF URI is required immediately after the tag; blank/tag
// lines do not complete the pair.  A URI anywhere else is an orphan.
{
  const incomplete = `#EXTM3U\n${stream(900000)}\n#EXT-X-INDEPENDENT-SEGMENTS\n`;
  const incompleteResult = selectSingleFhdVariant(incomplete);
  expectShape(incompleteResult);
  assert.equal(incompleteResult.reason, "incomplete-variant");
  assert.equal(incompleteResult.text, incomplete);

  const orphan = "#EXTM3U\norphan.m3u8";
  const orphanResult = selectSingleFhdVariant(orphan);
  expectShape(orphanResult);
  assert.equal(orphanResult.reason, "orphan-uri");
  assert.equal(orphanResult.text, orphan);
}

// A media tag mixed into a Master Playlist is invalid, even if a regular
// Variant pair appears elsewhere.
{
  const mixed = `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts\n${stream(900000)}\nvalid.m3u8`;
  const result = selectSingleFhdVariant(mixed);
  expectShape(result);
  assert.equal(result.reason, "mixed-playlist");
  assert.equal(result.changed, false);
  assert.equal(result.text, mixed);
}

// A playlist with media tags but no regular Master variants remains
// distinguishable as a pure Media Playlist.
{
  const media = "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST";
  const result = selectSingleFhdVariant(media);
  expectShape(result);
  assert.equal(result.reason, "media-playlist");
  assert.equal(result.changed, false);
  assert.equal(result.variantCount, 0);
  assert.equal(result.text, media);
}

// CONTENT-STEERING can change the effective Variant set outside this body;
// fail closed before selecting or deleting any normal Variant pair.
{
  const steering = `#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI=\"https://steering.invalid/config?token=opaque\"\n${stream(900000)}\nsteered.m3u8`;
  const result = selectSingleFhdVariant(steering);
  expectShape(result);
  assert.equal(result.reason, "external-variant-config");
  assert.equal(result.changed, false);
  assert.equal(result.text, steering);
}

// VIDEO rendition groups are outside this narrow comparison.  Even when the
// group is declared, a candidate referencing it is not selected.
{
  const videoGroup = [
    "#EXTM3U",
    "#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID=\"video\",NAME=\"camera\"",
    `${stream(900000, "hvc1.2.4.L153.B0,mp4a.40.2", ",VIDEO=\"video\"")}`,
    "video-group.m3u8",
  ].join("\n");
  const result = selectSingleFhdVariant(videoGroup);
  expectShape(result);
  assert.equal(result.reason, "no-compatible-candidate");
  assert.equal(result.candidateCount, 0);
  assert.equal(result.text, videoGroup);
}

// RFC 8216 says BOMs are invalid.  Keep the original text and expose only a
// fixed classification; do not strip or normalize it.
{
  const input = `\uFEFF#EXTM3U\n${stream(900000)}\nsecret.m3u8`;
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "bom");
  assert.equal(result.changed, false);
  assert.equal(result.text, input);
}

// Bounds are measured in UTF-8 bytes and physical lines, not JS code units.
{
  const oversized = `#EXTM3U\n${"é".repeat(1024 * 1024)}`;
  const oversizeResult = selectSingleFhdVariant(oversized);
  expectShape(oversizeResult);
  assert.equal(oversizeResult.reason, "oversize");
  assert.equal(oversizeResult.text, oversized);

  const tooManyLines = `#EXTM3U\n${Array(20000).fill("#comment").join("\n")}`;
  const lineResult = selectSingleFhdVariant(tooManyLines);
  expectShape(lineResult);
  assert.equal(lineResult.reason, "line-limit");
  assert.equal(lineResult.text, tooManyLines);
}

// Non-string inputs are rejected before any coercion.  A hostile proxy/getter
// must not be observed, and no URI/raw diagnostic fields are returned.
{
  let touched = false;
  const hostile = new Proxy({}, {
    get() {
      touched = true;
      throw new Error("coercion must not run");
    },
    getPrototypeOf() {
      touched = true;
      throw new Error("prototype inspection must not run");
    },
  });
  assert.doesNotThrow(() => selectSingleFhdVariant(hostile));
  const proxyResult = selectSingleFhdVariant(hostile);
  expectShape(proxyResult);
  assert.equal(proxyResult.reason, "invalid-input");
  assert.equal(proxyResult.text, "");
  assert.equal(touched, false);

  const coercible = { [Symbol.toPrimitive]() { throw new Error("coercion must not run"); } };
  const coercionResult = selectSingleFhdVariant(coercible);
  expectShape(coercionResult);
  assert.equal(coercionResult.reason, "invalid-input");
  assert.equal(coercionResult.text, "");
  assert.deepEqual(Object.keys(coercionResult).filter((key) => /uri|raw|attribute|selected/iu.test(key)), []);
}

// Failure diagnostics are fixed labels and never include opaque URI/key
// material from the original body.
{
  const secret = "https://user:password@example.invalid/master.m3u8?token=opaque-secret";
  const input = `#EXTM3U\n${stream(900000)}\n${secret}\n#EXTINF:1,`;
  const result = selectSingleFhdVariant(input);
  expectShape(result);
  assert.equal(result.reason, "mixed-playlist");
  assert.equal(result.text, input);
  assert.equal(result.reason.includes("opaque-secret"), false);
  assert.equal(result.reason.includes("password"), false);
}

{
  const declarations = ["SDR", "PQ", "HLG", null, "FUTURE", '"SDR"'];
  const lines = ["#EXTM3U"];
  for (const [index, range] of declarations.entries()) {
    const rangeAttr = range === null ? "" : `,VIDEO-RANGE=${range}`;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${1000000 + index},RESOLUTION=3840x2160,CODECS="hvc1.2.4.H150.90,ec-3"${rangeAttr}`, `hidden-${index}.m3u8?token=not-logged`);
  }
  lines.push('#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000,RESOLUTION=3840x2160,VIDEO-RANGE=SDR,URI="hidden-iframe.m3u8"');
  lines.push(stream(2000000), "fhd.m3u8");
  const input = lines.join("\n");
  assert.deepEqual(summarizeUhdVariantRanges(input), {status:"validated-master",total:6,sdr:1,pq:1,hlg:1,unspecified:1,unknown:2});
  assert.equal(selectSingleUhdVariant(input).candidateCount, 0, "SDR metadata count is independent of compatible AAC selection");
  assert.equal(JSON.stringify(summarizeUhdVariantRanges(input)).includes("hidden"), false);
  for (const invalid of [null, new Proxy({}, {get(){throw new Error("do not inspect");}}), "#EXTM3U\n#EXTINF:1,\nsecret.m4s", `${input}\n#EXTINF:1,`]) {
    assert.deepEqual(summarizeUhdVariantRanges(invalid), {status:"invalid-or-non-master",total:0,sdr:0,pq:0,hlg:0,unspecified:0,unknown:0});
  }
}

console.log("test-hls-single-variant: ok");
