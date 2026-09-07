import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extension/DisneyPlus-Edge-Enhanced.user.js', import.meta.url), 'utf8');
const realm = vm.createContext({ URL, __DP4K_TEST__: true }, {
  codeGeneration: { strings: false, wasm: false },
});
vm.runInContext(source, realm, { timeout: 1000 });
const api = realm.__DP4K_INTERNALS__;
assert.equal(typeof api.inspectSdkKeyConfiguration, 'function');
assert.equal(typeof api.inspectSdkSessionKeyConfiguration, 'function');

const keyFields = [
  'drmKeyRotationSupported',
  'drmKeyPrefetchSupported',
  'drmPlayReadyRecommendationFlow',
];
const values = (base, override) => ({
  configurationManager: {hiveDmp: {engine: {...base}}},
  options: {clientParameters: {configOverrides: {'hive-dmp': {engine: {...override}}}}},
});

// The helper returns only the fixed three fields, keeping base and caller
// override separate and never manufacturing an effective value.
const fixture = values(
  {drmKeyRotationSupported: true, drmKeyPrefetchSupported: false, secret: 'do-not-copy'},
  {drmKeyPrefetchSupported: true, drmPlayReadyRecommendationFlow: false, secret: 'do-not-copy'},
);
const beforeService = JSON.stringify(fixture.configurationManager);
const beforeOptions = JSON.stringify(fixture.options);
const report = api.inspectSdkKeyConfiguration(fixture, fixture.options);
assert.deepEqual(Object.keys(report).sort(), ['base', 'override']);
assert.deepEqual(Object.keys(report.base).sort(), [...keyFields].sort());
assert.deepEqual(Object.keys(report.override).sort(), [...keyFields].sort());
assert.equal(report.base.drmKeyRotationSupported, true);
assert.equal(report.base.drmKeyPrefetchSupported, false);
assert.equal(report.base.drmPlayReadyRecommendationFlow, 'absent');
assert.equal(report.override.drmKeyRotationSupported, 'absent');
assert.equal(report.override.drmKeyPrefetchSupported, true);
assert.equal(report.override.drmPlayReadyRecommendationFlow, false);
assert.equal('effective' in report, false);
assert.equal(JSON.stringify(report).includes('do-not-copy'), false);
assert.equal(JSON.stringify(fixture.configurationManager), beforeService);
assert.equal(JSON.stringify(fixture.options), beforeOptions);

// Missing fields are the fixed "absent" enum, not guessed false.
const missing = api.inspectSdkKeyConfiguration({}, {});
for (const section of [missing.base, missing.override]) {
  for (const key of keyFields) assert.equal(section[key], 'absent');
}

// Accessors are never invoked and are reported as unknown.
let serviceGetterCalls = 0;
const accessorEngine = {};
Object.defineProperty(accessorEngine, 'drmKeyPrefetchSupported', {
  enumerable: true,
  get() { serviceGetterCalls += 1; return true; },
});
const accessorService = {configurationManager: {hiveDmp: {engine: accessorEngine}}};
const accessorReport = api.inspectSdkKeyConfiguration(accessorService, {});
assert.equal(accessorReport.base.drmKeyPrefetchSupported, 'unknown');
assert.equal(serviceGetterCalls, 0);

let configurationManagerGetterCalls = 0;
const accessorServiceRoot = {};
Object.defineProperty(accessorServiceRoot, 'configurationManager', {
  get() { configurationManagerGetterCalls += 1; return accessorService; },
});
const accessorRootReport = api.inspectSdkKeyConfiguration(accessorServiceRoot, {});
assert.equal(accessorRootReport.base.drmKeyRotationSupported, 'unknown');
assert.equal(configurationManagerGetterCalls, 0);

// A non-boolean, including a secret-looking string, is unknown and is not
// copied into the diagnostic result.
const nonBooleanService = {configurationManager: {hiveDmp: {engine: {
  drmKeyRotationSupported: 'secret-value',
  drmKeyPrefetchSupported: 1,
  drmPlayReadyRecommendationFlow: null,
}}}};
const nonBooleanReport = api.inspectSdkKeyConfiguration(nonBooleanService, {});
for (const key of keyFields) assert.equal(nonBooleanReport.base[key], 'unknown');
assert.equal(JSON.stringify(nonBooleanReport).includes('secret-value'), false);

// An accessor in the override path is also unknown and never called.
let overrideGetterCalls = 0;
const overrideEngine = {};
Object.defineProperty(overrideEngine, 'drmKeyRotationSupported', {
  get() { overrideGetterCalls += 1; return false; },
});
const accessorOptions = {clientParameters: {configOverrides: {'hive-dmp': {engine: overrideEngine}}}};
const overrideReport = api.inspectSdkKeyConfiguration({}, accessorOptions);
assert.equal(overrideReport.override.drmKeyRotationSupported, 'unknown');
assert.equal(overrideGetterCalls, 0);

// The constructor-proxy view reads only configManager.hiveDmp.engine and does
// not use the ConfigurationManager.engineConfig getter.
let engineConfigGetterCalls = 0;
const sessionConfigManager = {hiveDmp: {engine: {
  drmKeyRotationSupported: false,
  drmKeyPrefetchSupported: true,
  drmPlayReadyRecommendationFlow: false,
}}};
Object.defineProperty(sessionConfigManager, 'engineConfig', {
  get() { engineConfigGetterCalls += 1; return {drmKeyPrefetchSupported: 'secret'}; },
});
const sessionReport = api.inspectSdkSessionKeyConfiguration({configManager: sessionConfigManager});
assert.deepEqual(JSON.parse(JSON.stringify(sessionReport)), {
  drmKeyRotationSupported: false,
  drmKeyPrefetchSupported: true,
  drmPlayReadyRecommendationFlow: false,
});
assert.equal(engineConfigGetterCalls, 0);

// This is a test-only realm; no service/session publication or native path is run.
assert.equal('playback-service' in realm, false);
assert.equal('playback-session' in realm, false);

console.log(JSON.stringify({
  passed: true,
  scope: 'descriptor-only SDK key configuration inspection; no playback, EME, licenses, or UI',
  fields: keyFields,
}));
