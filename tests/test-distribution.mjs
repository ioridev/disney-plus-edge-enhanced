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
assert.deepEqual(fs.readdirSync(new URL('extension/', root)).sort(), ['DisneyPlus-Edge-Enhanced.user.js', 'manifest.json']);
assert.equal(manifest.background, undefined);
assert.equal(manifest.permissions, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0], {
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
new vm.Script(source);
console.log('Distribution: manifest, branding, license, default mode, scope and required documentation verified.');
