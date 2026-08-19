/**
 * @dsh-external/dsh-bg-carousel — DeepSeek Harness 背景轮播。
 * Host 端：扫描 {workspaceRoot}/backgrounds 目录的图片，经 webServer 前缀路由
 * /dsh-bg/api 提供 JSON API（list/image/settings）。
 */
import type { Context } from 'cordis'

type AppContext = Context & {
  fs: {
    resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
    stat(target: unknown, signal?: AbortSignal): Promise<unknown>
    processPath(target: unknown): string
    listDir(target: unknown, signal?: AbortSignal): Promise<Array<{ name?: string }>>
    readBytes(target: unknown, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  }
  sandboxPolicy: { workspaceRoot: string }
  webServer: {
    register(route: {
      kind: string
      path: string
      handler: (req: any, res: any) => void | Promise<void>
    }): () => void
  }
}

export const name = '@dsh-external/dsh-bg-carousel'
export const inject = ['fs', 'sandboxPolicy', 'webServer']

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

interface Settings {
  intervalMs: number
  enabled: boolean
}

async function readBody(req: any): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString('utf8')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

export function apply(ctx: AppContext): void {
  let dirPath = ''
  let dirTarget: unknown = null
  let settings: Settings = { intervalMs: 8000, enabled: true }

  async function probeCandidates(): Promise<unknown> {
    if (dirTarget) return dirTarget
    const root = ctx.sandboxPolicy.workspaceRoot
    const candidates = [root + '/backgrounds', root + '/workspace/backgrounds']
    let foundPath = ''
    let foundTarget: unknown = null
    for (const c of candidates) {
      try {
        const t = await ctx.fs.resolve(c)
        const info = await ctx.fs.stat(t)
        if (info) {
          foundPath = ctx.fs.processPath(t)
          foundTarget = t
          break
        }
      } catch { /* try next */ }
    }
    if (!foundTarget) {
      try {
        const t = await ctx.fs.resolve(candidates[0])
        foundPath = ctx.fs.processPath(t)
        foundTarget = t
      } catch { /* keep null */ }
    }
    dirPath = foundPath
    dirTarget = foundTarget
    console.log('[bg-carousel] root=' + root + ' dir=' + foundPath)
    return foundTarget
  }

  async function listImages(): Promise<string[]> {
    const dir = await probeCandidates()
    if (!dir) return []
    let entries: Array<{ name?: string }> = []
    try {
      entries = await ctx.fs.listDir(dir)
    } catch (err) {
      console.log('[bg-carousel] listDir error: ' + String(err))
      return []
    }
    const images: string[] = []
    for (const e of entries) {
      const name = typeof e.name === 'string' && e.name ? e.name : ''
      if (!name) continue
      const lower = name.toLowerCase()
      const dot = lower.lastIndexOf('.')
      if (dot < 0) continue
      const ext = lower.slice(dot)
      if (!MIME[ext]) continue
      images.push(name)
    }
    images.sort()
    return images
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-bg/api',
    handler: async (req: any, res: any) => {
      const send = (code: number, obj: unknown): void => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(obj))
      }
      try {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
          .replace(/^\/dsh-bg\/api/, '') || '/'
        if (req.method === 'GET' && pathname === '/list') {
          const images = await listImages()
          return send(200, { ok: true, dir: dirPath, images, settings })
        }
        if (req.method === 'POST' && pathname === '/image') {
          const body = JSON.parse(await readBody(req))
          const name = String(body?.name ?? '').trim()
          if (!name) return send(400, { ok: false, error: 'name 必填' })
          if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            return send(400, { ok: false, error: 'bad name' })
          }
          const dir = await probeCandidates()
          if (!dir) return send(500, { ok: false, error: 'no background dir' })
          const target = await ctx.fs.resolve(name, { cwd: dirPath })
          const bytes = await ctx.fs.readBytes(target, undefined, 12 * 1024 * 1024)
          const dot = name.toLowerCase().lastIndexOf('.')
          const ext = dot >= 0 ? name.toLowerCase().slice(dot) : ''
          const mime = MIME[ext] || 'application/octet-stream'
          return send(200, { ok: true, dataUrl: 'data:' + mime + ';base64,' + bytesToBase64(bytes) })
        }
        if (req.method === 'POST' && pathname === '/settings') {
          const body = JSON.parse(await readBody(req))
          if (typeof body?.intervalMs === 'number') {
            settings.intervalMs = Math.min(Math.max(body.intervalMs, 1500), 120000)
          }
          if (typeof body?.enabled === 'boolean') settings.enabled = body.enabled
          return send(200, { ok: true, settings })
        }
        return send(404, { ok: false, error: 'not found' })
      } catch (err) {
        console.log('[bg-carousel] api error: ' + String(err))
        return send(500, { ok: false, error: String(err) })
      }
    },
  }), 'dsh-bg-carousel: api')

  console.log('[bg-carousel] host ready')
}
