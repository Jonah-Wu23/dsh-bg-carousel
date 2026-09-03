/**
 * @jonahwu/dsh-bg-carousel — client 面板（dsh v0.1.2-rc.1）。
 * React 组件经 ctx.slots 注册：Trigger 进 sidebar.footer.action，面板进
 * shell.overlay。v0.1.2 起 slots.register 的组件是第二个位置参数（不再放在
 * options 里），组件本身是 React 函数组件而不是 {render()} 对象。
 * 运行时只 require 平台种子模块 react（tsdown external；其余为类型导入，构建期擦除）。
 * 构建：tsdown → lib/client.js（window.__ModuleLoader__.load 包裹）。
 *
 * 目录能力（v0.1.2-rc.1 起）：rc.1 的 web-app 组合了 host-directory-picker
 * 与 api-workspace-controller 的 remote namespace：
 * - 「选择目录」按钮 → ctx.remote.directoryPicker.pick()（Windows 走
 *   IFileOpenDialog 原生选择器，rc.1 修复了中文路径截断）；
 * - 「打开文件夹」按钮 → ctx.remote.session.openWorkspacePath({ path })，
 *   由宿主在系统文件管理器中打开目录（替代会被浏览器拦截的 file:// 链接）。
 * 'remote' 与点路径 namespace（remote.directoryPicker / remote.session）已声明进
 * 插件 inject——cordis 拒绝未声明服务的属性访问
 * （"cannot get property … without inject"）；namespace 缺失时给出提示而不是静默失败。
 *
 * 媒体轮播：图片走 body 背景（现有机制）；视频走 z-index:-1 的固定定位层
 * （object-fit:cover、静音、自动播放），UI 的半透明 token 照常透出视频层，
 * 因此「面板不透明」滑杆对图片和视频同样生效。
 */
import * as React from 'react'

/** dsh-client-remotes 的 RemoteResult（dsh-typert-protocol）在插件里用到的那一面。 */
type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } }

type ClientContext = {
  effect(execute: () => void | (() => void), label?: string): () => void
  slots: {
    inject(key: string, create: () => () => void): () => void
    register(options: Record<string, unknown>, component: (props: any) => unknown): () => void
  }
  theme?: {
    getTheme(): { active: { colorScheme: 'light' | 'dark' } }
    overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
  }
  /** dsh-api-remotes 挂载的 remote namespaces（web profile 提供；已声明进 inject）。 */
  remote?: {
    directoryPicker?: {
      pick(signal?: AbortSignal): Promise<RemoteResult<string | null>>
    }
    session?: {
      openWorkspacePath(request: { path: string }, signal?: AbortSignal): Promise<RemoteResult<{ opened: true }>>
    }
  }
}

// 目录选择（directoryPicker.pick）与宿主打开路径（session.openWorkspacePath）
// 挂在 remote 的 namespace 上；rc.1 里每个 namespace 是独立的点路径服务
// （remote.directoryPicker / remote.session），cordis 只允许访问 inject 声明过的
// 服务，因此必须像官方 ui-chat（inject 含 'remote.session'）一样把点路径
// namespace 一并声明；只声明 'remote' 时 namespace 访问会抛
// "cannot get property \"remote.directoryPicker\" without inject"。
export const inject = [
  'slots', 'theme', 'remote', 'remote.directoryPicker', 'remote.session',
]

const API = '/dsh-bg/api'

type MediaKind = 'image' | 'video'
type MediaItem = { name: string; kind: MediaKind }

// 模块级共享面板状态：Trigger（footer）与 Panel（overlay）订阅同一源
const panelStore = {
  open: false,
  listeners: new Set<() => void>(),
}
function setPanelOpen(v: boolean): void {
  panelStore.open = v
  panelStore.listeners.forEach((fn) => fn())
}
function subscribePanel(fn: () => void): () => void {
  panelStore.listeners.add(fn)
  return () => { panelStore.listeners.delete(fn) }
}
function getPanelOpen(): boolean {
  return panelStore.open
}

function fetchJson(path: string, init?: RequestInit): Promise<any> {
  return fetch(API + path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  }).then((r) => r.json())
}

// 静态媒体 URL（Host 直接返回文件字节，不走 base64，支持大图/大视频）
function imageUrl(name: string): string {
  return '/dsh-bg/img/' + encodeURIComponent(name)
}

// 缩略图 URL：宿主把大图缩到 320px 缓存后返回（未命中时回退原图）。
// 上百张高清图若直接用原图当缩略图，全量解码+绘制会占掉一半主线程时间。
function thumbUrl(name: string): string {
  return '/dsh-bg/thumb/' + encodeURIComponent(name)
}

/**
 * 打开宿主原生目录选择器（v0.1.2-rc.1 的 host-directory-picker，Windows 用
 * IFileOpenDialog）。走 remote.directoryPicker namespace；namespace 缺失时抛
 * 带提示的错误，面板负责展示。注意：cordis 只允许插件访问其 inject 声明过的
 * 服务，因此本插件把 'remote' 声明进 inject，未声明的属性访问会抛
 * "cannot get property … without inject"。
 * @returns 选中的绝对路径；用户在系统对话框里取消时返回 null。
 */
async function pickDirectoryOnHost(): Promise<string | null> {
  const picker = clientCtx?.remote?.directoryPicker
  if (picker && typeof picker.pick === 'function') {
    const result = await picker.pick()
    if (result.ok) return result.value
    throw new Error('目录选择失败：' + result.error.message)
  }
  throw new Error('当前 dsh 界面未提供目录选择能力（需要 v0.1.2-rc.1+ 的 web profile）')
}

/**
 * 在系统文件管理器中打开目录（v0.1.2-rc.1 起由宿主 openWorkspacePath 完成，
 * 替代被浏览器拦截的 window.open('file:///…')）。
 * @returns 打开失败时的错误文案；null 表示已成功打开或无可达的宿主能力。
 */
async function openDirOnHost(dir: string): Promise<string | null> {
  const session = clientCtx?.remote?.session
  if (session && typeof session.openWorkspacePath === 'function') {
    const result = await session.openWorkspacePath({ path: dir })
    if (!result.ok) return '打开文件夹失败：' + result.error.message
    return null
  }
  // 兜底：桌面环境（如旧版）允许时直接尝试 file://，浏览器通常会拦截
  window.open('file:///' + dir.replace(/\\/g, '/'))
  return null
}

const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 16, bottom: 16, width: 340, maxHeight: '70vh',
  display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
  background: 'var(--dsw-alias-bg-overlay,#1c1e26)',
  border: '1px solid var(--dsw-alias-border-l1,#333)',
  borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.35)',
  color: 'var(--dsw-alias-label-primary,#eee)',
  fontFamily: 'system-ui,sans-serif', fontSize: 13, zIndex: 9999,
  pointerEvents: 'auto', overflow: 'auto',
}
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const btnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--dsw-alias-border-l2,#444)',
  background: 'var(--dsw-alias-bg-layer-1,#262a34)',
  color: 'var(--dsw-alias-label-primary,#eee)', fontSize: 12, whiteSpace: 'nowrap',
}
const dirInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 6, fontSize: 12,
  border: '1px solid var(--dsw-alias-border-l2,#444)',
  background: 'var(--dsw-alias-bg-layer-1,#262a34)',
  color: 'var(--dsw-alias-label-primary,#eee)',
}
const thumbStyle: React.CSSProperties = {
  width: 56, height: 40, objectFit: 'cover', borderRadius: 6,
  cursor: 'pointer', border: '2px solid transparent', background: '#00000033',
  display: 'block',
}
const thumbActive: React.CSSProperties = { ...thumbStyle, borderColor: 'var(--dsw-alias-brand-primary,#4f8cff)' }
const thumbWrapStyle: React.CSSProperties = { cursor: 'grab', lineHeight: 0 }
const inputStyle: React.CSSProperties = {
  width: 56, padding: '2px 4px', borderRadius: 4,
  border: '1px solid var(--dsw-alias-border-l2,#444)',
  background: 'var(--dsw-alias-bg-layer-1,#262a34)',
  color: 'var(--dsw-alias-label-primary,#eee)',
}

let bgStyleEl: HTMLStyleElement | null = null
let themeDispose: (() => void) | null = null
let themeService: ClientContext['theme'] | null = null
/** apply() 收到的 client ctx：面板按钮在点击时才惰性读取 remote/uiWorkspace 服务。 */
let clientCtx: ClientContext | null = null
let currentUrl: string | null = null
let currentOpacity = 0.5
let videoLayerEl: HTMLDivElement | null = null
let videoGradientEl: HTMLDivElement | null = null

// 当前是否为暗色主题（theme 服务快照 + OS prefers-color-scheme 兜底）
function isDarkTheme(): boolean {
  if (themeService && themeService.getTheme) {
    try {
      const snap = themeService.getTheme()
      if (snap && snap.active && snap.active.colorScheme) {
        return snap.active.colorScheme === 'dark'
      }
    } catch { /* fall through */ }
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// 压暗渐变（暗色主题压暗保证文字对比；亮色主题只轻微压暗）——图片和视频共用一套取色
function dimColor(): string {
  return isDarkTheme() ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.08)'
}

// 背景图 + 暗化渐变（仅图片路径；视频由媒体层负责）
function renderBgStyle(): void {
  if (!bgStyleEl || !currentUrl) return
  const dim = dimColor()
  bgStyleEl.textContent = 'body{background:linear-gradient(' + dim + ',' + dim + '),url("' + currentUrl + '") center/cover no-repeat fixed!important}'
}

/**
 * 视频背景层：position:fixed + z-index:-1 的容器叠在 body 背景之上、UI 之下。
 * UI 面板的半透明 token（theme.overrideTokens）照常透出这一层，所以透明度
 * 调整对视频同样生效。层内视频在上、压暗渐变再叠一层，保证可读性。
 */
function ensureVideoLayer(): HTMLDivElement {
  if (!videoLayerEl) {
    const layer = document.createElement('div')
    layer.id = 'dsh-bg-videolayer'
    layer.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden'
    const gradient = document.createElement('div')
    gradient.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    layer.appendChild(gradient)
    videoGradientEl = gradient
    document.body.appendChild(layer)
    videoLayerEl = layer
  }
  renderVideoDim()
  return videoLayerEl
}

function renderVideoDim(): void {
  if (videoGradientEl) {
    const dim = dimColor()
    videoGradientEl.style.background = 'linear-gradient(' + dim + ',' + dim + ')'
  }
}

interface VideoHandlers {
  /** 自然播完：推进轮播；单媒体/停用时原地重播。 */
  onEnded(video: HTMLVideoElement): void
  /** 加载/解码失败：记日志并跳到下一个媒体。 */
  onFailed(video: HTMLVideoElement, reason: string): void
  /** 成功起播：重置连续失败计数。 */
  onPlaying(): void
}

function mountVideoLayer(src: string, handlers: VideoHandlers): void {
  const layer = ensureVideoLayer()
  // 每次更换媒体都清掉旧 video（不残留上个文件的进度与事件监听）
  layer.querySelectorAll('video').forEach((v) => {
    v.pause()
    v.removeAttribute('src')
    v.load()
    v.remove()
  })
  const video = document.createElement('video')
  video.src = src
  video.muted = true // 静音播放，同时也是浏览器自动播放策略的前提
  video.autoplay = true
  video.playsInline = true
  video.loop = false // 结束交由 onended 决定「下一个」还是「重播」
  video.preload = 'auto'
  Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'cover' })
  video.addEventListener('ended', () => handlers.onEnded(video))
  video.addEventListener('error', () => handlers.onFailed(video, '加载/解码失败'))
  video.addEventListener('playing', () => handlers.onPlaying())
  layer.appendChild(video)
  const attempt = video.play()
  if (attempt) {
    attempt.catch((err) => {
      // 自动播放被环境策略拦截：确保静音后重试一次；再失败就停在已加载的
      // 首帧（body 背景仍垫底，不会黑屏），定时器照常按节奏推进轮播。
      // 源本身已报错（onFailed 会跳过）的情况不再刷重试日志。
      if (video.error) return
      console.warn('[bg-carousel] 自动播放被拒绝，静音重试：', String(err))
      video.muted = true
      video.play().catch(() => {})
    })
  }
}

function unmountVideoLayer(): void {
  if (videoLayerEl) {
    videoLayerEl.querySelectorAll('video').forEach((v) => {
      v.pause()
      v.removeAttribute('src')
      v.load()
    })
    videoLayerEl.remove()
    videoLayerEl = null
    videoGradientEl = null
  }
}

// 半透明遮罩按主题取色：暗色用深底、亮色用浅底（overrideTokens 自动按
// 当前 colorScheme 选 light/dark，并跟随 OS 主题切换）。
// 注意：这是「面板不透明」滑杆的唯一作用点，对图片和视频背景都生效。
function applyOverlay(theme: ClientContext['theme'] | null, opacity: number): void {
  if (themeDispose) { themeDispose(); themeDispose = null }
  if (!theme || !theme.overrideTokens) return
  const o = typeof opacity === 'number' ? opacity : 0.5
  themeDispose = theme.overrideTokens('dsh-bg-carousel', {
    '--dsw-alias-bg-base': {
      light: 'rgba(255,255,255,' + o + ')',
      dark: 'rgba(8,10,14,' + o + ')',
    },
    '--dsw-alias-bg-layer-1': {
      light: 'rgba(255,255,255,' + Math.min(o + 0.05, 0.95) + ')',
      dark: 'rgba(8,10,14,' + Math.min(o + 0.05, 0.95) + ')',
    },
    '--dsw-alias-bg-layer-2': {
      light: 'rgba(255,255,255,' + Math.min(o + 0.1, 0.95) + ')',
      dark: 'rgba(8,10,14,' + Math.min(o + 0.1, 0.95) + ')',
    },
    '--dsw-specific-sidebar-fill': {
      light: 'rgba(255,255,255,' + Math.max(o - 0.05, 0.1) + ')',
      dark: 'rgba(8,10,14,' + Math.max(o - 0.05, 0.1) + ')',
    },
  })
}

function setBackground(url: string, opacity: number): void {
  currentUrl = url
  currentOpacity = opacity
  if (!bgStyleEl) {
    bgStyleEl = document.createElement('style')
    bgStyleEl.id = 'dsh-bg-bgstyle'
    document.head.appendChild(bgStyleEl)
  }
  renderBgStyle()
}

function clearBackground(): void {
  currentUrl = null
  if (bgStyleEl) bgStyleEl.textContent = ''
  unmountVideoLayer()
  if (themeDispose) { themeDispose(); themeDispose = null }
}

/** 视频缩略图：静音取首帧（#t=0.1 促使部分浏览器渲染首帧）；加载失败回退 🎬 占位。 */
function VideoThumb(props: { src: string; active: boolean; onClick: () => void }): React.ReactElement {
  const [failed, setFailed] = React.useState(false)
  if (failed) {
    return React.createElement('div', {
      style: { ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1 },
      onClick: props.onClick,
    }, '🎬')
  }
  return React.createElement('video', {
    src: props.src,
    muted: true,
    preload: 'metadata',
    draggable: false,
    style: props.active ? thumbActive : thumbStyle,
    onClick: props.onClick,
    onError: () => setFailed(true),
  })
}

function Panel(): React.ReactElement | null {
  const open = React.useSyncExternalStore(subscribePanel, getPanelOpen)
  const [media, setMedia] = React.useState<MediaItem[]>([])
  const [dir, setDir] = React.useState('')
  const [dirInput, setDirInput] = React.useState('')
  const [dirError, setDirError] = React.useState('')
  const [error, setError] = React.useState('')
  const [enabled, setEnabled] = React.useState(true)
  const [intervalMs, setIntervalMs] = React.useState(8000)
  const [panelOpacity, setPanelOpacity] = React.useState(0.5)
  const [index, setIndex] = React.useState(0)
  /** 目录切换后的 cache-bust 参数：避免同名文件命中旧目录的浏览器缓存。 */
  const [bust, setBust] = React.useState(0)
  const lastDirRef = React.useRef('')
  const savedDirRef = React.useRef('')
  const loadedRef = React.useRef(false)
  const dragIndexRef = React.useRef(-1)
  const failuresRef = React.useRef(0)
  const advanceRef = React.useRef<() => void>(() => {})

  const refresh = React.useCallback(() => {
    fetchJson('/list').then((d) => {
      if (!d?.ok) {
        setError(JSON.stringify(d))
        return
      }
      // 旧版 host 没有 media 字段时降级成纯图片清单
      const list: MediaItem[] = Array.isArray(d.media)
        ? d.media
        : (d.images || []).map((name: string) => ({ name, kind: 'image' as const }))
      if (d.dir && d.dir !== lastDirRef.current) {
        lastDirRef.current = d.dir
        setBust(Date.now())
      }
      failuresRef.current = 0
      loadedRef.current = true
      setMedia(list)
      setDir(d.dir || '')
      setError('')
      setDirError(typeof d.dirError === 'string' ? d.dirError : '')
      if (d.settings) {
        setEnabled(!!d.settings.enabled)
        setIntervalMs(d.settings.intervalMs || 8000)
        setPanelOpacity(typeof d.settings.panelOpacity === 'number' ? d.settings.panelOpacity : 0.5)
        const md = typeof d.settings.mediaDir === 'string' ? d.settings.mediaDir : ''
        savedDirRef.current = md
        setDirInput(md)
      }
    }).catch((e) => setError(String(e)))
  }, [])

  React.useEffect(() => { refresh() }, [refresh])
  React.useEffect(() => { if (open) refresh() }, [open, refresh])

  const current = media.length ? media[Math.min(index, media.length - 1)] : null
  const currentName = current?.name ?? ''
  const currentKind: MediaKind = current?.kind ?? 'image'
  const mediaUrl = (name: string): string => imageUrl(name) + (bust ? '?b=' + bust : '')

  // 轮播推进：换 index 前先看连续失败计数——全部媒体都失败时暂停，避免死循环空转
  advanceRef.current = () => {
    if (media.length > 0 && failuresRef.current >= media.length) return
    setIndex((i) => (media.length ? (i + 1) % media.length : 0))
  }
  const skipCurrent = (name: string, reason: string): void => {
    console.warn('[bg-carousel] 跳过媒体 ' + name + '：' + reason)
    failuresRef.current += 1
    if (media.length > 0 && failuresRef.current >= media.length) {
      setError('所有媒体都无法播放，已暂停自动轮播；可点「刷新」、手动点缩略图或换个目录重试')
      return
    }
    advanceRef.current()
  }

  // 媒体展示：图片 → body 背景（现有机制）；视频 → 固定定位媒体层。
  // 面板不透明（panelOpacity）不在这里：它只作用于 UI token，切换时不重载视频。
  React.useEffect(() => {
    if (!enabled || !current) return
    if (current.kind === 'video') {
      mountVideoLayer(mediaUrl(current.name), {
        onEnded: (video) => {
          // 单媒体或停用轮播：原地重播；否则推进到下一个媒体
          if (enabled && media.length > 1) {
            advanceRef.current()
          } else {
            video.currentTime = 0
            video.play().catch(() => {})
          }
        },
        onFailed: (video, reason) => skipCurrent(video.currentSrc || current.name, reason),
        onPlaying: () => { failuresRef.current = 0 },
      })
      return () => { unmountVideoLayer() }
    }
    setBackground(mediaUrl(current.name), panelOpacity)
    return () => { if (bgStyleEl) bgStyleEl.textContent = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentName, currentKind, bust])

  // 半透明 token（「面板不透明」滑杆的作用点）：显示媒体期间随时生效，隐藏时清理。
  React.useEffect(() => {
    if (!enabled || !currentName) return
    applyOverlay(themeService, panelOpacity)
    return () => {
      if (themeDispose) { themeDispose(); themeDispose = null }
    }
  }, [enabled, currentName, panelOpacity])

  // 轮换定时器：图片按间隔切换；视频若在间隔内自然播完由 onended 提前推进
  // （index 变化时本 effect 的 cleanup 会清掉未触发的定时器，保证只推进一次）；
  // 视频卡死/不结束则定时器兜底截断，节奏不会停。
  React.useEffect(() => {
    if (!enabled || media.length <= 1) return
    const t = window.setTimeout(() => advanceRef.current(), intervalMs)
    return () => window.clearTimeout(t)
  }, [enabled, media, index, intervalMs])

  // 设置自动同步：首次清单加载完成前不发（挂载竞态会用空 order 覆盖服务端已存的顺序）
  React.useEffect(() => {
    if (!loadedRef.current) return
    fetchJson('/settings', {
      method: 'POST',
      body: JSON.stringify({
        enabled,
        intervalMs,
        panelOpacity,
        mediaDir: savedDirRef.current,
        order: media.map((m) => m.name),
      }),
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, panelOpacity])

  React.useEffect(() => () => { clearBackground() }, [])

  if (!open) return null

  // 保存目录：立即生效（POST 后立刻重新拉清单），不需要重启
  const saveDir = (): void => {
    const next = dirInput.trim()
    savedDirRef.current = next
    fetchJson('/settings', { method: 'POST', body: JSON.stringify({ mediaDir: next }) })
      .then(() => refresh())
      .catch((e) => setError(String(e)))
  }

  // 选择目录：宿主原生目录选择器（v0.1.2-rc.1 的 directoryPicker）；取消则不动
  const pickDir = (): void => {
    setError('')
    pickDirectoryOnHost().then((picked) => {
      if (picked == null) return
      savedDirRef.current = picked
      setDirInput(picked)
      fetchJson('/settings', { method: 'POST', body: JSON.stringify({ mediaDir: picked }) })
        .then(() => refresh())
        .catch((e) => setError(String(e)))
    }).catch((e) => setError(String(e)))
  }

  // 打开文件夹：宿主 openWorkspacePath 在系统文件管理器中打开（替代 file://）
  const openDir = (): void => {
    if (!dir) {
      setError('当前没有可打开的媒体目录')
      return
    }
    setError('')
    openDirOnHost(dir).then((err) => {
      if (err) setError(err)
    }).catch((e) => setError(String(e)))
  }

  // 拖拽排序：放下后本地立即生效并持久化到 settings.order
  const commitReorder = (targetIdx: number): void => {
    const from = dragIndexRef.current
    dragIndexRef.current = -1
    if (from < 0 || from === targetIdx || from >= media.length || targetIdx >= media.length) return
    const next = media.slice()
    const moved = next.splice(from, 1)[0]
    next.splice(targetIdx, 0, moved)
    setMedia(next)
    setIndex(Math.max(0, next.findIndex((m) => m.name === currentName)))
    fetchJson('/settings', { method: 'POST', body: JSON.stringify({ order: next.map((m) => m.name) }) }).catch(() => {})
  }

  const selectThumb = (i: number): void => {
    failuresRef.current = 0 // 手动选择视为恢复，解除「全部失败」暂停
    setIndex(i)
  }

  const thumbs = media.map((m, i) =>
    React.createElement('div', {
      key: m.name,
      draggable: true,
      title: m.name + (m.kind === 'video' ? '（视频）' : '') + '，拖拽可调整顺序',
      style: thumbWrapStyle,
      onDragStart: (e) => {
        dragIndexRef.current = i
        // 不冒泡：官方 ui-attachment 在 document 上有附件拖放监听
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        // Firefox 不设置数据不启动拖拽；自定义类型（非 Files）也确保
        // 这是一次面板内排序拖拽而不是文件拖放
        e.dataTransfer.setData('application/x-dsh-bg-carousel-order', String(i))
      },
      onDragEnter: (e) => { e.preventDefault(); e.stopPropagation() },
      onDragOver: (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
      },
      onDrop: (e) => {
        e.preventDefault()
        e.stopPropagation()
        commitReorder(i)
      },
      onDragEnd: (e) => {
        e.stopPropagation()
        dragIndexRef.current = -1
      },
    },
    m.kind === 'video'
      ? React.createElement(VideoThumb, {
          src: mediaUrl(m.name) + '#t=0.1',
          active: i === index,
          onClick: () => selectThumb(i),
        })
      : React.createElement('img', {
          src: thumbUrl(m.name) + (bust ? '?b=' + bust : ''),
          alt: m.name,
          // img 是浏览器原生可拖拽元素：不关掉的话按住图片启动的是浏览器
          // 自带图片拖拽（Chromium 携带 Files 类型），插件的 onDragStart
          // 根本不会执行，排序失效且会触发全局附件拖放层
          draggable: false,
          // 懒加载 + 异步解码：只解码视口附近的缩略图，解码不占主线程
          loading: 'lazy',
          decoding: 'async',
          width: 56,
          height: 40,
          style: i === index ? thumbActive : thumbStyle,
          onClick: () => selectThumb(i),
        })),
  )

  // 操作报错（选择/打开/保存）优先展示，其次才是清单携带的 dirError，
  // 避免瞬时操作错误被常驻目录提示永久遮蔽。
  const message = error || dirError

  // 面板内的元素拖拽（排序）不冒泡到 document：官方 ui-attachment 在 document
  // 上监听 dragenter/dragover/drop 显示附件拖放层（以 dataTransfer.types 含
  // 'Files' 为门槛），元素拖拽在部分 Chromium 里也带 'Files'，会把排序拖拽
  // 误判成附件拖放并弹文件对话框。只拦非文件拖拽；真实文件拖放照常透传。
  const dragGuard = (e: React.DragEvent): void => {
    const types = e.dataTransfer?.types
    if (types && Array.from(types).includes('Files')) return
    e.stopPropagation()
  }

  return React.createElement('div', {
    style: panelStyle,
    onDragEnter: dragGuard,
    onDragOver: dragGuard,
    onDrop: dragGuard,
    onDragEnd: dragGuard,
  },
    React.createElement('div', { style: { fontWeight: 600, fontSize: 14 } }, '背景轮播'),
    React.createElement('div', { style: rowStyle },
      React.createElement('input', {
        style: dirInputStyle,
        value: dirInput,
        placeholder: '媒体目录（留空 = 工作区 backgrounds）',
        onChange: (e) => setDirInput(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') saveDir() },
      }),
      React.createElement('button', { style: btnStyle, onClick: pickDir, title: '打开系统目录选择器' }, '选择'),
      React.createElement('button', { style: btnStyle, onClick: saveDir }, '保存'),
      React.createElement('button', {
        style: btnStyle,
        onClick: () => { setDirInput(''); savedDirRef.current = ''; fetchJson('/settings', { method: 'POST', body: JSON.stringify({ mediaDir: '' }) }).then(() => refresh()).catch(() => {}) },
      }, '默认'),
    ),
    React.createElement('div', { style: rowStyle },
      React.createElement('span', { style: { flex: 1, wordBreak: 'break-all', opacity: 0.85, fontSize: 12 } },
        dir ? '当前：' + dir : '正在定位媒体目录…'),
      React.createElement('button', {
        style: btnStyle,
        onClick: openDir,
        title: '在系统文件管理器中打开当前目录',
      }, '打开文件夹'),
      React.createElement('button', { style: btnStyle, onClick: refresh }, '刷新'),
    ),
    React.createElement('div', { style: rowStyle },
      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' } },
        React.createElement('input', {
          type: 'checkbox', checked: enabled,
          onChange: (e) => setEnabled(e.target.checked),
        }),
        '自动轮播',
      ),
      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' } },
        '间隔(秒)',
        React.createElement('input', {
          type: 'number', min: 2, max: 120, value: Math.round(intervalMs / 1000),
          style: inputStyle,
          onChange: (e) => {
            const v = parseInt(e.target.value, 10)
            if (v > 0) setIntervalMs(v * 1000)
          },
        }),
      ),
    ),
    React.createElement('div', { style: rowStyle },
      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' } },
        '面板不透明',
        React.createElement('input', {
          type: 'range', min: 10, max: 95, value: Math.round(panelOpacity * 100),
          style: { flex: 1, minWidth: 80, cursor: 'pointer' },
          onChange: (e) => setPanelOpacity(parseInt(e.target.value, 10) / 100),
        }),
        React.createElement('span', { style: { width: 34, textAlign: 'right', opacity: 0.85 } },
          Math.round(panelOpacity * 100) + '%'),
      ),
    ),
    message ? React.createElement('div', { style: { color: 'var(--dsw-alias-state-error-primary,#e5534b)', fontSize: 12, whiteSpace: 'pre-wrap' } }, message) : null,
    media.length
      ? React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, thumbs)
      : React.createElement('div', { style: { fontSize: 12, opacity: 0.7 } }, '目录中没有受支持的媒体文件'),
    React.createElement('div', { style: { fontSize: 12, opacity: 0.7, lineHeight: 1.5 } },
      '支持 jpg/png/webp/svg/gif 与 mp4/webm/mov/m3u8/flv（视频静音播放）。缩略图可拖拽排序；视频在间隔短于时长时会被截断切换。'),
  )
}

function Trigger(props: { wide?: boolean }): React.ReactElement {
  const open = React.useSyncExternalStore(subscribePanel, getPanelOpen)
  return React.createElement('button', {
    onClick: () => setPanelOpen(!open),
    title: '背景轮播',
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: 4, padding: '4px 8px', whiteSpace: 'nowrap',
      background: 'transparent', border: 'none', cursor: 'pointer',
      color: 'var(--dsw-alias-label-secondary,#999)', fontSize: 12,
      borderRadius: 6, lineHeight: 1,
    } as React.CSSProperties,
  }, '🖼' + (props.wide ? ' 背景' : ''))
}

export function apply(ctx: ClientContext): void {
  clientCtx = ctx
  themeService = ctx.theme || null

  // OS 亮暗翻转时重渲染背景暗化层与遮罩（theme/change 事件在 bundle
  // 环境不可靠，用 matchMedia 直接监听，theme 服务快照负责取色）
  const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
  const onScheme = (): void => {
    renderBgStyle()
    renderVideoDim()
    if (currentUrl) applyOverlay(themeService, currentOpacity)
  }
  ctx.effect(() => {
    if (!media) return
    media.addEventListener('change', onScheme)
    return () => media.removeEventListener('change', onScheme)
  }, 'dsh-bg-carousel: scheme follow')

  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'dsh-bg-carousel',
      label: () => '背景轮播',
    }, Trigger)
  ), 'dsh-bg-carousel: footer action')

  ctx.effect(() => ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-bg-carousel',
    }, Panel)
  ), 'dsh-bg-carousel: overlay panel')
}
