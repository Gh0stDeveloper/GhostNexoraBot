/**
 * Transcripción de audio (nota de voz / audio adjunto).
 * Orden: OpenAI Whisper API (si hay key) → CLI whisper/faster-whisper → error claro.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { downloadContentFromMessage, type proto, type WAMessage } from 'baileys'
import { unwrapMessage, getContextInfo } from '../utils/message.js'
import { logger } from '../utils/logger.js'

const execFileAsync = promisify(execFile)

export type AudioSource = {
  buffer: Buffer
  mimetype?: string | null
  ptt?: boolean
}

function audioNodeFromContent(content: proto.IMessage | undefined): {
  node: proto.Message.IAudioMessage
  ptt?: boolean | null
} | null {
  if (!content?.audioMessage) return null
  return { node: content.audioMessage, ptt: content.audioMessage.ptt }
}

export function hasAudio(message: WAMessage): boolean {
  const own = unwrapMessage(message.message)
  if (own?.audioMessage) return true
  const quoted = getContextInfo(message)?.quotedMessage
  const q = unwrapMessage(quoted)
  return Boolean(q?.audioMessage)
}

export async function downloadAudioFromMessage(
  message: WAMessage,
  preferQuoted = false,
): Promise<AudioSource | null> {
  const own = audioNodeFromContent(unwrapMessage(message.message))
  const quoted = audioNodeFromContent(unwrapMessage(getContextInfo(message)?.quotedMessage))
  const target = preferQuoted ? quoted ?? own : own ?? quoted
  if (!target) return null

  const stream = await downloadContentFromMessage(target.node as never, 'audio')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return null
  return {
    buffer: Buffer.concat(chunks),
    mimetype: target.node.mimetype,
    ptt: Boolean(target.ptt),
  }
}

async function convertToWav(inputPath: string, outputPath: string) {
  await execFileAsync(
    'ffmpeg',
    ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath],
    { timeout: 60_000 },
  )
}

async function transcribeOpenAI(filePath: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null

  const form = new FormData()
  const blob = new Blob([fs.readFileSync(filePath)], { type: 'audio/wav' })
  form.append('file', blob, 'audio.wav')
  form.append('model', 'whisper-1')
  form.append('language', 'es')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key },
    body: form,
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error('OpenAI Whisper HTTP ' + res.status + ': ' + body.slice(0, 200))
  }
  const data = (await res.json()) as { text?: string }
  return (data.text || '').trim() || null
}

async function transcribeCli(wavPath: string): Promise<string | null> {
  // faster-whisper / openai-whisper CLI
  const candidates = [
    ['whisper', [wavPath, '--model', 'base', '--language', 'es', '--output_format', 'txt', '--output_dir', path.dirname(wavPath)]],
    ['whisper-ctranslate2', [wavPath, '--model', 'base', '--language', 'es', '--output_format', 'txt', '--output_dir', path.dirname(wavPath)]],
  ] as const

  for (const [bin, args] of candidates) {
    try {
      await execFileAsync(bin, args as unknown as string[], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 })
      const txtPath = wavPath.replace(/\.wav$/i, '.txt')
      if (fs.existsSync(txtPath)) {
        const text = fs.readFileSync(txtPath, 'utf8').trim()
        if (text) return text
      }
    } catch {
      // try next
    }
  }
  return null
}

export async function transcribeAudioBuffer(audio: AudioSource): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-stt-'))
  const ext = audio.mimetype?.includes('mp4') || audio.mimetype?.includes('m4a') ? '.m4a' : '.ogg'
  const inPath = path.join(tmp, 'in' + ext)
  const wavPath = path.join(tmp, 'audio.wav')

  try {
    fs.writeFileSync(inPath, audio.buffer)
    try {
      await convertToWav(inPath, wavPath)
    } catch (error) {
      logger.warn({ error }, 'ffmpeg convert failed; using original')
      fs.copyFileSync(inPath, wavPath)
    }

    const openai = await transcribeOpenAI(wavPath).catch((error) => {
      logger.warn({ error }, 'openai whisper failed')
      return null
    })
    if (openai) return openai

    const cli = await transcribeCli(wavPath)
    if (cli) return cli

    throw new Error(
      'No hay motor de transcripción. Opciones: 1) OPENAI_API_KEY en .env  2) instalar whisper CLI (pip install openai-whisper) y ffmpeg.',
    )
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export async function transcribeWhatsAppAudio(
  message: WAMessage,
  preferQuoted = false,
): Promise<string> {
  const audio = await downloadAudioFromMessage(message, preferQuoted)
  if (!audio) throw new Error('No encontré audio en el mensaje (ni citado).')
  return transcribeAudioBuffer(audio)
}
