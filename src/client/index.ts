/**
 * @dsh-external/dsh-bg-carousel — client 面板。
 * vanilla DOM 组件（component: () => ({render()}) 模式，参照注入器自身 client）。
 * 构建：npm run build:client（tsdown → lib/client.js，ModuleLoader.load 注册）。
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'

type ClientContext = {
  slots: SlotsService
}

export const inject = ['slots']

const API = '/dsh-bg/api'

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== void 0) e.textContent = text
  return e
}

const styles = `
.dbg-page{position:fixed;right:16px;bottom:16px;width:340px;max-height:70vh;display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--dsw-alias-bg-overlay,#1c1e26);border:1px solid var(--dsw-alias-border-l1,#333);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);color:var(--dsw-alias-label-primary,#eee);font-family:system-ui,sans-serif;font-size:13px;z-index:9999;pointer-events:auto;overflow:auto}
.dbg-title{font-weight:600;font-size:14px}
.dbg-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dbg-dir{flex:1;word-break:break-all;opacity:.85;font-size:12px;min-width:0}
.dbg-btn{padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#444);background:var(--dsw-alias-bg-layer-1,#262a34);color:var(--dsw-alias-label-primary,#eee);font-size:12px;white-space:nowrap}
.dbg-btn:disabled{opacity:.45;cursor:not-allowed}
.dbg-grid{display:flex;gap:6px;flex-wrap:wrap}
.dbg-thumb{width:56px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid transparent;background:#00000033}
.dbg-thumb.active{border-color:var(--dsw-alias-brand-primary,#4f8cff)}
.dbg-hint{font-size:12px;opacity:.7;line-height:1.5}
.dbg-err{color:var(--dsw-alias-state-error-primary,#e5534b);font-size:12px}
.dbg-empty{font-size:12px;opacity:.7}
.dbg-input{width:56px;padding:2px 4px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2,#444);background:var(--dsw-alias-bg-layer-1,#262a34);color:var(--dsw-alias-label-primary,#eee)}
.dbg-label{display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}
`

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'dsh-bg-carousel',
      label: () => '背景轮播',
      component: () => ({
        render() {
          const wrap = el('div')
          const style = document.createElement('style')
          style.textContent = styles
          const btn = el('button', 'dbg-btn')
          btn.textContent = '🖼 背景'
          btn.addEventListener('click', () => {
            const panel = document.querySelector('.dbg-page') as HTMLElement | null
            if (panel) {
              panel.remove()
            } else {
              mountPanel()
            }
          })
          wrap.append(style, btn)
          return wrap
        },
      }),
    }),
  ), 'dsh-bg-carousel: footer action')

  let disposeInterval: (() => void) | null = null

  function mountPanel(): void {
    const page = el('div', 'dbg-page')
    const style = document.createElement('style')
    style.textContent = styles
    const title = el('div', 'dbg-title', '背景轮播')
    const dirRow = el('div', 'dbg-row')
    const dirSpan = el('span', 'dbg-dir', '正在定位背景目录…')
    const btnOpen = el('button', 'dbg-btn', '打开文件夹')
    const btnRefresh = el('button', 'dbg-btn', '刷新')
    dirRow.append(dirSpan, btnOpen, btnRefresh)

    const toggleRow = el('div', 'dbg-row')
    const labelToggle = el('label', 'dbg-label')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = true
    labelToggle.append(checkbox, document.createTextNode('自动轮播'))
    const labelInterval = el('label', 'dbg-label', '间隔(秒)')
    const intervalInput = document.createElement('input')
    intervalInput.className = 'dbg-input'
    intervalInput.type = 'number'
    intervalInput.min = '2'
    intervalInput.max = '120'
    intervalInput.value = '8'
    labelInterval.append(intervalInput)
    toggleRow.append(labelToggle, labelInterval)

    const grid = el('div', 'dbg-grid')
    const hint = el('div', 'dbg-hint', '把 jpg/png/webp/gif 图片复制到上方文件夹，然后点“刷新”。')
    const msg = el('div')
    msg.style.display = 'none'
    page.append(style, title, dirRow, toggleRow, msg, grid, hint)
    document.body.appendChild(page)

    const state = { images: [] as string[], index: 0, cache: {} as Record<string, string> }

    const say = (text: string, isErr = false): void => {
      msg.textContent = text
      msg.style.display = text ? 'block' : 'none'
      msg.style.color = isErr ? 'var(--dsw-alias-state-error-primary,#e5534b)' : 'var(--dsw-alias-label-secondary,#999)'
    }

    const applyBackground = (): void => {
      let styleEl = document.getElementById('dsh-bg-bgstyle') as HTMLStyleElement | null
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'dsh-bg-bgstyle'
        document.head.appendChild(styleEl)
      }
      const name = state.images[Math.min(state.index, state.images.length - 1)]
      const url = name ? state.cache[name] : ''
      if (!url) {
        styleEl.textContent = ''
        return
      }
      styleEl.textContent = 'body::before{content:"";position:fixed;inset:0;z-index:-1;' +
        'background:linear-gradient(rgba(0,0,0,.22),rgba(0,0,0,.22)),url("' + url + '") center/cover no-repeat;' +
        'pointer-events:none;opacity:.92}'
      const root = document.documentElement
      root.style.setProperty('--dsw-alias-bg-base', 'rgba(8,10,14,.5)')
      root.style.setProperty('--dsw-specific-sidebar-fill', 'rgba(8,10,14,.45)')
    }

    const clearBackground = (): void => {
      const styleEl = document.getElementById('dsh-bg-bgstyle') as HTMLStyleElement | null
      if (styleEl) styleEl.textContent = ''
      const root = document.documentElement
      root.style.removeProperty('--dsw-alias-bg-base')
      root.style.removeProperty('--dsw-specific-sidebar-fill')
    }

    const refresh = (): void => {
      fetchJson('/list').then((d) => {
        if (!d?.ok) return say(JSON.stringify(d), true)
        state.images = d.images || []
        dirSpan.textContent = d.dir || ''
        if (d.settings) {
          checkbox.checked = !!d.settings.enabled
          intervalInput.value = String(Math.round((d.settings.intervalMs || 8000) / 1000))
        }
        grid.textContent = ''
        if (!state.images.length) {
          grid.append(el('div', 'dbg-empty', '目录中没有图片'))
          return
        }
        state.images.forEach((name, i) => {
          const img = document.createElement('img')
          img.className = 'dbg-thumb' + (i === state.index ? ' active' : '')
          img.title = name
          fetchJson('/image', { method: 'POST', body: JSON.stringify({ name }) })
            .then((r) => { if (r?.ok) { state.cache[name] = r.dataUrl; if (img) img.src = r.dataUrl } })
            .catch(() => {})
          img.addEventListener('click', () => {
            state.index = i
            grid.querySelectorAll('.dbg-thumb').forEach((t) => t.classList.remove('active'))
            img.classList.add('active')
            applyBackground()
          })
          grid.append(img)
        })
        applyBackground()
      }).catch((err) => say('加载失败: ' + err, true))
    }

    const syncSettings = (): void => {
      fetchJson('/settings', {
        method: 'POST',
        body: JSON.stringify({
          enabled: checkbox.checked,
          intervalMs: parseInt(intervalInput.value, 10) * 1000 || 8000,
        }),
      }).catch(() => {})
    }

    checkbox.addEventListener('change', () => {
      syncSettings()
      if (!checkbox.checked) {
        if (disposeInterval) { disposeInterval(); disposeInterval = null }
        clearBackground()
      } else {
        refresh()
      }
    })
    intervalInput.addEventListener('change', () => {
      syncSettings()
      if (disposeInterval) { disposeInterval(); disposeInterval = null }
      if (checkbox.checked && state.images.length > 1) startLoop()
    })
    btnRefresh.addEventListener('click', refresh)
    btnOpen.addEventListener('click', () => {
      if (dirSpan.textContent && dirSpan.textContent !== '正在定位背景目录…') {
        window.open('file:///' + dirSpan.textContent.replace(/\\/g, '/'))
      }
    })

    function startLoop(): void {
      if (disposeInterval) return
      const timer = window.setInterval(() => {
        if (!state.images.length) return
        state.index = (state.index + 1) % state.images.length
        grid.querySelectorAll('.dbg-thumb').forEach((t, i) => {
          t.classList.toggle('active', i === state.index)
        })
        applyBackground()
      }, (parseInt(intervalInput.value, 10) || 8) * 1000)
      disposeInterval = () => window.clearInterval(timer)
    }

    function fetchJson(path: string, init?: RequestInit): Promise<any> {
      return fetch(API + path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      }).then((r) => r.json())
    }

    refresh()
    startLoop()
  }

  ctx.effect(() => () => {
    if (disposeInterval) disposeInterval()
    document.querySelector('.dbg-page')?.remove()
    clearBackground()
    const styleEl = document.getElementById('dsh-bg-bgstyle')
    if (styleEl) styleEl.remove()
  }, 'dsh-bg-carousel: cleanup')

  function clearBackground(): void {
    const styleEl = document.getElementById('dsh-bg-bgstyle') as HTMLStyleElement | null
    if (styleEl) styleEl.textContent = ''
    const root = document.documentElement
    root.style.removeProperty('--dsw-alias-bg-base')
    root.style.removeProperty('--dsw-specific-sidebar-fill')
  }
}
