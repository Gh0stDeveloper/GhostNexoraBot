#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const [rust, bridge, app, script] = await Promise.all([
  readFile('apps/desktop/src-tauri/src/lib.rs', 'utf8'),
  readFile('apps/desktop/src/linuxRuntime.ts', 'utf8'),
  readFile('apps/desktop/src/App.tsx', 'utf8'),
  readFile('apps/desktop/src-tauri/resources/linux-local-runtime.sh', 'utf8'),
])

const syntax = spawnSync('bash', ['-n', 'apps/desktop/src-tauri/resources/linux-local-runtime.sh'], { encoding: 'utf8' })
assert.equal(syntax.status, 0, `linux local runtime script must pass bash -n: ${syntax.stderr}`)

assert.match(rust, /include_str!\("\.\.\/resources\/linux-local-runtime\.sh"\)/)
assert.match(rust, /matches!\(action, "probe" \| "install" \| "start" \| "stop" \| "restart" \| "update" \| "repair" \| "web-on" \| "web-off" \| "connection" \| "owner-set"\)/)
assert.match(rust, /Command::new\("bash"\)/)
assert.match(rust, /\.args\(\["-s", "--", action, source_ref\(\), extra\.unwrap_or\(""\)\]\)/)
assert.doesNotMatch(rust, /bash\s+-c|sh\s+-c|cmd\.exe|powershell/i, 'Linux local runtime bridge must not open a general shell')
assert.match(rust, /linux_runtime_set_owner/)
assert.match(rust, /digits\.len\(\) < 8 \|\| digits\.len\(\) > 20/)

assert.match(bridge, /linux_runtime_probe/)
assert.match(bridge, /linux_runtime_action/)
assert.match(bridge, /linux_runtime_connection/)
assert.match(bridge, /linux_runtime_set_owner/)
assert.match(bridge, /'install' \| 'start' \| 'stop' \| 'restart' \| 'update' \| 'repair' \| 'web-on' \| 'web-off'/)

assert.match(app, /platform === 'linux' && !remoteMode/)
assert.match(app, /linuxRuntime\.probe\(\)/)
assert.match(app, /linuxRuntime\.connection\(\)/)
assert.match(app, /linuxRuntime\.setOwner\(phone\)/)
assert.match(app, /switchRemote/)
assert.match(app, /switchLocal/)

assert.match(script, /XDG_DATA_HOME/)
assert.match(script, /\.local\/share/)
assert.match(script, /ghost-nexora/)
assert.match(script, /WEB_ENABLED false/)
assert.match(script, /PUBLIC_WEB_URL "http:\/\/127\.0\.0\.1:/)
assert.match(script, /OLLAMA_ENABLED false/)
assert.match(script, /latest-v24\.x/)
assert.match(script, /sha256sum -c/)
assert.match(script, /git clone --filter=blob:none --no-checkout/)
assert.match(script, /git -C "\$\{REPO_DIR\}" fetch --depth 1 origin "\$\{SOURCE_REF\}"/)
assert.match(script, /git -C "\$\{REPO_DIR\}" checkout --detach FETCH_HEAD/)
assert.match(script, /systemctl --user/)
assert.match(script, /WantedBy=default\.target/)
assert.match(script, /Environment="ENV_FILE=/)
assert.match(script, /NoNewPrivileges=true/)
assert.match(script, /ProtectSystem=strict/)
assert.match(script, /update_failed_rolled_back/)
assert.match(script, /pkexec/)
assert.match(script, /ADMIN_WEB_TOKEN/)
assert.match(script, /chmod 600 "\$\{ENV_FILE\}"/)
assert.doesNotMatch(script, /eval\s|bash\s+-c|sh\s+-c/i, 'Bundled Linux runtime script must not evaluate arbitrary shell input')

console.log('[V2 LINUX LOCAL AUDIT] OK — Linux desktop is local-first, per-user, web-off-by-default and constrained to fixed runtime actions.')
