// SPDX-License-Identifier: MIT
// Host half: synthesize assistant text with the locally installed edge-tts.
// The browser only receives a cache id and an audio URL; text stays in the
// local cache directory.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const ROUTE = '/dsh-read-aloud-edge'
const MAX_TEXT = 8000
const TIMEOUT_MS = 90_000

const rootDir = () => path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'read-aloud-edge')
const cacheDir = () => path.join(rootDir(), 'cache')

const EDGE_CANDIDATES = [
  process.env.EDGE_TTS_PATH,
  '/Library/Frameworks/Python.framework/Versions/3.11/bin/edge-tts',
  '/opt/homebrew/bin/edge-tts',
  '/usr/local/bin/edge-tts',
  '/usr/bin/edge-tts',
].filter((value) => typeof value === 'string' && value !== '')

let edgePathCache

async function findEdgeTts() {
  if (edgePathCache !== undefined) return edgePathCache
  for (const candidate of EDGE_CANDIDATES) {
    try {
      await access(candidate)
      edgePathCache = candidate
      return candidate
    } catch { /* try next */ }
  }
  edgePathCache = null
  return null
}

function voiceFor(text) {
  return /[\u3400-\u9fff]/.test(text) ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AriaNeural'
}

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, stderr: 'timeout' })
    }, timeoutMs)
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stderr: String(error?.message ?? error) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stderr })
    })
  })
}

async function synthesize(text, requestedVoice) {
  const edge = await findEdgeTts()
  if (edge === null) throw new Error('edge-tts 未安装：请先 pip install edge-tts')
  const voice = typeof requestedVoice === 'string' && /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(requestedVoice)
    ? requestedVoice
    : voiceFor(text)
  const id = createHash('sha256').update(voice + '\n' + text).digest('hex')
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })
  const media = path.join(dir, id + '.mp3')
  try {
    const existing = await stat(media)
    if (existing.size > 0) return { id, voice }
  } catch { /* not cached */ }
  const source = path.join(dir, id + '.txt')
  await writeFile(source, text, { encoding: 'utf8', mode: 0o600 })
  try {
    const result = await run(edge, [
      '--file', source,
      '--voice', voice,
      '--write-media', media,
      '--no-progress',
    ], TIMEOUT_MS)
    if (result.code !== 0) {
      const detail = String(result.stderr).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error'
      throw new Error('edge-tts 合成失败：' + detail.slice(0, 200))
    }
    const produced = await stat(media)
    if (produced.size === 0) throw new Error('edge-tts 没有产生音频')
    return { id, voice }
  } finally {
    try { await unlink(source) } catch { /* ignore */ }
  }
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 200_000) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const pathname = url.pathname

        if (req.method === 'POST' && pathname === ROUTE + '/synthesize') {
          try {
            const body = JSON.parse(await readBody(req))
            const text = typeof body?.text === 'string' ? body.text.trim() : ''
            if (text === '') {
              res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ ok: false, error: 'empty-text' }))
              return
            }
            if (text.length > MAX_TEXT) {
              res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ ok: false, error: 'text-too-long' }))
              return
            }
            const { id, voice } = await synthesize(text, body?.voice)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ ok: true, id, voice, url: `${ROUTE}/audio/${id}.mp3` }))
          } catch (error) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error).slice(0, 300) }))
          }
          return
        }

        if (req.method === 'GET' && pathname.startsWith(ROUTE + '/audio/')) {
          const name = pathname.slice((ROUTE + '/audio/').length)
          if (!/^[a-f0-9]{64}\.mp3$/.test(name)) {
            res.writeHead(400)
            res.end()
            return
          }
          try {
            const file = path.join(cacheDir(), name)
            const data = await readFile(file)
            res.writeHead(200, {
              'content-type': 'audio/mpeg',
              'content-length': String(data.length),
              'cache-control': 'private, max-age=86400',
            })
            res.end(data)
          } catch {
            res.writeHead(404)
            res.end()
          }
          return
        }

        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'not-found' }))
      },
    }), 'dsh-read-aloud-edge: synthesis route')
  })
}
