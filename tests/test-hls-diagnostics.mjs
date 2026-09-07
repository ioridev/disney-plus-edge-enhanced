import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL, __DP4K_TEST__: true });
vm.runInContext(source, context);
const api = context.__DP4K_INTERNALS__;
const parse = (text) => JSON.parse(JSON.stringify(api.extractHlsPlaybackResolutions(text)));
const playlist = (...lines) => ['#EXTM3U', ...lines].join('\n');
const normal720 = '#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS="hvc1.2.4.L93.90,mp4a.40.2",RESOLUTION=1280x720';

const mixed = playlist(
  normal720, 'normal.m3u8?token=private',
  '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,RESOLUTION=3840x2160,URI="iframe.m3u8?token=private"',
  '#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=10000,RESOLUTION=7680x4320,URI="image.m3u8"',
);
assert.deepEqual(parse(mixed), [{width:1280,height:720}]);
assert.equal(api.extractMaxResolution(mixed).width, 7680, 'legacy all-candidate heuristic remains distinguishable');
assert.ok(!JSON.stringify(parse(mixed)).includes('private'), 'keep only numeric dimensions, never URLs or attributes');

assert.deepEqual(parse(playlist(
  '#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160', 'uhd.m3u8',
  normal720, 'hd.m3u8', normal720, 'duplicate.m3u8',
)), [{width:3840,height:2160},{width:1280,height:720}]);
assert.deepEqual(parse(playlist(
  '#EXT-X-STREAM-INF:BANDWIDTH=3000000,NAME="not a field,RESOLUTION=7680x4320",RESOLUTION=1280x720', 'normal.m3u8',
)), [{width:1280,height:720}], 'quoted commas must not produce fake resolution attributes');
assert.deepEqual(parse(playlist(
  '#EXT-X-STREAM-INF:BANDWIDTH=3000000,NAME="not a field,RESOLUTION=7680x4320"', 'normal.m3u8',
)), [], 'resolution text inside quoted metadata is not a declaration');

for (const text of [
  null, undefined, '', 'RESOLUTION=3840x2160', '<MPD><Representation width="3840" height="2160"/></MPD>',
  playlist('#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,RESOLUTION=3840x2160,URI="iframe.m3u8"'),
  playlist('#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=10000,RESOLUTION=7680x4320,URI="image.m3u8"'),
  playlist('#comment RESOLUTION=3840x2160', '#EXTINF:4,', 'segment.m4s?RESOLUTION=3840x2160'),
  playlist(normal720),
  playlist(normal720, ' #EXT-X-I-FRAME-STREAM-INF:RESOLUTION=3840x2160'),
  playlist(normal720, '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,RESOLUTION=3840x2160,URI="iframe.m3u8"'),
  playlist('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,RESOLUTION=3840x2160', 'bad.m3u8'),
  playlist('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION="3840x2160"', 'bad.m3u8'),
  playlist('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=3840x2160,BROKEN', 'bad.m3u8'),
  playlist('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=3840x2160,NAME="unterminated', 'bad.m3u8'),
  playlist('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=100x100', 'bad.m3u8'),
  playlist(normal720, 'normal.m3u8', 'x'.repeat(2 * 1024 * 1024)),
]) assert.deepEqual(parse(text), [], String(text).slice(0, 180));

assert.deepEqual(parse('\uFEFF' + playlist(normal720, '', '#comment', 'normal.m3u8').replaceAll('\n','\r\n')),
  [{width:1280,height:720}]);
const many = playlist(...Array.from({length:30}, (_, index) => [
  `#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=${640 + index}x360`, `stream-${index}.m3u8`,
]).flat());
assert.equal(parse(many).length, 20, 'bound the numeric summary size');
assert.equal(parse(many)[0].width, 669, 'retain highest declarations when capped');
console.log('HLS diagnostics: normal variants vs I-frame/image declarations, quoted attributes, malformed tags, deduplication and privacy passed');

const keySummary = text => JSON.parse(JSON.stringify(api.summarizeHlsKeyDeclarations(text)));
assert.deepEqual(keySummary(playlist(
  '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,URI="SECRET_MEDIA_KEY"',
  '#EXT-X-KEY:METHOD=NONE',
  '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,URI="SECRET_SESSION_KEY"',
  '#EXT-X-DATERANGE:ID="SECRET_RANGE_ID",X-TYPE="PREFETCH-KEY",X-URI="SECRET_PREFETCH",X-KEYFORMAT="SECRET_FORMAT"',
)), { mediaKeyTags: 2, sessionKeyTags: 1, prefetchDateRanges: 1 });
for (const attrs of [
  'X-TYPE=PREFETCH-KEY',
  'X-TYPE="PREFETCH-KEY",X-TYPE="OTHER"',
  'X-TYPE="PREFETCH-KEY",BROKEN',
  'NAME="not an attribute,X-TYPE=PREFETCH-KEY"',
  'X-TYPE="PREFETCH-KEY",X-URI="unterminated',
]) assert.equal(keySummary(playlist('#EXT-X-DATERANGE:' + attrs)).prefetchDateRanges, 0);
assert.equal(keySummary(playlist('#EXT-X-DATERANGE:NAME="quoted,comma",X-TYPE="PREFETCH-KEY"')).prefetchDateRanges, 1);
assert.deepEqual(keySummary(playlist('#comment X-TYPE="PREFETCH-KEY"', 'file.m4s?X-TYPE=PREFETCH-KEY')),
  { mediaKeyTags: 0, sessionKeyTags: 0, prefetchDateRanges: 0 });
assert.deepEqual(keySummary('\uFEFF' + playlist('#EXT-X-KEY:METHOD=NONE').replaceAll('\n', '\r\n')),
  { mediaKeyTags: 1, sessionKeyTags: 0, prefetchDateRanges: 0 });
for (const value of [null, undefined, {}, '', '#EXTM3Ujunk', 'x'.repeat(2 * 1024 * 1024 + 1),
  playlist(...Array(20000).fill('#'))]) assert.equal(keySummary(value), null);
console.log('HLS key declarations: bounded numeric counts, quoted attributes, malformed/duplicate rejection, no key or URI output passed');
