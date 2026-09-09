#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const publicUrl = read('apps/web/lib/public-url.ts')
assert.match(publicUrl, /x-forwarded-host/i, 'public URL resolver must honor reverse-proxy host')
assert.match(publicUrl, /x-forwarded-proto/i, 'public URL resolver must honor reverse-proxy protocol')
assert.match(publicUrl, /runtime\.publicWebUrl/, 'configured public URL must remain the primary trusted origin')

for (const path of [
  'apps/web/app/api/auth/login/route.ts',
  'apps/web/app/api/auth/logout/route.ts',
  'apps/web/app/subbot/[code]/route.ts',
  'apps/web/app/api/control/route.ts',
]) {
  const source = read(path)
  assert.match(source, /publicUrl\(/, `${path} must use the proxy-aware redirect builder`)
  assert.doesNotMatch(source, /new URL\([^\n]+request\.url/, `${path} must not build redirects from internal request.url`)
}

const control = read('apps/web/app/api/control/route.ts')
assert.match(control, /export async function GET\(/, '/api/control must expose a safe browser diagnostic GET')
assert.match(control, /botControlReachable/, '/api/control diagnostic must report bot reachability')
assert.match(control, /health\?\.connected\) \|\| persisted\.connected/, '/api/control must combine live health with the persisted runtime heartbeat')
assert.match(control, /control_internal_error/, 'control POST failures must degrade to a controlled response')

const auth = read('apps/web/lib/auth.ts')
assert.match(auth, /JOIN subbots s ON s\.id = p\.subbot_id/, 'portal token must stay bound to subbot id')
assert.doesNotMatch(auth, /s\.owner_jid\s*=\s*p\.user_jid/, 'PN/LID identity migration must not invalidate an existing portal token')

const unit = read('systemd/ghost-nexora-web.service')
assert.match(unit, /ReadOnlyPaths=__STATE_DIR__/, 'web sandbox must keep persistent state read-only by default')
assert.match(unit, /ReadWritePaths=__STATE_DIR__\/data/, 'Operations Center needs write access only to the data subtree')

const nginx = read('scripts/install-browser-proxy.sh')
assert.match(nginx, /configuration file \(\.\+\):\$/, 'nginx -T parser must match the real "configuration file /path:" format')
assert.doesNotMatch(nginx, /\(\[\^ \]\+\) :\$/, 'obsolete nginx parser with a space before colon must not return')
assert.match(nginx, /No se creará un vhost duplicado/, 'installer must refuse duplicate server_name fallback')
assert.match(nginx, /PUBLIC_WEB_URL reparado/, 'installer must repair legacy localhost PUBLIC_WEB_URL')

const main = read('apps/bot/src/index.ts')
assert.match(main, /let socketGeneration = 0/, 'MainBot must track socket generations')
assert.match(main, /generation !== socketGeneration/, 'stale MainBot socket events must be ignored')
assert.match(main, /effectiveMainConnected\(\) \? mainSocket : null/, 'web control must only receive a registered/live MainBot socket')
assert.match(main, /mainSocket && mainSocket\.authState\.creds\.registered/, 'MainBot live state must verify registered socket credentials')

console.log('web/proxy regression smoke: OK')
