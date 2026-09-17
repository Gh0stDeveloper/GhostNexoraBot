import { applyPendingRestoreBeforeRuntime } from './services/restore-bootstrap.js'

await applyPendingRestoreBeforeRuntime()
await import('./index.js')
