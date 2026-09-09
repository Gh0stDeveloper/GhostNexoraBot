import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghost-nexora-update-preflight-'))
const repo = path.join(temp, 'repo')
const state = path.join(temp, 'state')
mkdirSync(path.join(repo, 'scripts'), { recursive: true })
mkdirSync(path.join(repo, 'data'), { recursive: true })
mkdirSync(state, { recursive: true })

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
}

git(['init', '-q'])
git(['config', 'user.email', 'ci@ghostnexora.invalid'])
git(['config', 'user.name', 'Ghost Nexora CI'])
writeFileSync(path.join(repo, '.gitignore'), '.env\ndata/\n')
writeFileSync(path.join(repo, 'tracked.txt'), 'original\n')
copyFileSync(path.join(root, 'scripts', 'safe-git-preflight.mjs'), path.join(repo, 'scripts', 'safe-git-preflight.mjs'))
git(['add', '.gitignore', 'tracked.txt', 'scripts/safe-git-preflight.mjs'])
git(['commit', '-qm', 'fixture'])

// Simulate exactly the production failure: a tracked file is changed while
// ignored runtime state also exists alongside the checkout.
writeFileSync(path.join(repo, 'tracked.txt'), 'locally modified\n')
writeFileSync(path.join(repo, '.env'), 'SECRET=preserve-me\n')
writeFileSync(path.join(repo, 'data', 'keep.sqlite'), 'persistent-runtime-data\n')

execFileSync(process.execPath, [path.join(repo, 'scripts', 'safe-git-preflight.mjs')], {
  cwd: repo,
  env: { ...process.env, STATE_DIR: state },
  stdio: 'pipe',
})

assert.equal(readFileSync(path.join(repo, 'tracked.txt'), 'utf8'), 'original\n')
assert.equal(readFileSync(path.join(repo, '.env'), 'utf8'), 'SECRET=preserve-me\n')
assert.equal(readFileSync(path.join(repo, 'data', 'keep.sqlite'), 'utf8'), 'persistent-runtime-data\n')
assert.equal(git(['status', '--porcelain=v1', '--untracked-files=no']).trim(), '')

const backups = path.join(state, 'backups')
assert.ok(existsSync(backups), 'backup directory was not created')
const files = readdirSync(backups)
const patchName = files.find((name) => name.endsWith('.patch'))
const manifestName = files.find((name) => name.endsWith('.txt'))
assert.ok(patchName, 'tracked patch backup missing')
assert.ok(manifestName, 'tracked manifest backup missing')
assert.match(readFileSync(path.join(backups, patchName), 'utf8'), /locally modified/)
assert.match(readFileSync(path.join(backups, manifestName), 'utf8'), /tracked\.txt/)

// Regression guards: managed production scripts are executable in Git, so the
// updater no longer dirties the checkout merely by ensuring they can run.
for (const relative of [
  'scripts/update.sh',
  'scripts/update-request-runner.sh',
  'scripts/install-browser-proxy.sh',
  'scripts/install-llm-worker-service.sh',
]) {
  assert.notEqual(statSync(path.join(root, relative)).mode & 0o111, 0, `${relative} must be executable`)
}

const cli = readFileSync(path.join(root, 'scripts', 'install-cli.mjs'), 'utf8')
assert.doesNotMatch(cli, /chmodSync\(runner/)
const requestRunner = readFileSync(path.join(root, 'scripts', 'update-request-runner.sh'), 'utf8')
assert.doesNotMatch(requestRunner, /chmod \+x .*update\.sh/)
assert.match(requestRunner, /safe-git-preflight\.mjs/)
const dispatcher = readFileSync(path.join(root, 'scripts', 'ghostnexorabot.mjs'), 'utf8')
assert.match(dispatcher, /safe-git-preflight\.mjs/)

console.log(JSON.stringify({
  ok: true,
  trackedRestored: true,
  envPreserved: true,
  dataPreserved: true,
  backupCreated: true,
  managedScriptsExecutable: true,
}))
