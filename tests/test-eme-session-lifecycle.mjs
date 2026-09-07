import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = process.argv[2] || new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url);
const originalSource = fs.readFileSync(sourcePath, 'utf8');
const version = /const VERSION = "([\d.]+)";/.exec(originalSource)[1];
const anchor = '  setInterval(updateVideoMeasurement, 1000);';
assert.equal(originalSource.split(anchor).length, 2, 'one test-only observation insertion point');
const source = originalSource.replace(anchor, `
  globalThis.__lifecycleTest = {
    read: () => ({events: [...state.events], activeCdm: describeActiveCdm(), blocked: state.playbackBlocked}),
    selectVideo: element => { state.video = {element}; },
  };
${anchor}`);

const makeStore = (entries = []) => {
  const values = new Map(entries);
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
};
const localStorage = makeStore([['ioridev.disneyplus4k.mode.v1', 'original']]);
const mode = '1080p-hevc-hw-persistent';
const url = 'https://www.disneyplus.com/ja-jp/play/lifecycle-fixture';
const sessionStorage = makeStore([[`ioridev.disneyplus4k.once.v${version}`, JSON.stringify({
  version, mode, documentUrl: url, createdAt: Date.now(),
})]]);
const context = vm.createContext({
  URL, DOMException, Event, EventTarget, console, localStorage, sessionStorage,
  document: {documentElement: null, querySelectorAll: () => []},
  performance: {getEntriesByType: () => [{type: 'reload'}]},
  location: {href: url, pathname: '/ja-jp/play/lifecycle-fixture'},
  MutationObserver: class {observe() {}},
  addEventListener() {}, setInterval() {}, setTimeout() {},
});
vm.runInContext(`
  globalThis.calls = [];
  globalThis.coercions = 0;
  globalThis.getterReads = 0;
  globalThis.observerFailures = false;
  globalThis.sentinelError = new Error('native sentinel');
  globalThis.methodPromise = Promise.resolve();
  globalThis.methodThrows = false;
  globalThis.closedKind = 'normal';
  globalThis.closedResolvers = new WeakMap();
  class Session extends EventTarget {
    constructor() {
      super();
      this.keyStatuses = new Map();
      if (closedKind === 'getter-throws') {
        Object.defineProperty(this, 'closed', {get() { throw sentinelError; }});
      } else if (closedKind === 'thenable') {
        this.closed = {get then() { getterReads++; throw sentinelError; }};
      } else {
        this.closed = new Promise((resolve, reject) => closedResolvers.set(this, {resolve, reject}));
      }
    }
    addEventListener(...args) {
      if (observerFailures === true || observerFailures === args[0]) throw sentinelError;
      return super.addEventListener(...args);
    }
    close(...args) {
      calls.push({method: 'close', receiver: this, args});
      if (methodThrows) throw sentinelError;
      return methodPromise;
    }
    remove(...args) {
      calls.push({method: 'remove', receiver: this, args});
      if (methodThrows) throw sentinelError;
      return methodPromise;
    }
  }
  class Keys { createSession(...args) { calls.push({method:'createSession', args}); return new Session(); } }
  class Access {
    constructor(id, config) { this.keySystem = id; this.config = config; }
    getConfiguration() { return this.config; }
    createMediaKeys() { return Promise.resolve(new Keys()); }
  }
  class Navigator {
    requestMediaKeySystemAccess(id, configurations) { return Promise.resolve(new Access(id, configurations[0])); }
  }
  class Video { setMediaKeys(keys) { this.mediaKeys = keys; return Promise.resolve(); } }
  globalThis.MediaKeySession = Session;
  globalThis.MediaKeys = Keys;
  globalThis.MediaKeySystemAccess = Access;
  globalThis.HTMLMediaElement = Video;
  globalThis.navigator = new Navigator();
  globalThis.badValue = {toString() { coercions++; throw sentinelError; }};
`, context);
vm.runInContext(source, context);
const run = expression => vm.runInContext(expression, context);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
await run(`(async () => {
  const access = await navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{videoCapabilities:[{contentType:'video/mp4'}]}]);
  globalThis.keys = await access.createMediaKeys();
  globalThis.video = new HTMLMediaElement();
  await video.setMediaKeys(keys);
  __lifecycleTest.selectVideo(video);
})()`);
const snapshot = () => JSON.parse(run('JSON.stringify(__lifecycleTest.read())'));

run(`globalThis.session = keys.createSession('persistent-license');
  session.keyStatuses.set(badValue, 'usable');
  session.dispatchEvent(new Event('keystatuseschange'));`);
assert.match(snapshot().activeCdm, /usable=1/, 'an open session contributes its observed status');
run(`closedResolvers.get(session).resolve('hardware-context-reset')`);
await flush();
assert.match(snapshot().events.at(-1), /closed: hardware-context-reset; app-requested=none$/);
assert.doesNotMatch(snapshot().activeCdm, /usable=1/, 'closed sessions must not leave stale usable counts');
run(`session.dispatchEvent(new Event('keystatuseschange'))`);
assert.doesNotMatch(snapshot().activeCdm, /usable=1/, 'late status events cannot resurrect a closed session');

for (const reason of ['internal-error', 'closed-by-application', 'release-acknowledged', 'hardware-context-reset', 'resource-evicted', undefined, 'unknown private reason', 42, null, Symbol('private reason')]) {
  run(`globalThis.session = keys.createSession('persistent-license')`);
  context.reason = reason;
  run('closedResolvers.get(session).resolve(reason)');
  await flush();
  const expected = reason === undefined ? 'reason-unavailable'
    : typeof reason !== 'string' ? 'reason-invalid'
    : reason === 'unknown private reason' ? 'reason-unknown' : reason;
  assert.match(snapshot().events.at(-1), new RegExp(`closed: ${expected}; app-requested=none$`));
}
run(`globalThis.session = keys.createSession('persistent-license'); closedResolvers.get(session).resolve(badValue);`);
await flush();
assert.match(snapshot().events.at(-1), /closed: reason-invalid/);
assert.equal(run('coercions'), 0, 'unknown reason and key objects must never be coerced');

for (const method of ['close', 'remove']) {
  run(`globalThis.session = keys.createSession('persistent-license');
    globalThis.marker = {};
    methodPromise = new Promise(resolve => { globalThis.resolveMethod = resolve; });
    globalThis.result = session.${method}(undefined, marker);`);
  assert.equal(run('result === methodPromise'), true, `${method} preserves native Promise identity`);
  assert.equal(run('calls.at(-1).receiver === session && calls.at(-1).args.length === 2 && calls.at(-1).args[0] === undefined && calls.at(-1).args[1] === marker'), true);
  assert.match(snapshot().events.at(-1), new RegExp(`${method} #\\d+: 開始$`));
  run(`closedResolvers.get(session).resolve('${method === 'close' ? 'closed-by-application' : 'release-acknowledged'}'); resolveMethod();`);
  await flush();
  assert.ok(snapshot().events.some(e => e.endsWith(`app-requested=${method}`)));
  assert.equal(snapshot().blocked, false, 'teardown observation does not block playback');

  run('methodThrows = true');
  assert.throws(() => run(`session.${method}()`), error => error === context.sentinelError);
  run('methodThrows = false; methodPromise = Promise.reject(sentinelError)');
  const rejected = run(`session.${method}()`);
  assert.equal(rejected, context.methodPromise);
  await assert.rejects(rejected, error => error === context.sentinelError);
  assert.equal(snapshot().blocked, false, 'teardown failure stays diagnostic-only');
}

for (const kind of ['thenable', 'getter-throws']) {
  run(`closedKind = '${kind}'; globalThis.session = keys.createSession('persistent-license');`);
  assert.ok(snapshot().events.some(e => e.endsWith('closed-observation-failed')));
  assert.equal(run('getterReads'), 0, 'never invoke a foreign .then getter');
}
run(`closedKind = 'normal'; globalThis.session = keys.createSession('persistent-license'); closedResolvers.get(session).reject(badValue);`);
await flush();
assert.match(snapshot().events.at(-1), /closed-observation-failed$/);
assert.equal(snapshot().blocked, false);

run(`globalThis.session = keys.createSession('persistent-license');
  ['usable','expired','released','output-restricted','output-downscaled','usable-in-future','status-pending','internal-error'].forEach((status, i) => session.keyStatuses.set(i, status));
  session.keyStatuses.set(badValue, badValue);
  session.dispatchEvent(new Event('keystatuseschange'));
  const event = new Event('message'); Object.defineProperty(event, 'messageType', {value: badValue}); session.dispatchEvent(event);`);
assert.match(snapshot().activeCdm, /usable-in-future=1/);
assert.match(snapshot().activeCdm, /unknown=1/);
assert.match(snapshot().events.at(-1), /message-type-unavailable$/);
assert.equal(run('coercions'), 0);
run(`Object.defineProperty(session, 'keyStatuses', {get() { throw sentinelError; }}); session.dispatchEvent(new Event('keystatuseschange'));`);
assert.match(snapshot().events.at(-1), /status-map-unavailable$/);

// A listener-registration problem must not prevent observing native closure.
run(`observerFailures = true; globalThis.session = keys.createSession('persistent-license'); closedResolvers.get(session).resolve('resource-evicted');`);
await flush();
assert.match(snapshot().events.at(-1), /closed: resource-evicted/);

// Failure of one listener must not suppress the other independent observation.
run(`observerFailures = 'message'; globalThis.session = keys.createSession('persistent-license');
  session.keyStatuses.set(badValue, 'usable'); session.dispatchEvent(new Event('keystatuseschange'));`);
assert.match(snapshot().activeCdm, /usable=1/);
assert.match(snapshot().activeCdm, /直近8セッション中、終了未観測の状態スナップショット/);
run(`observerFailures = 'keystatuseschange'; globalThis.session = keys.createSession('persistent-license');
  const messageEvent = new Event('message'); Object.defineProperty(messageEvent, 'messageType', {value:'license-request'}); session.dispatchEvent(messageEvent);`);
assert.match(snapshot().events.at(-1), /license-request$/);

// Native arguments are untouched; diagnostic labels must not coerce unusual input.
run(`observerFailures = false; globalThis.session = keys.createSession(badValue);`);
assert.equal(run('calls.at(-1).args[0] === badValue'), true);
assert.match(snapshot().events.at(-1), /session-type-unavailable$/);
run(`closedResolvers.get(session).resolve('hardware-context-reset')`);
await flush();
assert.match(snapshot().events.at(-1), /closed: hardware-context-reset/);
assert.equal(run('coercions'), 0);

// The helper never initiates native cleanup, and reports both observed attempts.
const cleanupCalls = run('calls.filter(c => c.method === "close" || c.method === "remove").length');
run(`globalThis.session = keys.createSession('persistent-license')`);
assert.equal(run('calls.filter(c => c.method === "close" || c.method === "remove").length'), cleanupCalls);
run(`methodPromise = Promise.resolve(); session.close(); session.remove(); closedResolvers.get(session).resolve('release-acknowledged');`);
await flush();
assert.ok(snapshot().events.some(e => /closed: release-acknowledged; app-requested=close\+remove$/.test(e)));

const checkpoint = JSON.parse(localStorage.getItem('ioridev.disneyplus4k.checkpoint.v1'));
assert.ok(checkpoint.steps.length <= 8);
for (const step of checkpoint.steps) assert.deepEqual(Object.keys(step).sort(), ['phase', 'time']);
assert.doesNotMatch(JSON.stringify(checkpoint), /unknown private reason|hardware-context-reset|app-requested|license bytes/,
  'closure details remain only in the bounded in-memory diagnostic trace');
assert.equal(snapshot().blocked, false);
console.log('EME lifecycle diagnostics: closure reasons, active-only counts, native teardown identity, unknown-value privacy, and observation failures passed (mock APIs only).');
