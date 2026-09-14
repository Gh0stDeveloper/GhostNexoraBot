#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const mode = args.get('mode') || 'ci';
const expectedVersion = '2.0.0';
const errors = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function json(rel) {
  return JSON.parse(read(rel));
}
function check(condition, label) {
  checks.push({ label, ok: Boolean(condition) });
  if (!condition) errors.push(label);
}

const rootPackage = json('package.json');
const android = read('apps/android/app/build.gradle.kts');
const tauri = json('apps/desktop/src-tauri/tauri.conf.json');
const cargo = read('apps/desktop/src-tauri/Cargo.toml');
const updater = read('scripts/release-update.sh');
const rollback = read('scripts/release-rollback.sh');
const state = read('scripts/release-state.sh');
const releaseWorkflow = read('.github/workflows/v2-release.yml');
const phase8Workflow = read('.github/workflows/v2-phase8.yml');
const phase8Doc = read('docs/v2/PHASE_8.md');

check(rootPackage.version === expectedVersion, `root package version is ${expectedVersion}`);
check(/versionName\s*=\s*"2\.0\.0"/.test(android), 'Android versionName is 2.0.0');
check(/versionCode\s*=\s*2000000/.test(android), 'Android versionCode is 2000000');
check(tauri.version === expectedVersion, 'Tauri version is 2.0.0');
check(/version\s*=\s*"2\.0\.0"/.test(cargo), 'Rust package version is 2.0.0');
check(android.includes('GHOST_NEXORA_ANDROID_KEYSTORE'), 'Android release signing is secret-driven');
check(android.includes('signingConfig = signingConfigs.getByName("release")'), 'Android release build uses release signing config when configured');
check(updater.includes('release_state_create_snapshot'), 'release updater snapshots persistent state');
check(updater.includes('trap rollback ERR'), 'release updater has automatic rollback trap');
check(updater.includes('npm run v2:release-gate -- --mode=install'), 'release updater validates the target before activation');
check(rollback.includes('release_state_restore_persistent'), 'rollback restores persistent state');
check(state.includes('chmod 0700'), 'release snapshots are private by default');
check(releaseWorkflow.includes('attest-build-provenance'), 'release workflow generates build provenance');
check(releaseWorkflow.includes('sbom'), 'release workflow publishes SBOM evidence');
check(releaseWorkflow.includes('WINDOWS_CERTIFICATE_BASE64'), 'Windows Authenticode signing requires a certificate secret');
check(releaseWorkflow.includes('GPG_PRIVATE_KEY'), 'Linux checksum signing requires a GPG key');
check(releaseWorkflow.includes('GHOST_NEXORA_ANDROID_KEYSTORE_BASE64'), 'Android signing requires a keystore secret');
check(phase8Workflow.includes('v2:release-gate'), 'Phase 8 CI executes the production release gate');
check(phase8Doc.includes('72'), 'Phase 8 documentation records the 72h soak requirement');

if (mode === 'release') {
  const startRaw = process.env.GHOST_NEXORA_SOAK_STARTED_AT || args.get('soak-started-at');
  check(Boolean(startRaw), '72h soak start timestamp supplied');
  if (startRaw) {
    const start = Date.parse(startRaw);
    check(Number.isFinite(start), 'soak timestamp is valid ISO-8601');
    if (Number.isFinite(start)) {
      const elapsedHours = (Date.now() - start) / 3_600_000;
      check(elapsedHours >= 72, `72h soak elapsed (current: ${elapsedHours.toFixed(2)}h)`);
      check(elapsedHours <= 24 * 30, 'soak evidence is not older than 30 days');
    }
  }

  const required = [
    'GHOST_NEXORA_ANDROID_KEYSTORE_BASE64',
    'GHOST_NEXORA_ANDROID_KEY_ALIAS',
    'GHOST_NEXORA_ANDROID_KEYSTORE_PASSWORD',
    'GHOST_NEXORA_ANDROID_KEY_PASSWORD',
    'WINDOWS_CERTIFICATE_BASE64',
    'WINDOWS_CERTIFICATE_PASSWORD',
    'GPG_PRIVATE_KEY',
  ];
  for (const name of required) check(Boolean(process.env[name]), `release secret present: ${name}`);
}

const report = {
  phase: 8,
  version: expectedVersion,
  mode,
  generatedAt: new Date().toISOString(),
  passed: errors.length === 0,
  checks,
};
fs.writeFileSync(path.join(root, 'v2-phase8-release-gate.json'), `${JSON.stringify(report, null, 2)}\n`);

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.label}`);
if (errors.length) {
  console.error(`\nPhase 8 release gate failed with ${errors.length} unmet requirement(s).`);
  process.exit(1);
}
console.log('\nPhase 8 release gate passed.');
