import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyPageCommand, badgeState, installToolbar, isDisneyPage } from '../extension/toolbar.mjs';

for (const url of ['https://www.disneyplus.com/', 'https://www.disneyplus.com/ja-jp/play/test']) assert.ok(isDisneyPage(url));
for (const url of ['http://www.disneyplus.com/', 'https://disneyplus.com/', 'https://www.disneyplus.com.evil.test/', 'https://www.disneyplus.com@evil.test/', 'https://user@www.disneyplus.com/', 'https://www.disneyplus.com:8443/', 'edge://extensions/', null]) assert.equal(isDisneyPage(url), false);
assert.equal(badgeState({mode: 'fullhd'}).text, 'HD');
assert.equal(badgeState({mode: 'fullhd', failed: true}).text, '!');
assert.equal(badgeState({mode: 'original'}).text, 'OFF');
assert.equal(badgeState({mode: '4k-hdr10'}).text, 'DBG');
assert.equal(badgeState({mode: '4k-hdr10-sdk-playready'}).text, '4K');
assert.match(badgeState({reason: 'intel-gpu-required', failed: true}).title, /4Kは開始していません/);

const storage = () => {
  const data = new Map();
  return {getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key)};
};
const makePage = (url = 'https://www.disneyplus.com/ja-jp/play/test') => vm.createContext({URL, location: {href: url}, localStorage: storage(), sessionStorage: storage()});
const runCommand = (context, command) => vm.runInContext(`(${applyPageCommand.toString()})(${JSON.stringify(command)})`, context);
{
  const context = makePage();
  assert.deepEqual(JSON.parse(JSON.stringify(runCommand(context, 'toggle-fullhd'))), {ok: true, reload: true, mode: 'fullhd'});
  assert.equal(context.localStorage.getItem('ioridev.disneyplus4k.mode.v1'), 'fullhd');
  assert.equal(runCommand(context, 'toggle-fullhd').mode, 'original');
  assert.equal(runCommand(context, 'toggle-debug').reload, true, 'already-open page requires one initial reload to install helper');
  assert.equal(context.sessionStorage.getItem('ioridev.disneyplus.debug-ui.v1'), '1');
  assert.equal(runCommand(context, 'arbitrary-code').ok, false);
  assert.equal(runCommand(context, 'start-intel-4k').reason, 'reload-required');
  assert.equal(context.sessionStorage.getItem('ioridev.disneyplus4k.once.v0.5.0'), null, 'missing/older helpers cannot arm an unchecked 4K ticket');
  context.localStorage.setItem = () => {};
  assert.equal(runCommand(context, 'toggle-fullhd').ok, false, 'silent storage failure does not report ON');
  const foreign = makePage('https://example.test/');
  assert.equal(runCommand(foreign, 'toggle-fullhd').ok, false);
  assert.equal(foreign.localStorage.getItem('ioridev.disneyplus4k.mode.v1'), null);
}
{
  const page = makePage();
  let toggles = 0;
  page.__DisneyPlusEdgeEnhancedToolbar = {
    prepareToggle: () => ({ok: true, mode: 'fullhd', reload: true}),
    toggleDebug: () => { toggles++; return {mode: 'fullhd', debugVisible: true}; },
    prepareIntel4k: () => ({ok: true, mode: '4k-hdr10-sdk-playready', reload: true}),
  };
  const result = runCommand(page, 'toggle-debug');
  assert.equal(result.ok, true);
  assert.equal(result.reload, false, 'debug does not restart playback');
  assert.equal(toggles, 1);
  assert.equal(runCommand(page, 'start-intel-4k').mode, '4k-hdr10-sdk-playready');
  page.__DisneyPlusEdgeEnhancedToolbar.prepareIntel4k = () => ({ok: false, reason: 'intel-gpu-required'});
  assert.equal(runCommand(page, 'start-intel-4k').ok, false);
}

function event() { let handler; return {addListener: (value) => {handler = value;}, fire: (...args) => handler(...args)}; }
function apiFixture() {
  const calls = {injections: [], reloads: [], badges: [], menus: []};
  const current = {id: 7, url: 'https://www.disneyplus.com/ja-jp/play/test'};
  const api = {
    action: {
      onClicked: event(),
      setBadgeText: async (args) => { calls.badges.push(args); },
      setBadgeBackgroundColor: async () => {}, setTitle: async () => {},
    },
    contextMenus: {onClicked: event(), removeAll: async () => {}, create: (args) => calls.menus.push(args)},
    runtime: {id: 'fixture-id', onInstalled: event(), onMessage: event()},
    tabs: {reload: async (id) => calls.reloads.push(id), get: async () => current},
    scripting: {executeScript: async (args) => {calls.injections.push(args); return [{frameId: 0, result: {ok: true, mode: 'fullhd', reload: true}}];}},
  };
  return {api, calls, current};
}
{
  const {api, calls, current} = apiFixture();
  const controller = installToolbar(api);
  await controller.handleCommand({...current}, 'toggle-fullhd');
  assert.deepEqual(calls.reloads, [7]);
  assert.equal(calls.injections[0].world, 'MAIN');
  assert.deepEqual(calls.injections[0].target, {tabId: 7, frameIds: [0]});
  assert.equal(calls.badges.at(-1).text, 'HD');
  await controller.handleCommand({id: 9, url: 'https://example.test/'}, 'toggle-fullhd');
  assert.equal(calls.injections.length, 1, 'non-Disney tabs are never injected');
  api.runtime.onInstalled.fire(); await Promise.resolve();
  assert.deepEqual(calls.menus[0].contexts, ['action']);
  assert.deepEqual(calls.menus[1].contexts, ['action']);
  assert.equal(calls.menus[1].id, 'disney-plus-enhanced-intel-4k');
  const sender = {id: api.runtime.id, frameId: 0, url: current.url, tab: {id: 7}};
  api.runtime.onMessage.fire({type: 'disney-plus-enhanced-status', state: {mode: 'fullhd', failed: true}}, sender);
  await Promise.resolve(); assert.equal(calls.badges.at(-1).text, '!');
  const count = calls.badges.length;
  for (const badSender of [{...sender, id: 'other'}, {...sender, frameId: 1}, {...sender, url: 'https://evil.test/'}]) {
    api.runtime.onMessage.fire({type: 'disney-plus-enhanced-status', state: {mode: 'original', failed: false}}, badSender);
  }
  api.runtime.onMessage.fire({type: 'toggle-fullhd'}, sender);
  assert.equal(calls.badges.length, count);
  assert.equal(calls.reloads.length, 1, 'page messages cannot reload or toggle');
}
{
  const {api, calls, current} = apiFixture();
  installToolbar(api);
  api.scripting.executeScript = async (args) => {
    calls.injections.push(args);
    return [{frameId: 0, result: {ok: true, mode: 'fullhd', reload: args.args[0] === 'toggle-fullhd'}}];
  };
  api.action.onClicked.fire({...current});
  await new Promise(setImmediate);
  assert.deepEqual(calls.injections[0].args, ['toggle-fullhd']);
  assert.deepEqual(calls.reloads, [7]);
  api.contextMenus.onClicked.fire({menuItemId: 'other'}, {...current});
  assert.equal(calls.injections.length, 1);
  api.contextMenus.onClicked.fire({menuItemId: 'disney-plus-enhanced-debug'}, {...current});
  await new Promise(setImmediate);
  assert.deepEqual(calls.injections[1].args, ['toggle-debug']);
  assert.deepEqual(calls.reloads, [7], 'debug menu does not restart active playback');
  api.scripting.executeScript = async (args) => {
    calls.injections.push(args);
    return [{frameId: 0, result: {ok: false, reason: 'intel-gpu-required'}}];
  };
  api.contextMenus.onClicked.fire({menuItemId: 'disney-plus-enhanced-intel-4k'}, {...current});
  await new Promise(setImmediate);
  assert.deepEqual(calls.injections[2].args, ['start-intel-4k']);
  assert.deepEqual(calls.reloads, [7], 'a non-Intel result cannot trigger playback/reload');
  assert.equal(calls.badges.at(-1).text, '!');
}
{
  const {api, calls, current} = apiFixture();
  let finish;
  api.scripting.executeScript = () => new Promise((resolve) => {finish = resolve;});
  const controller = installToolbar(api);
  const first = controller.handleCommand({...current}, 'toggle-fullhd');
  await controller.handleCommand({...current}, 'toggle-fullhd');
  current.url = 'https://example.test/';
  finish([{frameId: 0, result: {ok: true, reload: true, mode: 'fullhd'}}]);
  await first;
  assert.equal(calls.reloads.length, 0, 'navigation races never reload an unrelated page');
}

// MAIN-origin bridge data is untrusted and display-only, with a bounded schema.
{
  const sent = [];
  const listeners = new Map();
  const context = vm.createContext({
    addEventListener: (name, fn) => listeners.set(name, fn), dispatchEvent: () => {}, Event,
    chrome: {runtime: {sendMessage: async (data) => {sent.push(data);}}},
  });
  vm.runInContext(fs.readFileSync(new URL('../extension/bridge.js', import.meta.url), 'utf8'), context);
  const emit = listeners.get('disney-plus-enhanced:status');
  emit({detail: JSON.stringify({mode: 'fullhd', failed: false, url: 'private', license: 'private'})});
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {type: 'disney-plus-enhanced-status', state: {mode: 'fullhd', failed: false}});
  for (const detail of ['x'.repeat(257), '{}', 'null', '{', JSON.stringify({mode: 'fullhd', failed: 'no'})]) emit({detail});
  assert.equal(sent.length, 1);
}
console.log('Toolbar: toggle/fallback, debug without reload, URL/frame bounds, badge states, double-click/navigation races and display-only bridge passed.');
