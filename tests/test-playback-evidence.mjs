import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ URL, __DP4K_TEST__: true });
vm.runInContext(fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8'), context);
const { measure4kProgress, updateFailureHresult, safeError, intentionalStopLabel } = context.__DP4K_INTERNALS__;
assert.match(intentionalStopLabel(true, 'time-limit-75s', false), /時間制限/);
assert.match(intentionalStopLabel(true, 'time-limit-30s', false), /時間制限/);
assert.match(intentionalStopLabel(true, 'second-generate-forbidden', false), /第2鍵要求/);
assert.equal(intentionalStopLabel(true, 'time-limit-30s', true), '');
assert.equal(intentionalStopLabel(true, 'second-generate-forbidden', true), '');
assert.match(intentionalStopLabel(true, 'manifest-probe-complete', false), /診断を完了/);
assert.equal(intentionalStopLabel(true, 'time-limit-75s', true), '', 'actual media errors must not be hidden by the watchdog label');
assert.equal(intentionalStopLabel(false, 'time-limit-75s', false), '');
assert.equal(intentionalStopLabel(true, 'parser-rejected', false), '', 'unplanned abort is not a normal completed comparison');
const element = {};
const sample = (seconds, patch = {}) => ({
  element, generation: 1, source: 'blob:fixture', width: 3840, height: 2160, readyState: 4,
  paused: false, ended: false, seeking: false, hasError: false,
  now: seconds * 1000, currentTime: seconds, total: seconds * 24, dropped: 0,
  ...patch,
});

const run = (patch = {}, start = null) => {
  let evidence = start;
  for (let second = 0; second <= 6; second++) evidence = measure4kProgress(evidence, sample(second, patch));
  return evidence;
};
assert.equal(run().confirmed, true, '5+ seconds of moving 4K frames can be confirmed');
let evidence = measure4kProgress(null, sample(0));
for (let second = 1; second < 5; second++) {
  evidence = measure4kProgress(evidence, sample(second));
  assert.equal(evidence.confirmed, false, 'do not confirm before 5 seconds');
}
evidence = measure4kProgress(evidence, sample(5));
assert.equal(evidence.confirmed, true);
assert.equal(evidence.frames, 120);
for (const patch of [
  { readyState: 1 }, { readyState: undefined }, { total: 0 }, { paused: true },
  { ended: true }, { seeking: true }, { hasError: true }, { total: null },
  { dropped: null }, { total: NaN }, { total: -1 }, { dropped: -1 },
  { dropped: 99999 }, { width: 1920, height: 1080 }, { width: undefined },
  { height: 1440 }, { currentTime: 0 },
]) assert.equal(run(patch).confirmed, false, JSON.stringify(patch));
let allDropped = null;
for (let second = 0; second < 8; second++) {
  allDropped = measure4kProgress(allDropped, sample(second, { dropped: second * 24 }));
}
assert.equal(allDropped.confirmed, false, 'all-dropped frames are not playback');
for (const patch of [
  { element: {} }, { generation: 2 }, { source: 'blob:new' }, { now: 20000 }, { now: 4999 },
  { currentTime: 200 }, { currentTime: 4 }, { total: 1 }, { width: 4096 },
  { paused: true }, { total: 120 },
]) {
  const result = measure4kProgress(evidence, sample(6, patch));
  assert.equal(result.confirmed, false, `reset stale evidence: ${JSON.stringify(patch)}`);
  assert.equal(result.elapsedMs, 0);
}
assert.equal(measure4kProgress(evidence, null).confirmed, false, 'no visible video resets evidence');
assert.equal(run({ width: 1920 }, evidence).confirmed, false, 'downshift clears prior success');
assert.equal(updateFailureHresult(new Error('Update failed (2154840069)')), '0x80704005');
assert.equal(updateFailureHresult(new Error('Update failed (0x80704005)')), '0x80704005');
assert.equal(updateFailureHresult(new Error('Update failed (-2140127227)')), '0x80704005');
for (const message of ['HTTP 403', 'timestamp 2154840069', 'Update failed (9999999999)', 'Update failed (123)']) {
  assert.equal(updateFailureHresult(new Error(message)), '', 'do not invent HRESULT from unrelated numbers');
}
const redacted = safeError(new Error('Update failed (2154840069) at https://example.test/license?token=secret'));
assert.ok(redacted.includes('0x80704005'));
assert.ok(!redacted.includes('secret'));
console.log('Playback evidence: metadata-only, zero/all-dropped frames, stalls, seek, reset, 5s success, and HRESULT tests passed');
