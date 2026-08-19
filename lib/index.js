/**
 * @dsh-external/dsh-bg-carousel — host 半（手写 ESM 产物，零外部依赖）。
 * 扫描 {workspaceRoot}/backgrounds 目录，经 webServer 前缀路由 /dsh-bg/api 提供 JSON API。
 */

export const name = '@dsh-external/dsh-bg-carousel'
export const inject = ['fs', 'sandboxPolicy', 'webServer']

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString('utf8')
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

export function apply(ctx) {
  let dirPath = ''
  let dirTarget = null
  let settings = { intervalMs: 8000, enabled: true, panelOpacity: 0.5 }

  async function probeCandidates() {
    if (dirTarget) return dirTarget
    const root = ctx.sandboxPolicy.workspaceRoot
    const candidates = [root + '/backgrounds', root + '/workspace/backgrounds']
    let foundPath = ''
    let foundTarget = null
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

  async function listImages() {
    const dir = await probeCandidates()
    if (!dir) return []
    let entries = []
    try {
      entries = await ctx.fs.listDir(dir)
    } catch (err) {
      console.log('[bg-carousel] listDir error: ' + String(err))
      return []
    }
    const images = []
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
    path: '/dsh-bg/img',
    handler: async (req, res) => {
      try {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
          .replace(/^\/dsh-bg\/img\//, '')
        const name = decodeURIComponent(pathname)
        if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          return res.end('bad name')
        }
        const dir = await probeCandidates()
        if (!dir) {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          return res.end('no background dir')
        }
        const target = await ctx.fs.resolve(name, { cwd: dirPath })
        const bytes = await ctx.fs.readBytes(target, undefined, 64 * 1024 * 1024)
        const dot = name.toLowerCase().lastIndexOf('.')
        const ext = dot >= 0 ? name.toLowerCase().slice(dot) : ''
        const mime = MIME[ext] || 'application/octet-stream'
        res.writeHead(200, {
          'content-type': mime,
          'cache-control': 'private, max-age=3600',
        })
        res.end(Buffer.from(bytes))
      } catch (err) {
        console.log('[bg-carousel] img error: ' + String(err))
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(String(err))
      }
    },
  }), 'dsh-bg-carousel: img')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-bg/api',
    handler: async (req, res) => {
      const send = (code, obj) => {
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
          if (typeof body?.panelOpacity === 'number') {
            settings.panelOpacity = Math.min(Math.max(body.panelOpacity, 0.1), 0.95)
          }
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
