import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('extension/manifest.json'));
const pkg = JSON.parse(read('package.json'));
const source = read('extension/DisneyPlus-Edge-Enhanced.user.js');

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Disney+ Edge Enhanced');
assert.equal(manifest.version, pkg.version);
assert.equal(pkg.license, 'MIT');
assert.deepEqual(fs.readdirSync(new URL('extension/', root)).sort(), ['DisneyPlus-Edge-Enhanced.user.js', 'background.mjs', 'bridge.js', 'manifest.json', 'toolbar.mjs']);
assert.deepEqual(manifest.background, {service_worker: 'background.mjs', type: 'module'});
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'contextMenus']);
assert.equal(manifest.action.default_popup, undefined, 'click toggles directly without a popup');
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.externally_connectable, undefined);
const packageScript = read('scripts/package.ps1');
for (const name of fs.readdirSync(new URL('extension/', root))) {
  assert.ok(packageScript.includes(`'extension/${name}'`), `${name} must be included in the release archive`);
}
assert.equal(manifest.content_scripts.length, 2);
assert.deepEqual(manifest.content_scripts[0], {
  matches: ['https://www.disneyplus.com/*'],
  js: ['bridge.js'], run_at: 'document_start', world: 'ISOLATED', all_frames: false,
});
assert.deepEqual(manifest.content_scripts[1], {
  matches: ['https://www.disneyplus.com/*'],
  js: ['DisneyPlus-Edge-Enhanced.user.js'],
  run_at: 'document_start',
  world: 'MAIN',
  all_frames: false,
});
assert.match(source, /\/\/ @license\s+MIT/);
assert.match(source, /\/\/ @name\s+Disney\+ Edge Enhanced\n/);
assert.match(source, /const DEFAULT_MODE = "original";/);
assert.doesNotMatch(source, /ioridev\.local/);
assert.match(read('LICENSE'), /Copyright \(c\) 2026 ioridev/);
assert.match(read('README.md'), /PlayReady DRM/);
assert.match(read('README.md'), /Widevine DRM/);
assert.match(read('README.md'), /75秒/);
assert.match(read('README.md'), /4K.*未達/);
assert.match(read('README.md'), /フルHDモードには再生時間制限がありません/);
assert.match(read('PRIVACY.md'), /activeTab/);
new vm.Script(source);
console.log('Distribution: manifest, branding, license, default mode, scope and required documentation verified.');
