import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const context = vm.createContext({URL, __DP4K_TEST__:true});
vm.runInContext(source, context);
const api = context.__DP4K_INTERNALS__;
const now = 100000;
const path = 'https://www.disneyplus.com/ja-jp/browse/entity-test';
const makeStorage = (entries = []) => {
  const values = new Map(entries);
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
};
const boot = (local, session, time = now, pathname = path, navigationType = 'reload') => api.consumeStartupMode(local, session, pathname, time, navigationType);
const arm = (mode, local, session) => api.prepareModeReload(mode, local, session, path, now);
const risky = Object.keys(api.MODE_PLANS).filter(api.isExperimentalMode);
assert.deepEqual(Object.keys(api.MODE_PLANS).sort(), [
  '4k-hdr10-single-pq',
  '4k-hdr10-sdr-manifest-probe',
  '4k-hevc-sdr-manifest-probe',
  '1080p-hevc-single-sdr',
  '4k-hevc-sdk-playready',
  '4k-hdr10-sdk-playready',
  '1080p-hevc-sdk-playready',
  '1080p-hevc-native-cap',
  '1080p-hevc-hw-persistent-cap',
  '1080p-hevc-hw-persistent', '4k-hdr10-hw-persistent', '4k-hdr10-hw', '4k-hevc-hw',
  '4k-sdr', '4k-hdr10', '1080p', 'original', 'sdk-inspect',
].sort(), 'all existing modes plus the non-decoding manifest probe remain available');
assert.equal(risky.length, 15);
assert.ok(risky.includes('4k-hdr10-single-pq'), 'bounded HDR comparison is one-document only');
assert.ok(risky.includes('4k-hdr10-sdr-manifest-probe'), 'HDR-response SDR probe is one-document only');
assert.ok(risky.includes('4k-hevc-sdr-manifest-probe'), 'manifest probe is one-document only');
assert.ok(risky.includes('1080p-hevc-single-sdr'), 'single-SDR comparison is one-document only');
assert.ok(risky.includes('4k-hevc-sdk-playready'), 'non-HDR-request UHD SDK comparison is also one-document only');
assert.ok(risky.includes('4k-hdr10-sdk-playready'), 'UHD SDK comparison is also one-document only');
assert.ok(risky.includes('1080p-hevc-sdk-playready'), 'SDK PlayReady comparison is also one-document only');
assert.ok(risky.includes('1080p-hevc-native-cap'), 'native-DRM comparison is also one-document only');
assert.deepEqual({
  scenario: api.MODE_PLANS['1080p-hevc-hw-persistent'].scenario,
  resolution: api.MODE_PLANS['1080p-hevc-hw-persistent'].resolution,
  hardwarePlayReady: api.MODE_PLANS['1080p-hevc-hw-persistent'].hardwarePlayReady,
  persistentSession: api.MODE_PLANS['1080p-hevc-hw-persistent'].persistentSession,
}, {
  scenario: 'tv-drm-ctr-h265-atmos', resolution: '1920x1080', hardwarePlayReady: true, persistentSession: true,
});
assert.equal(api.MODE_PLANS['1080p-hevc-hw-persistent'].scenario.includes('hdr10'), false, 'the comparison mode is not an HDR/4K mode');
assert.equal(api.MODE_PLANS['4k-hdr10-hw-persistent'].scenario, 'tv-drm-ctr-h265-hdr10-atmos', 'existing HDR persistent mode remains available');
assert.equal(boot(makeStorage(), makeStorage()).mode, 'original');
assert.equal(api.getModePlan('constructor').label, api.MODE_PLANS.original.label);

for (const mode of risky) {
  const local = makeStorage([[api.STORAGE_KEY, mode]]);
  const session = makeStorage();
  assert.equal(boot(local, session).mode, 'original', 'old persistent experimental mode is not restarted');
  assert.equal(local.getItem(api.STORAGE_KEY), 'original');
  assert.equal(arm(mode, local, session).reload, true);
  assert.equal(local.getItem(api.STORAGE_KEY), 'original', 'only original is durable');
  assert.equal(boot(local, session, now + 120).mode, mode, 'explicit ticket arms one document');
  assert.equal(session.getItem(api.TEST_TICKET_KEY), null, 'ticket consumed synchronously');
  assert.equal(boot(local, session, now + 121).mode, 'original', 'repeat/restart cannot reuse it');
  assert.equal(boot(local, makeStorage(), now + 121).mode, 'original', 'other tab cannot inherit localStorage mode');
}
for (const mode of ['4k-sdr', '1080p', 'original']) {
  const local = makeStorage();
  const session = makeStorage();
  assert.equal(arm(mode, local, session).reload, true);
  assert.equal(boot(local, session).mode, mode, 'nonexperimental choices remain persistent');
  assert.equal(boot(local, session).mode, mode);
}
for (const patch of [
  {version:'0.3.12'},
  {version:'0.3.0'}, {version:'0.3.2'}, {version:'0.3.3'}, {version:'0.3.4'}, {version:'0.3.5'}, {version:'0.3.6'}, {version:'0.3.7'}, {version:'0.3.8'}, {version:'0.3.9'}, {version:'0.3.10'}, {version:'0.3.11'}, {mode:'original'}, {mode:'unknown'}, {mode:'constructor'},
  {createdAt:now - 30000}, {createdAt:now - 30001}, {createdAt:now + 1}, {createdAt:null}, {createdAt:'100000'},
  {documentUrl:'https://www.disneyplus.com/ja-jp/play/other'},
  {documentUrl:`${path}?other=1`}, {documentUrl:`${path}#other`},
]) {
  const local = makeStorage([[api.STORAGE_KEY, 'original']]);
  const session = makeStorage([[api.TEST_TICKET_KEY, JSON.stringify({version:'0.3.16', mode:risky[0], documentUrl:path, createdAt:now, ...patch})]]);
  assert.equal(boot(local, session).mode, 'original', JSON.stringify(patch));
  assert.equal(session.getItem(api.TEST_TICKET_KEY), null);
}
for (const text of ['', '{', 'null', '123', '[]', '"4k-hdr10-hw-persistent"']) {
  const session = makeStorage([[api.TEST_TICKET_KEY, text]]);
  assert.equal(boot(makeStorage(), session).mode, 'original');
  assert.equal(session.getItem(api.TEST_TICKET_KEY), null);
}
for (const navigationType of ['navigate', 'back_forward', 'prerender', 'unknown', null]) {
  const local = makeStorage();
  const originalTab = makeStorage();
  arm(risky[0], local, originalTab);
  const copiedTab = makeStorage([[api.TEST_TICKET_KEY, originalTab.getItem(api.TEST_TICKET_KEY)]]);
  assert.equal(boot(local, copiedTab, now, path, navigationType).mode, 'original', 'copied ticket on a new/history navigation cannot activate');
  assert.equal(copiedTab.getItem(api.TEST_TICKET_KEY), null);
  assert.equal(boot(local, originalTab).mode, risky[0], 'original explicit reload remains independently available');
}
{
  const local = makeStorage();
  const session = makeStorage();
  assert.equal(arm(risky[0], local, session).reload, true);
  assert.equal(arm('original', local, session).reload, true);
  assert.equal(boot(local, session).mode, 'original', 'cancel removes a pending ticket');
  assert.equal(arm('unknown', local, session).reload, false);
}
for (const kind of ['local', 'session']) {
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const local = makeStorage([[api.STORAGE_KEY, risky[0]]]);
    const session = makeStorage();
    const broken = kind === 'local' ? local : session;
    broken[method] = () => { throw new Error('storage unavailable'); };
    if (kind === 'local' && method === 'removeItem') continue; // local deletion is not used.
    assert.equal(arm(risky[0], local, session).reload, false, `${kind}.${method} fails closed`);
    assert.equal(boot(local, session).mode, 'original');
  }
}
{
  const local = makeStorage([[api.STORAGE_KEY, 'original']]);
  const session = makeStorage();
  arm(risky[0], local, session);
  session.removeItem = () => {}; // write API returning does not prove deletion.
  assert.equal(boot(local, session).mode, 'original', 'unconsumable ticket is not activated');
}
{
  const local = makeStorage([[api.STORAGE_KEY, '4k-sdr']]);
  const session = makeStorage();
  local.setItem = () => {};
  assert.equal(arm(risky[0], local, session).reload, false, 'unverified writes cannot arm experiments');
  assert.equal(session.getItem(api.TEST_TICKET_KEY), null);
}
assert.equal(api.checkpointPhase('update #1', '開始'), 'update-start');
assert.equal(api.checkpointPhase('update #1', '成功'), 'update-ok');
assert.equal(api.checkpointPhase('鍵状態 #1', '{"status-pending":1}'), 'keys-pending');
assert.equal(api.checkpointPhase('鍵状態 #1', '{"usable":1}'), 'keys-usable');
assert.equal(api.checkpointPhase('unknown https://example.test?token=secret', 'secret'), null);
const filtered = api.readCheckpoint(JSON.stringify({
  version:'0.3.16', mode:risky[0], url:'secret', license:'secret',
  steps:[{time:now, phase:'update-start', secret:'secret'}, {time:1e100, phase:'update-ok'}, {time:now, phase:'secret'}],
}));
assert.equal(filtered.steps.length, 1);
assert.ok(!JSON.stringify(filtered).includes('secret'));
assert.equal(api.readCheckpoint('x'.repeat(4097)), null);
assert.equal(api.readCheckpoint('{'), null);
console.log('Startup guard: migration, one-document consumption, normal modes, expiration, malformed tickets, storage failures, and checkpoint privacy passed');
