import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const testNames = fs.readdirSync(new URL('../tests/', import.meta.url))
  .filter((name) => /^test-.*\.mjs$/.test(name)).sort();
const runs = testNames.map((name) => [name]);
for (const mode of ['4k-hevc-hw', '4k-hdr10-hw-persistent', '1080p-hevc-hw-persistent', '1080p-hevc-hw-persistent-cap']) {
  runs.push(['test-eme-runtime.mjs', mode]);
}
for (const mode of ['4k-hdr10-sdk-playready', '4k-hevc-sdk-playready']) {
  runs.push(['test-sdk-playready-flow.mjs', mode]);
  runs.push(['test-request-retirement.mjs', mode]);
}
runs.push(['test-sdk-resolution-policy.mjs', '4k-hevc-sdk-playready']);

for (const [name, ...args] of runs) {
  console.log(`\n> ${name}${args.length ? ` (${args.join(', ')})` : ''}`);
  const child = spawnSync(process.execPath, ['--import', './tests/offline-guard.mjs', `tests/${name}`, ...args], {
    cwd: root,
    stdio: 'inherit',
    timeout: 30_000,
    windowsHide: true,
  });
  if (child.error) console.error(child.error.message);
  if (child.status !== 0 || child.error) process.exit(child.status || 1);
}
console.log(`\nPassed ${runs.length} offline runs across ${testNames.length} test files. No real browser/CDM playback tested.`);
