import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const scriptPath = 'extension/DisneyPlus-Edge-Enhanced.user.js';
const source = read(scriptPath);
const selector = read('src/hls-single-variant.mjs').replace(/^export function /gm, 'function ');
const transport = read('src/single-variant-network.mjs')
  .replace(/^export \{ MAX_MANIFEST_BYTES \};\n/gm, '')
  .replace(/^export function /gm, 'function ');
assert.doesNotMatch(selector + transport, /^export\s/m);
const block = `  // SINGLE_VARIANT_MODULES_START
  // Generated from src/hls-single-variant.mjs and src/single-variant-network.mjs.
  const { selectSingleFhdVariant, selectSingleUhdVariant, selectSingleHdrUhdVariant, summarizeUhdVariantRanges, createSingleVariantNetworkAdapter } = (() => {
${selector}
${transport}
    return { selectSingleFhdVariant, selectSingleUhdVariant, selectSingleHdrUhdVariant, summarizeUhdVariantRanges, createSingleVariantNetworkAdapter };
  })();
  // SINGLE_VARIANT_MODULES_END`;
assert.equal((source.match(/  \/\/ SINGLE_VARIANT_MODULES_START/g) || []).length, 1);
assert.equal((source.match(/  \/\/ SINGLE_VARIANT_MODULES_END/g) || []).length, 1);
const built = source.replace(/  \/\/ SINGLE_VARIANT_MODULES_START[\s\S]*?  \/\/ SINGLE_VARIANT_MODULES_END/, () => block);
const { version } = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('extension/manifest.json'));
assert.equal(manifest.version, version);
assert.equal(/const VERSION = "([\d.]+)";/.exec(built)?.[1], version);
assert.equal(/\/\/ @version\s+([\d.]+)/.exec(built)?.[1], version);
new vm.Script(built, { filename: scriptPath });
if (process.argv.includes('--check')) {
  assert.equal(built, source, 'Embedded modules are stale. Run npm run build.');
  console.log(`Build verified: v${version}`);
} else {
  fs.writeFileSync(new URL(scriptPath, root), built);
  console.log(`Built ${scriptPath}: v${version}`);
}
