/**
 * @dsh-external/dsh-bg-carousel — host 半（dsh v0.1.2-alpha.1）。
 * 扫描媒体目录（默认 {workspaceRoot}/backgrounds，可在 UI 里改），经 webServer
 * 前缀路由提供 /dsh-bg/img（媒体字节）与 /dsh-bg/api（JSON API）。
 *
 * 服务依赖经 `ctx.inject(['fs','sandboxPolicy','webServer'], …)` 在运行时等齐：
 * 只有 web profile 提供 webServer；装进 headless/base 等 profile 时这里永远
 * 不触发，插件安静待命，而不是把整个 harness 启动判成 "entry did not activate"。
 */
export const name = '@dsh-external/dsh-bg-carousel';
export const inject = [];
/** 图片扩展名 → MIME（现有格式全保留）。 */
const IMAGE_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
};
/** 视频扩展名 → MIME。HLS(.m3u8) 只有 Safari 原生可播、FLV 需 MSE（不可播时客户端会跳过）。 */
const VIDEO_MIME = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.flv': 'video/x-flv',
};
const MEDIA_MIME = { ...IMAGE_MIME, ...VIDEO_MIME };
/** 单文件读取上限：图片 64 MiB，视频放宽到 256 MiB（readBytes 一次性进内存）。 */
const IMAGE_MAX_BYTES = 64 * 1024 * 1024;
const VIDEO_MAX_BYTES = 256 * 1024 * 1024;
async function readBody(req) {
    const chunks = [];
    for await (const c of req)
        chunks.push(Buffer.from(c));
    return Buffer.concat(chunks).toString('utf8');
}
function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return Buffer.from(binary, 'binary').toString('base64');
}
function extOf(name) {
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.slice(dot) : '';
}
function kindOf(name) {
    const ext = extOf(name);
    if (IMAGE_MIME[ext])
        return 'image';
    if (VIDEO_MIME[ext])
        return 'video';
    return undefined;
}
/** 路由用的文件名安全检查：只允许单段文件名。 */
function isSafeName(name) {
    return !!name && !name.includes('/') && !name.includes('\\') && !name.includes('..');
}
export function apply(ctx) {
    console.log('[bg-carousel] waiting for fs/sandboxPolicy/webServer (no-op outside the web profile)');
    ctx.inject(['fs', 'sandboxPolicy', 'webServer'], (rawScope) => {
        const scope = rawScope;
        let dirPath = '';
        let dirTarget = null;
        /** mediaDir 等目录来源变更后置位，强制下一次探测重跑（缓存失效）。 */
        let dirDirty = true;
        const settings = {
            intervalMs: 8000,
            enabled: true,
            panelOpacity: 0.5,
            mediaDir: '',
            order: [],
        };
        /**
         * 探测当前媒体目录：
         * 1. settings.mediaDir 非空 → 先按原样解析（绝对路径），失败再按工作区相对路径解析；
         *    必须存在且是目录，否则记 dirError 并降级到默认候选。
         * 2. 默认候选 {workspaceRoot}/backgrounds、{workspaceRoot}/workspace/backgrounds（现有行为）。
         * 3. 全部失败 → 兜底解析第一个候选（现有行为，目录不存在时 listDir 会报错降级为空列表）。
         */
        async function probeDir() {
            const root = scope.sandboxPolicy.workspaceRoot;
            let configuredError;
            const configured = settings.mediaDir.trim();
            if (configured) {
                const attempts = [
                    { path: configured },
                    { path: configured, opts: { cwd: root } },
                ];
                for (const attempt of attempts) {
                    try {
                        const t = await scope.fs.resolve(attempt.path, attempt.opts);
                        const info = await scope.fs.stat(t);
                        if (info && info.type === 'directory') {
                            return { target: t, path: scope.fs.processPath(t) };
                        }
                    }
                    catch { /* try next */ }
                }
                // 配置目录不可用：记下提示，继续走默认候选（降级，不空转）
                configuredError = '配置的媒体目录不可用或不是目录：' + configured + '（已回退到默认目录）';
            }
            const candidates = [root + '/backgrounds', root + '/workspace/backgrounds'];
            for (const c of candidates) {
                try {
                    const t = await scope.fs.resolve(c);
                    const info = await scope.fs.stat(t);
                    if (info && info.type === 'directory') {
                        return { target: t, path: scope.fs.processPath(t), error: configuredError };
                    }
                }
                catch { /* try next */ }
            }
            try {
                const t = await scope.fs.resolve(candidates[0]);
                return { target: t, path: scope.fs.processPath(t), error: configuredError };
            }
            catch {
                return {
                    target: null,
                    path: '',
                    error: configuredError ?? '找不到可用的媒体目录（默认 ' + candidates[0] + ' 不存在）',
                };
            }
        }
        async function probeCached() {
            if (!dirDirty && dirTarget)
                return { target: dirTarget, path: dirPath };
            const result = await probeDir();
            dirPath = result.path;
            dirTarget = result.target;
            dirDirty = false;
            console.log('[bg-carousel] root=' + scope.sandboxPolicy.workspaceRoot
                + ' dir=' + result.path
                + (result.error ? ' (' + result.error + ')' : ''));
            return result;
        }
        /**
         * 扫描媒体目录并产出轮播清单：
         * - 只收 file 类型 + 受支持扩展名（图片/视频分开归类）；
         * - 默认按文件名字母序合并成 media；
         * - settings.order 里有的名字按用户顺序排前面，新文件按字母序追加在尾部。
         */
        async function listMedia() {
            const probe = await probeCached();
            if (!probe.target) {
                return { images: [], videos: [], media: [], dir: probe.path, error: probe.error };
            }
            let entries = [];
            try {
                entries = await scope.fs.listDir(probe.target);
            }
            catch (err) {
                console.log('[bg-carousel] listDir error: ' + String(err));
                return {
                    images: [], videos: [], media: [], dir: probe.path,
                    error: '媒体目录无法读取：' + probe.path,
                };
            }
            const images = [];
            const videos = [];
            for (const e of entries) {
                if (e.type !== 'file')
                    continue;
                const kind = kindOf(e.name);
                if (kind === 'image')
                    images.push(e.name);
                if (kind === 'video')
                    videos.push(e.name);
            }
            images.sort();
            videos.sort();
            const items = [
                ...images.map((name) => ({ name, kind: 'image' })),
                ...videos.map((name) => ({ name, kind: 'video' })),
            ];
            items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            const pos = new Map(settings.order.map((n, i) => [n, i]));
            if (pos.size > 0) {
                items.sort((a, b) => {
                    const pa = pos.get(a.name);
                    const pb = pos.get(b.name);
                    if (pa !== undefined && pb !== undefined)
                        return pa - pb;
                    if (pa !== undefined)
                        return -1;
                    if (pb !== undefined)
                        return 1;
                    return 0;
                });
            }
            return { images, videos, media: items, dir: probe.path, error: probe.error };
        }
        /** 按名字读媒体字节；图片/视频分别限幅，超出会抛 FS_TOO_LARGE（由路由兜底成 500）。 */
        async function serveMedia(name) {
            const probe = await probeCached();
            if (!probe.target)
                return null;
            const target = await scope.fs.resolve(name, { cwd: dirPath });
            const maxBytes = VIDEO_MIME[extOf(name)] ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
            return scope.fs.readBytes(target, undefined, maxBytes);
        }
        scope.effect(() => scope.webServer.register({
            kind: 'prefix',
            path: '/dsh-bg/img',
            handler: async (req, res) => {
                try {
                    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
                        .replace(/^\/dsh-bg\/img\//, '');
                    const name = decodeURIComponent(pathname);
                    if (!isSafeName(name)) {
                        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
                        return res.end('bad name');
                    }
                    const bytes = await serveMedia(name);
                    if (!bytes) {
                        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
                        return res.end('no media dir');
                    }
                    res.writeHead(200, {
                        'content-type': MEDIA_MIME[extOf(name)] || 'application/octet-stream',
                        'cache-control': 'private, max-age=3600',
                    });
                    res.end(Buffer.from(bytes));
                }
                catch (err) {
                    console.log('[bg-carousel] img error: ' + String(err));
                    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
                    res.end(String(err));
                }
            },
        }), 'dsh-bg-carousel: img');
        scope.effect(() => scope.webServer.register({
            kind: 'prefix',
            path: '/dsh-bg/api',
            handler: async (req, res) => {
                const send = (code, obj) => {
                    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify(obj));
                };
                try {
                    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
                        .replace(/^\/dsh-bg\/api/, '') || '/';
                    if (req.method === 'GET' && pathname === '/list') {
                        // images 保留给旧版 client；media 是图片+视频混合轮播清单。
                        const { images, videos, media, dir, error } = await listMedia();
                        return send(200, {
                            ok: true,
                            dir,
                            dirError: error ?? null,
                            images,
                            videos,
                            media,
                            settings,
                        });
                    }
                    if (req.method === 'POST' && pathname === '/image') {
                        const body = JSON.parse(await readBody(req));
                        const name = String(body?.name ?? '').trim();
                        if (!name)
                            return send(400, { ok: false, error: 'name 必填' });
                        if (!isSafeName(name))
                            return send(400, { ok: false, error: 'bad name' });
                        const bytes = await serveMedia(name);
                        if (!bytes)
                            return send(500, { ok: false, error: 'no media dir' });
                        return send(200, {
                            ok: true,
                            dataUrl: 'data:' + (MEDIA_MIME[extOf(name)] || 'application/octet-stream') + ';base64,' + bytesToBase64(bytes),
                        });
                    }
                    if (req.method === 'POST' && pathname === '/settings') {
                        const body = JSON.parse(await readBody(req));
                        if (typeof body?.intervalMs === 'number') {
                            settings.intervalMs = Math.min(Math.max(body.intervalMs, 1500), 120000);
                        }
                        if (typeof body?.enabled === 'boolean')
                            settings.enabled = body.enabled;
                        if (typeof body?.panelOpacity === 'number') {
                            settings.panelOpacity = Math.min(Math.max(body.panelOpacity, 0.1), 0.95);
                        }
                        // mediaDir：空串 = 恢复自动探测；非空则原样保存（非法路径由探测降级 + dirError 提示）。
                        if (typeof body?.mediaDir === 'string') {
                            const next = body.mediaDir.trim().slice(0, 1024);
                            if (next !== settings.mediaDir)
                                dirDirty = true;
                            settings.mediaDir = next;
                        }
                        // order：轮播顺序（文件名列表）；只收合法单段文件名，去重，超长截断。
                        if (Array.isArray(body?.order)) {
                            const raw = body.order;
                            settings.order = Array.from(new Set(raw.filter((n) => typeof n === 'string' && isSafeName(n)))).slice(0, 1000);
                        }
                        return send(200, { ok: true, settings });
                    }
                    return send(404, { ok: false, error: 'not found' });
                }
                catch (err) {
                    console.log('[bg-carousel] api error: ' + String(err));
                    return send(500, { ok: false, error: String(err) });
                }
            },
        }), 'dsh-bg-carousel: api');
        console.log('[bg-carousel] host ready');
    });
}
//# sourceMappingURL=index.js.map