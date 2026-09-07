import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const testMode = process.argv[2] || '4k-hdr10-hw-persistent';
const isUhdSdk = ['4k-hdr10-sdk-playready', '4k-hevc-sdk-playready'].includes(testMode);
const callbacks = new Map();
const sent = [];
let reloads = 0;
let pauses = 0;
class Xhr {
  open(...args) { this.openArgs = args; }
  send(body) { sent.push({kind:'xhr', url:this.openArgs[1], body}); }
  addEventListener() {}
}
const makeStorage = (entries) => {
  const values = new Map(entries);
  return {getItem:key => values.get(key) ?? null, setItem:(key, value) => values.set(key, value), removeItem:key => values.delete(key)};
};
const url = 'https://www.disneyplus.com/ja-jp/play/test';
const context = vm.createContext({
  URL, Headers, Request, DOMException,
  navigator:{requestMediaKeySystemAccess() { throw new Error('EME must not be called in a request-retirement test'); }},
  XMLHttpRequest:Xhr,
  fetch:async (input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    sent.push({kind:'fetch', url:target, init});
    return {status:200, url:target};
  },
  document:{documentElement:null, querySelectorAll:() => [{pause:() => {pauses++;}}]},
  localStorage:makeStorage([['ioridev.disneyplus4k.mode.v1','original']]),
  sessionStorage:makeStorage([['ioridev.disneyplus4k.once.v0.4.0',JSON.stringify({version:'0.4.0',mode:testMode,documentUrl:url,createdAt:Date.now()})]]),
  performance:{getEntriesByType:() => [{type:'reload'}]},
  location:{href:url, reload:() => {reloads++;}},
  MutationObserver:class {observe() {}},
  addEventListener:(name, callback, capture) => callbacks.set(name,{callback,capture}),
  setInterval() {}, setTimeout() {},
});
vm.runInContext(`
  globalThis['playback-service'] = {PlaybackService: class {
    static get version() { return '26.10.0-jasmine'; }
    createPlaybackSession() {
      if (${JSON.stringify(isUhdSdk)}) {
        new globalThis['playback-session'].PlaybackSession({playbackServiceVersion:'26.10.0-jasmine',mediaCapabilities:{videoResolutions:['SD','HD','FHD']}});
      }
      return Promise.resolve();
    }
  }};
`, context);
vm.runInContext(source, context);
if (isUhdSdk) {
  vm.runInContext(`
    document.currentScript = {src:'https://hiveplayer-static.bamgrid.com/artifacts/hive/playback-session/26.10.0-jasmine/all_browser_es6/playback-session.js'};
    globalThis['playback-session'] = {PlaybackSession:class {constructor(options) { this.options=options; }}};
    document.currentScript = null;
  `, context);
}
await vm.runInContext(`new globalThis['playback-service'].PlaybackService().createPlaybackSession({})`, context);
const api = 'https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular';
const body = JSON.stringify({playback:{attributes:{resolution:{max:['1280x720']}}}});
const input = new Request(api,{method:'POST',headers:{'content-type':'application/json'},body});
let finishBody;
input.clone = () => ({text:() => new Promise(resolve => {finishBody = resolve;})});
const pending = context.fetch(input); // Pauses while cloning request JSON.
const xhr = new context.XMLHttpRequest();
xhr.open('POST',api);
const expectedScenario = testMode.startsWith('1080p-') || testMode === '4k-hevc-sdk-playready'
  ? 'tv-drm-ctr-h265-atmos' : 'tv-drm-ctr-h265-hdr10-atmos';
assert.equal(xhr.openArgs[1], `https://disney.playback.edge.bamgrid.com/v7/playback/${expectedScenario}`, 'fixture opened exactly the selected experimental target');
assert.equal(callbacks.get('pagehide').capture,true);
callbacks.get('pagehide').callback({persisted:true});
assert.equal(pauses,1);
finishBody(body);
await assert.rejects(pending,error => error.name === 'AbortError');
await assert.rejects(context.fetch(api,{method:'POST',body}),error => error.name === 'AbortError');
assert.throws(() => xhr.send(body),error => error.name === 'AbortError');
assert.equal(sent.length,0,'not even a prepared request may leave a retired experiment');
await context.fetch('https://example.test/unrelated',{method:'POST',body:'unchanged'});
assert.equal(sent.length,1,'unrelated traffic still uses native fetch');
assert.equal(callbacks.get('pageshow').capture,true);
callbacks.get('pageshow').callback({persisted:true});
assert.equal(reloads,1,'history restore rebuilds from safe startup state');
console.log(`Request retirement (${testMode}): pending fetch, later fetch/XHR, capture handlers, history reload and unrelated traffic passed`);
