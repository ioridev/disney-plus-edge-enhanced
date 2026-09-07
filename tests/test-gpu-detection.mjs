import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({URL, __DP4K_TEST__: true});
vm.runInContext(fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8'), context);
const api = context.__DP4K_INTERNALS__;
for (const [vendor, renderer, expected] of [
  ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, D3D11)', 'intel'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU, D3D11)', 'nvidia'],
  ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 9070 XT, D3D11)', 'amd'],
  ['Intel', 'NVIDIA GeForce', 'unknown'],
  ['Google Inc.', 'Google SwiftShader', 'software'],
  ['Intel', 'Microsoft Basic Render Driver', 'software'],
  ['Intel', 'llvmpipe', 'software'],
  ['WebKit', 'WebKit WebGL', 'unknown'],
  ['notintel', 'Some GPU', 'unknown'],
  ['Intel', 'x'.repeat(513), 'unknown'],
  [null, 'Intel', 'unknown'],
]) assert.equal(api.classifyGpuVendor(vendor, renderer), expected);

let released = 0;
let contextCalls = 0;
const fakeGl = {
  getExtension: (name) => name === 'WEBGL_debug_renderer_info'
    ? {UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2}
    : name === 'WEBGL_lose_context' ? {loseContext: () => released++} : null,
  getParameter: (name) => name === 1 ? 'Google Inc. (Intel)' : 'ANGLE (Intel, Intel Iris Xe)',
};
const doc = {createElement: (tag) => {
  assert.equal(tag, 'canvas');
  return {getContext: (name, options) => {
    contextCalls++;
    assert.equal(options.powerPreference, undefined, 'never select low-power Intel just to pass the check');
    assert.equal(options.failIfMajorPerformanceCaveat, true);
    return fakeGl;
  }};
}};
assert.equal(api.detectGpuVendor(doc), 'intel');
assert.equal(contextCalls, 1);
assert.equal(released, 1, 'the temporary context is released');
fakeGl.getParameter = () => {throw new Error('private driver text');};
assert.equal(api.detectGpuVendor(doc), 'unknown');
assert.equal(released, 2, 'exceptions still release the context');
assert.equal(api.detectGpuVendor({createElement: () => ({getContext: () => null})}), 'unknown');
assert.equal(api.detectGpuVendor({}), 'unknown');

const storage = () => {
  const values = new Map();
  return {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key)};
};
const url = 'https://www.disneyplus.com/ja-jp/play/gpu-fixture';
for (const gpu of ['intel', 'nvidia', 'amd', 'unknown', 'software']) {
  const local = storage();
  const session = storage();
  assert.equal(api.prepareModeReload(api.INTEL_4K_MODE, local, session, url, 100, true).reload, true);
  const ticket = JSON.parse(session.getItem(api.TEST_TICKET_KEY));
  assert.equal(ticket.requireIntelGpu, true);
  assert.equal(local.getItem(api.STORAGE_KEY), 'original', '4K never becomes a persistent default');
  const outcome = api.consumeStartupMode(local, session, url, 101, 'reload', () => {
    assert.equal(session.getItem(api.TEST_TICKET_KEY), null, 'consume the ticket BEFORE querying any GPU');
    return gpu;
  });
  assert.equal(outcome.mode, gpu === 'intel' ? api.INTEL_4K_MODE : 'original');
  if (gpu !== 'intel') assert.equal(outcome.showDebug, true, 'show the rejection reason instead of silently falling back');
  assert.equal(api.consumeStartupMode(local, session, url, 102, 'reload', () => 'intel').mode, 'original', 'a ticket cannot survive another reload');
}
{
  const local = storage();
  const session = storage();
  api.prepareModeReload(api.INTEL_4K_MODE, local, session, url, 100, true);
  assert.equal(api.consumeStartupMode(local, session, url, 101, 'reload', () => {throw new Error('probe failed');}).mode, 'original');
  assert.equal(session.getItem(api.TEST_TICKET_KEY), null);
  assert.equal(api.prepareModeReload('fullhd', local, session, url, 200, true).reload, false);
  api.prepareModeReload('fullhd', local, session, url, 200);
  assert.equal(api.consumeStartupMode(local, session, url, 201, 'reload', () => {throw new Error('must not probe for FHD');}).mode, 'fullhd');
}
console.log('GPU hint: Intel/NVIDIA/AMD/software/unknown, bounded input, context release, no forced adapter, one-page Intel gate and post-reload recheck passed (mock only).');
