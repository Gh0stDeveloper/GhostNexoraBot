import { invoke } from '@tauri-apps/api/core'

export type LinuxRuntimePaths = {
  root: string
  repo: string
  state: string
  session: string
  data: string
  downloads: string
  logs: string
}

export type LinuxRuntimeProbe = {
  ok: true
  supported: true
  installed: boolean
  running: boolean
  webEnabled: boolean
  webRunning: boolean
  serviceMode: 'systemd-user' | 'process'
  sourceRef: string
  currentSha: string
  nodeVersion: string
  npmVersion: string
  nodeOk: boolean
  npmOk: boolean
  missingDependencies: string[]
  paths: LinuxRuntimePaths
}

export type LinuxRuntimeConnection = {
  ok: true
  baseUrl: string
  token: string
}

export type LinuxRuntimeAction = 'install' | 'start' | 'stop' | 'restart' | 'update' | 'repair' | 'web-on' | 'web-off'

function parse<T>(raw: string): T {
  return JSON.parse(raw) as T
}

export const linuxRuntime = {
  platform: () => invoke<string>('desktop_platform'),
  probe: async () => parse<LinuxRuntimeProbe>(await invoke<string>('linux_runtime_probe')),
  action: async (action: LinuxRuntimeAction) => parse<LinuxRuntimeProbe>(await invoke<string>('linux_runtime_action', { action })),
  connection: async () => parse<LinuxRuntimeConnection>(await invoke<string>('linux_runtime_connection')),
  setOwner: async (phone: string) => parse<{ ok: true; ownerNumber: string }>(await invoke<string>('linux_runtime_set_owner', { phone })),
}
