/**
 * Transcripción de audio 100% local (sin APIs).
 * Requiere: ffmpeg + openai-whisper (CLI) o faster-whisper.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
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

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [cmd])
    const p = stdout.trim().split('\n')[0]
    return p || null
  } catch {
    return null
  }
}

async function convertToWav(inputPath: string, outputPath: string) {
  const ffmpeg = (await which('ffmpeg')) || 'ffmpeg'
  await execFileAsync(
    ffmpeg,
    ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath],
    { timeout: 90_000 },
  )
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 44) {
    throw new Error('ffmpeg no generó WAV válido')
  }
}

function runCapture(cmd: string, args: string[], timeoutMs = 240_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Timeout transcripción (' + timeoutMs + 'ms)'))
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function findWhisperTxt(dir: string, baseName: string): Promise<string | null> {
  const candidates = [
    path.join(dir, baseName + '.txt'),
    path.join(dir, baseName + '.wav.txt'),
    path.join(dir, 'audio.txt'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const t = fs.readFileSync(c, 'utf8').trim()
      if (t) return t
    }
  }
  // cualquier .txt generado
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'))
    for (const f of files) {
      const t = fs.readFileSync(path.join(dir, f), 'utf8').trim()
      if (t) return t
    }
  } catch {
    /* ignore */
  }
  return null
}

async function transcribeLocal(wavPath: string, workDir: string): Promise<string | null> {
  const base = path.basename(wavPath, path.extname(wavPath))

  // 1) python3 -m whisper (instalación típica con pip)
  const pythons = ['python3', 'python']
  for (const py of pythons) {
    if (!(await which(py))) continue
    try {
      const result = await runCapture(py, [
        '-m',
        'whisper',
        wavPath,
        '--model',
        process.env.WHISPER_MODEL || 'base',
        '--language',
        process.env.WHISPER_LANGUAGE || 'es',
        '--output_format',
        'txt',
        '--output_dir',
        workDir,
        '--fp16',
        'False',
      ])
      logger.info({ code: result.code, stderr: result.stderr.slice(-400) }, 'whisper python -m')
      const text = await findWhisperTxt(workDir, base)
      if (text) return text
    } catch (error) {
      logger.warn({ error }, 'python -m whisper failed')
    }
  }

  // 2) binario whisper en PATH
  const whisperBin = await which('whisper')
  if (whisperBin) {
    try {
      const result = await runCapture(whisperBin, [
        wavPath,
        '--model',
        process.env.WHISPER_MODEL || 'base',
        '--language',
        process.env.WHISPER_LANGUAGE || 'es',
        '--output_format',
        'txt',
        '--output_dir',
        workDir,
        '--fp16',
        'False',
      ])
      logger.info({ code: result.code, stderr: result.stderr.slice(-400) }, 'whisper bin')
      const text = await findWhisperTxt(workDir, base)
      if (text) return text
    } catch (error) {
      logger.warn({ error }, 'whisper bin failed')
    }
  }

  // 3) faster-whisper CLI si existe
  const fw = await which('whisper-ctranslate2')
  if (fw) {
    try {
      const result = await runCapture(fw, [
        wavPath,
        '--model',
        process.env.WHISPER_MODEL || 'base',
        '--language',
        process.env.WHISPER_LANGUAGE || 'es',
        '--output_format',
        'txt',
        '--output_dir',
        workDir,
      ])
      logger.info({ code: result.code }, 'faster-whisper')
      const text = await findWhisperTxt(workDir, base)
      if (text) return text
    } catch (error) {
      logger.warn({ error }, 'faster-whisper failed')
    }
  }

  return null
}

export async function transcribeAudioBuffer(audio: AudioSource): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-stt-'))
  const mime = (audio.mimetype || '').toLowerCase()
  const ext =
    mime.includes('mpeg') || mime.includes('mp3')
      ? '.mp3'
      : mime.includes('mp4') || mime.includes('m4a')
        ? '.m4a'
        : mime.includes('wav')
          ? '.wav'
          : '.ogg'
  const inPath = path.join(tmp, 'in' + ext)
  const wavPath = path.join(tmp, 'audio.wav')

  try {
    fs.writeFileSync(inPath, audio.buffer)
    logger.info({ bytes: audio.buffer.length, mime: audio.mimetype, ext }, 'audio downloaded for STT')

    try {
      await convertToWav(inPath, wavPath)
    } catch (error) {
      logger.warn({ error }, 'ffmpeg convert failed')
      throw new Error(
        'Falta ffmpeg o falló la conversión. Instala: sudo apt install -y ffmpeg',
      )
    }

    const text = await transcribeLocal(wavPath, tmp)
    if (text && text.trim()) return text.trim()

    throw new Error(
      [
        'Transcripción local falló.',
        'Comprueba en el servidor:',
        '  which ffmpeg && ffmpeg -version',
        '  python3 -m whisper --help',
        '  pip install -U openai-whisper',
        'Modelo por defecto: base (WHISPER_MODEL=tiny|base|small).',
      ].join('\n'),
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
