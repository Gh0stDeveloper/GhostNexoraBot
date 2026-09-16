import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { runtime } from './runtime'

export type ReleasePlatform = 'windows' | 'android' | 'linux'
export type ReleaseKind = 'nsis' | 'apk' | 'deb' | 'appimage' | 'rpm'

export type OfficialReleaseArtifact = {
  id: string
  platform: ReleasePlatform
  distro: string
  arch: string
  kind: ReleaseKind
  filename: string
  sizeBytes: number
  sha256: string
  signed: boolean
  signatureStatus: 'trusted' | 'self-signed' | 'gpg' | 'unsigned'
  signerFingerprint?: string | null
  relativePath: string
}

export type OfficialReleaseCatalog = {
  schemaVersion: 1
  product: 'Ghost Nexora Manager'
  version: string
  channel: 'stable' | 'beta' | 'rc'
  sourceSha: string
  sourceRef: string
  publishedAt: string
  signing: {
    android?: string | null
    windows?: string | null
    linux?: string | null
  }
  artifacts: OfficialReleaseArtifact[]
}

const EMPTY_CATALOG: OfficialReleaseCatalog = {
  schemaVersion: 1,
  product: 'Ghost Nexora Manager',
  version: '2.0.0',
  channel: 'rc',
  sourceSha: '',
  sourceRef: '',
  publishedAt: '',
  signing: {},
  artifacts: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeSegment(value: string) {
  return /^[A-Za-z0-9._+-]+$/.test(value) && value !== '.' && value !== '..'
}

function validateArtifact(value: unknown): OfficialReleaseArtifact | null {
  if (!isRecord(value)) return null
  const id = String(value.id ?? '')
  const platform = String(value.platform ?? '') as ReleasePlatform
  const distro = String(value.distro ?? '')
  const arch = String(value.arch ?? '')
  const kind = String(value.kind ?? '') as ReleaseKind
  const filename = String(value.filename ?? '')
  const relativePath = String(value.relativePath ?? '')
  const sha256 = String(value.sha256 ?? '').toLowerCase()
  const sizeBytes = Number(value.sizeBytes ?? 0)
  const signatureStatus = String(value.signatureStatus ?? 'unsigned') as OfficialReleaseArtifact['signatureStatus']
  if (!safeSegment(id) || !['windows', 'android', 'linux'].includes(platform)) return null
  if (!['nsis', 'apk', 'deb', 'appimage', 'rpm'].includes(kind)) return null
  if (!filename || path.basename(filename) !== filename) return null
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) return null
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return null
  if (!['trusted', 'self-signed', 'gpg', 'unsigned'].includes(signatureStatus)) return null
  return {
    id,
    platform,
    distro,
    arch,
    kind,
    filename,
    relativePath,
    sha256,
    sizeBytes,
    signed: value.signed === true,
    signatureStatus,
    signerFingerprint: value.signerFingerprint == null ? null : String(value.signerFingerprint),
  }
}

export function getOfficialReleaseCatalog(): OfficialReleaseCatalog {
  const manifest = path.join(runtime.releaseDir, 'current.json')
  if (!existsSync(manifest)) return EMPTY_CATALOG
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as unknown
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.artifacts)) return EMPTY_CATALOG
    const artifacts = parsed.artifacts.map(validateArtifact).filter((item): item is OfficialReleaseArtifact => Boolean(item))
      .filter((item) => existsSync(path.resolve(runtime.releaseDir, item.relativePath)))
    return {
      schemaVersion: 1,
      product: 'Ghost Nexora Manager',
      version: String(parsed.version ?? '2.0.0'),
      channel: ['stable', 'beta', 'rc'].includes(String(parsed.channel)) ? String(parsed.channel) as OfficialReleaseCatalog['channel'] : 'rc',
      sourceSha: String(parsed.sourceSha ?? ''),
      sourceRef: String(parsed.sourceRef ?? ''),
      publishedAt: String(parsed.publishedAt ?? ''),
      signing: isRecord(parsed.signing) ? {
        android: parsed.signing.android == null ? null : String(parsed.signing.android),
        windows: parsed.signing.windows == null ? null : String(parsed.signing.windows),
        linux: parsed.signing.linux == null ? null : String(parsed.signing.linux),
      } : {},
      artifacts,
    }
  } catch {
    return EMPTY_CATALOG
  }
}

export function publicReleaseCatalog() {
  const catalog = getOfficialReleaseCatalog()
  return {
    ...catalog,
    artifacts: catalog.artifacts.map(({ relativePath: _relativePath, ...artifact }) => ({
      ...artifact,
      downloadUrl: `/api/releases/download?id=${encodeURIComponent(artifact.id)}`,
    })),
  }
}

export function resolveReleaseArtifact(id: string) {
  if (!safeSegment(id)) return null
  const catalog = getOfficialReleaseCatalog()
  const artifact = catalog.artifacts.find((item) => item.id === id)
  if (!artifact) return null
  const root = path.resolve(runtime.releaseDir)
  const file = path.resolve(root, artifact.relativePath)
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null
  if (!existsSync(file)) return null
  const stat = statSync(file)
  if (!stat.isFile()) return null
  return { artifact, file, stat }
}

export function artifactContentType(kind: ReleaseKind) {
  switch (kind) {
    case 'apk': return 'application/vnd.android.package-archive'
    case 'deb': return 'application/vnd.debian.binary-package'
    case 'rpm': return 'application/x-rpm'
    case 'nsis': return 'application/vnd.microsoft.portable-executable'
    case 'appimage': return 'application/octet-stream'
  }
}

export function artifactStream(file: string, start?: number, end?: number) {
  const stream = createReadStream(file, start == null ? undefined : { start, end })
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>
}
