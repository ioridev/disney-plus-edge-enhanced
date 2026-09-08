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
const readme = read('README.md');
assert.match(readme, /^!\[Disney\+ Edge Enhanced[^\]\r\n]*\]\(docs\/assets\/readme-banner\.png\)\r?\n\r?\n# Disney\+ Edge Enhanced/);
const banner = fs.readFileSync(new URL('docs/assets/readme-banner.png', root));
assert.deepEqual(banner.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'README banner must be a PNG');
assert.ok(banner.readUInt32BE(16) > banner.readUInt32BE(20), 'README banner must be landscape');
assert.ok(packageScript.includes("'docs/assets/readme-banner.png'"), 'packaged README must include its local banner');
assert.match(read('README.md'), /PlayReady DRM/);
assert.match(read('README.md'), /Widevine DRM/);
assert.match(read('README.md'), /75秒/);
assert.match(read('README.md'), /Intel内蔵GPU.*4K映像.*5分14秒/);
assert.match(read('docs/intel-4k.md'), /313\.738642/);
assert.ok(packageScript.includes("'docs/intel-4k.md'"));
assert.match(read('README.md'), /フルHDモードには再生時間制限がありません/);
assert.match(read('PRIVACY.md'), /activeTab/);
new vm.Script(source);
console.log('Distribution: manifest, branding, license, default mode, scope and required documentation verified.');
