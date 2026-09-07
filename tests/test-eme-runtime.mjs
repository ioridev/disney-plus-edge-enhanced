import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const testMode = process.argv[2] || '4k-hdr10-hw';
const persistentTest = new Set(['4k-hdr10-hw-persistent', '1080p-hevc-hw-persistent', '1080p-hevc-hw-persistent-cap']).has(testMode);
const calls = [];
let mediaKeysPromise;
let keyRequestPromise;
let updatePromise;
let setKeysPromise;
let failObserverRegistration = false;
const nativeFailure = new DOMException('Decoder refused', 'NotSupportedError');

class Session extends EventTarget {
  constructor() { super(); this.keyStatuses = new Map(); this.closed = new Promise(() => {}); }
  addEventListener(...args) {
    if (failObserverRegistration) throw new Error('diagnostic listener failed');
    return super.addEventListener(...args);
  }
  generateRequest(...args) { calls.push(['generateRequest', ...args]); return keyRequestPromise; }
  update(...args) { calls.push(['update', ...args]); return updatePromise; }
}
class Keys {
  createSession(...args) { calls.push(['createSession', ...args]); return new Session(); }
}
class Access {
  constructor(keySystem, configuration) { this.keySystem = keySystem; this.configuration = configuration; }
  getConfiguration() { return this.configuration; }
  createMediaKeys(...args) { calls.push(['createMediaKeys', ...args]); return mediaKeysPromise; }
}
class Video extends EventTarget {
  setMediaKeys(...args) { calls.push(['setMediaKeys', ...args]); return setKeysPromise; }
}
class SourceBuffer extends EventTarget {}
class MediaSource {
  addSourceBuffer(type) {
    if (type === 'invalid') throw nativeFailure;
    return failObserverRegistration ? {addEventListener() {throw new Error('diagnostic listener failed');}} : new SourceBuffer();
  }
}
class Navigator {
  requestMediaKeySystemAccess(keySystem, configurations) {
    calls.push(['requestMediaKeySystemAccess', keySystem, configurations]);
    if (keySystem === 'reject') return Promise.reject(nativeFailure);
    return Promise.resolve(new Access(keySystem, configurations[0]));
  }
}
const document = {documentElement: null, querySelectorAll: () => []};
const makeStorage = (entries) => {
  const values = new Map(entries);
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
};
const localStore = makeStorage([['ioridev.disneyplus4k.mode.v1', 'original']]);
const sessionStore = makeStorage([['ioridev.disneyplus4k.once.v0.3.16', JSON.stringify({version:'0.3.16', mode:testMode, documentUrl:'https://www.disneyplus.com/ja-jp/play/test', createdAt:Date.now()})]]);
const context = vm.createContext({
  URL, console, navigator: new Navigator(), document,
  MediaKeySystemAccess: Access, MediaKeys: Keys, MediaKeySession: Session,
  HTMLMediaElement: Video, MediaSource,
  localStorage: localStore, sessionStorage: sessionStore,
  performance: {getEntriesByType: () => [{type:'reload'}]},
  location: {href: 'https://www.disneyplus.com/ja-jp/play/test', pathname:'/ja-jp/play/test'},
  MutationObserver: class {observe() {}},
  addEventListener() {}, setInterval() {}, setTimeout() {},
});
vm.runInContext(source, context);
assert.equal(sessionStore.getItem('ioridev.disneyplus4k.once.v0.3.16'), null, 'consume the ticket before the first EME call');
assert.equal(localStore.getItem('ioridev.disneyplus4k.mode.v1'), 'original', 'never persist the test as the restart mode');

const config = [{initDataTypes:['cenc'], videoCapabilities:[{contentType:'video/mp4',robustness:'2000'}]}];
const access = await context.navigator.requestMediaKeySystemAccess('com.microsoft.playready', config);
assert.equal(access.keySystem, 'com.microsoft.playready.recommendation.3000');
assert.equal(config[0].videoCapabilities[0].robustness, '2000');
assert.equal(access.getConfiguration().persistentState, persistentTest ? 'required' : undefined);
assert.equal(config[0].persistentState, undefined, 'do not mutate source session policy');
mediaKeysPromise = Promise.resolve(new Keys());
assert.equal(access.createMediaKeys(), mediaKeysPromise, 'observer must return the original promise');
const keys = await mediaKeysPromise;
const session = keys.createSession('temporary');
assert.equal(calls.at(-1)[1], persistentTest ? 'persistent-license' : 'temporary');
keys.createSession(undefined, 'extra');
assert.deepEqual(calls.at(-1), ['createSession', persistentTest ? 'persistent-license' : undefined, 'extra']);
keys.createSession('invalid-session-type');
assert.deepEqual(calls.at(-1), ['createSession', 'invalid-session-type'], 'invalid arguments still reach the native API');
new Keys().createSession('temporary');
assert.deepEqual(calls.at(-1), ['createSession', 'temporary'], 'untracked MediaKeys must not be changed');
const challenge = new Uint8Array([1,2,3,4]);
keyRequestPromise = Promise.resolve();
assert.equal(session.generateRequest('cenc', challenge), keyRequestPromise);
assert.equal(calls.find(c => c[0] === 'generateRequest')[2], challenge, 'do not change initialization bytes');
const license = new Uint8Array([255,0,128,66]);
updatePromise = Promise.resolve();
assert.equal(session.update(license), updatePromise);
assert.equal(calls.find(c => c[0] === 'update')[1], license, 'do not change license bytes');
assert.match(localStore.getItem('ioridev.disneyplus4k.checkpoint.v1'), /update-start/);
const checkpoint = JSON.parse(localStore.getItem('ioridev.disneyplus4k.checkpoint.v1'));
assert.deepEqual(Object.keys(checkpoint).sort(), ['mode', 'steps', 'version'], 'checkpoint has only allowlisted fields');
assert.equal(checkpoint.mode, testMode);
assert.equal(checkpoint.version, '0.3.16');
for (const step of checkpoint.steps) {
  assert.deepEqual(Object.keys(step).sort(), ['phase', 'time'], 'never persist license bytes or arbitrary fields');
  assert.equal(typeof step.time, 'number');
  assert.ok(Number.isFinite(step.time));
  assert.match(step.phase, /^(test-start|cdm-create-start|cdm-create-ok|cdm-attach-ok|cdm-detach|session-event|keys-pending|keys-usable|keys-other|media-error|generateRequest-start|generateRequest-ok|update-start|update-ok|video-metadata|video-playing|video-waiting-for-key|page-exit)$/);
}
session.keyStatuses.set(new Uint8Array([99,1,4]), 'usable');
session.dispatchEvent(new Event('keystatuseschange'));
const video = new Video();
setKeysPromise = Promise.resolve();
assert.equal(video.setMediaKeys(keys), setKeysPromise);
assert.equal(calls.find(c => c[0] === 'setMediaKeys')[1], keys);
await setKeysPromise;
assert.equal(video.setMediaKeys(), setKeysPromise);
assert.deepEqual(calls.at(-1), ['setMediaKeys'], 'missing argument must remain missing');
video.setMediaKeys(null, 'extra');
assert.deepEqual(calls.at(-1), ['setMediaKeys', null, 'extra'], 'preserve complete native argument list');
setKeysPromise = Promise.reject(nativeFailure);
assert.equal(video.setMediaKeys(null), setKeysPromise);
await assert.rejects(setKeysPromise, error => error === nativeFailure);
await assert.rejects(context.navigator.requestMediaKeySystemAccess('reject', config), error => error === nativeFailure);
updatePromise = Promise.reject(nativeFailure);
assert.equal(session.update(license), updatePromise);
await assert.rejects(updatePromise, error => error === nativeFailure);
assert.throws(() => new MediaSource().addSourceBuffer('invalid'), error => error === nativeFailure);
const buffer = new MediaSource().addSourceBuffer('video/mp4');
buffer.dispatchEvent(new Event('error'));
failObserverRegistration = true;
assert.ok(keys.createSession() instanceof Session, 'diagnostic registration cannot hide a native session');
assert.ok(new MediaSource().addSourceBuffer('video/mp4'), 'diagnostic registration cannot hide a native SourceBuffer');
await Promise.resolve();
console.log(`EME/MSE runtime (${testMode}): opt-in session mapping scoped; native promises, errors, and license bytes preserved`);
