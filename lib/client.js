window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-bg-carousel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/index.ts
		/**
		* @dsh-external/dsh-bg-carousel — client 面板（dsh v0.1.2-alpha.1）。
		* React 组件经 ctx.slots 注册：Trigger 进 sidebar.footer.action，面板进
		* shell.overlay。v0.1.2 起 slots.register 的组件是第二个位置参数（不再放在
		* options 里），组件本身是 React 函数组件而不是 {render()} 对象。
		* 运行时只 require 平台种子模块 react（tsdown external；其余为类型导入，构建期擦除）。
		* 构建：tsdown → lib/client.js（window.__ModuleLoader__.load 包裹）。
		*
		* 媒体轮播：图片走 body 背景（现有机制）；视频走 z-index:-1 的固定定位层
		* （object-fit:cover、静音、自动播放），UI 的半透明 token 照常透出视频层，
		* 因此「面板不透明」滑杆对图片和视频同样生效。
		*/
		const inject = ["slots", "theme"];
		const API = "/dsh-bg/api";
		const panelStore = {
			open: false,
			listeners: /* @__PURE__ */ new Set()
		};
		function setPanelOpen(v) {
			panelStore.open = v;
			panelStore.listeners.forEach((fn) => fn());
		}
		function subscribePanel(fn) {
			panelStore.listeners.add(fn);
			return () => {
				panelStore.listeners.delete(fn);
			};
		}
		function getPanelOpen() {
			return panelStore.open;
		}
		function fetchJson(path, init) {
			return fetch(API + path, {
				headers: { "content-type": "application/json" },
				...init
			}).then((r) => r.json());
		}
		function imageUrl(name) {
			return "/dsh-bg/img/" + encodeURIComponent(name);
		}
		const panelStyle = {
			position: "fixed",
			right: 16,
			bottom: 16,
			width: 340,
			maxHeight: "70vh",
			display: "flex",
			flexDirection: "column",
			gap: 10,
			padding: 14,
			background: "var(--dsw-alias-bg-overlay,#1c1e26)",
			border: "1px solid var(--dsw-alias-border-l1,#333)",
			borderRadius: 12,
			boxShadow: "0 8px 32px rgba(0,0,0,.35)",
			color: "var(--dsw-alias-label-primary,#eee)",
			fontFamily: "system-ui,sans-serif",
			fontSize: 13,
			zIndex: 9999,
			pointerEvents: "auto",
			overflow: "auto"
		};
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const btnStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			cursor: "pointer",
			border: "1px solid var(--dsw-alias-border-l2,#444)",
			background: "var(--dsw-alias-bg-layer-1,#262a34)",
			color: "var(--dsw-alias-label-primary,#eee)",
			fontSize: 12,
			whiteSpace: "nowrap"
		};
		const dirInputStyle = {
			flex: 1,
			minWidth: 0,
			padding: "4px 6px",
			borderRadius: 6,
			fontSize: 12,
			border: "1px solid var(--dsw-alias-border-l2,#444)",
			background: "var(--dsw-alias-bg-layer-1,#262a34)",
			color: "var(--dsw-alias-label-primary,#eee)"
		};
		const thumbStyle = {
			width: 56,
			height: 40,
			objectFit: "cover",
			borderRadius: 6,
			cursor: "pointer",
			border: "2px solid transparent",
			background: "#00000033",
			display: "block"
		};
		const thumbActive = {
			...thumbStyle,
			borderColor: "var(--dsw-alias-brand-primary,#4f8cff)"
		};
		const thumbWrapStyle = {
			cursor: "grab",
			lineHeight: 0
		};
		const inputStyle = {
			width: 56,
			padding: "2px 4px",
			borderRadius: 4,
			border: "1px solid var(--dsw-alias-border-l2,#444)",
			background: "var(--dsw-alias-bg-layer-1,#262a34)",
			color: "var(--dsw-alias-label-primary,#eee)"
		};
		let bgStyleEl = null;
		let themeDispose = null;
		let themeService = null;
		let currentUrl = null;
		let currentOpacity = .5;
		let videoLayerEl = null;
		let videoGradientEl = null;
		function isDarkTheme() {
			if (themeService && themeService.getTheme) try {
				const snap = themeService.getTheme();
				if (snap && snap.active && snap.active.colorScheme) return snap.active.colorScheme === "dark";
			} catch {}
			return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
		}
		function dimColor() {
			return isDarkTheme() ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.08)";
		}
		function renderBgStyle() {
			if (!bgStyleEl || !currentUrl) return;
			const dim = dimColor();
			bgStyleEl.textContent = "body{background:linear-gradient(" + dim + "," + dim + "),url(\"" + currentUrl + "\") center/cover no-repeat fixed!important}";
		}
		/**
		* 视频背景层：position:fixed + z-index:-1 的容器叠在 body 背景之上、UI 之下。
		* UI 面板的半透明 token（theme.overrideTokens）照常透出这一层，所以透明度
		* 调整对视频同样生效。层内视频在上、压暗渐变再叠一层，保证可读性。
		*/
		function ensureVideoLayer() {
			if (!videoLayerEl) {
				const layer = document.createElement("div");
				layer.id = "dsh-bg-videolayer";
				layer.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden";
				const gradient = document.createElement("div");
				gradient.style.cssText = "position:absolute;inset:0;pointer-events:none";
				layer.appendChild(gradient);
				videoGradientEl = gradient;
				document.body.appendChild(layer);
				videoLayerEl = layer;
			}
			renderVideoDim();
			return videoLayerEl;
		}
		function renderVideoDim() {
			if (videoGradientEl) {
				const dim = dimColor();
				videoGradientEl.style.background = "linear-gradient(" + dim + "," + dim + ")";
			}
		}
		function mountVideoLayer(src, handlers) {
			const layer = ensureVideoLayer();
			layer.querySelectorAll("video").forEach((v) => {
				v.pause();
				v.removeAttribute("src");
				v.load();
				v.remove();
			});
			const video = document.createElement("video");
			video.src = src;
			video.muted = true;
			video.autoplay = true;
			video.playsInline = true;
			video.loop = false;
			video.preload = "auto";
			Object.assign(video.style, {
				width: "100%",
				height: "100%",
				objectFit: "cover"
			});
			video.addEventListener("ended", () => handlers.onEnded(video));
			video.addEventListener("error", () => handlers.onFailed(video, "加载/解码失败"));
			video.addEventListener("playing", () => handlers.onPlaying());
			layer.appendChild(video);
			const attempt = video.play();
			if (attempt) attempt.catch((err) => {
				if (video.error) return;
				console.warn("[bg-carousel] 自动播放被拒绝，静音重试：", String(err));
				video.muted = true;
				video.play().catch(() => {});
			});
		}
		function unmountVideoLayer() {
			if (videoLayerEl) {
				videoLayerEl.querySelectorAll("video").forEach((v) => {
					v.pause();
					v.removeAttribute("src");
					v.load();
				});
				videoLayerEl.remove();
				videoLayerEl = null;
				videoGradientEl = null;
			}
		}
		function applyOverlay(theme, opacity) {
			if (themeDispose) {
				themeDispose();
				themeDispose = null;
			}
			if (!theme || !theme.overrideTokens) return;
			const o = typeof opacity === "number" ? opacity : .5;
			themeDispose = theme.overrideTokens("dsh-bg-carousel", {
				"--dsw-alias-bg-base": {
					light: "rgba(255,255,255," + o + ")",
					dark: "rgba(8,10,14," + o + ")"
				},
				"--dsw-alias-bg-layer-1": {
					light: "rgba(255,255,255," + Math.min(o + .05, .95) + ")",
					dark: "rgba(8,10,14," + Math.min(o + .05, .95) + ")"
				},
				"--dsw-alias-bg-layer-2": {
					light: "rgba(255,255,255," + Math.min(o + .1, .95) + ")",
					dark: "rgba(8,10,14," + Math.min(o + .1, .95) + ")"
				},
				"--dsw-specific-sidebar-fill": {
					light: "rgba(255,255,255," + Math.max(o - .05, .1) + ")",
					dark: "rgba(8,10,14," + Math.max(o - .05, .1) + ")"
				}
			});
		}
		function setBackground(url, opacity) {
			currentUrl = url;
			currentOpacity = opacity;
			if (!bgStyleEl) {
				bgStyleEl = document.createElement("style");
				bgStyleEl.id = "dsh-bg-bgstyle";
				document.head.appendChild(bgStyleEl);
			}
			renderBgStyle();
		}
		function clearBackground() {
			currentUrl = null;
			if (bgStyleEl) bgStyleEl.textContent = "";
			unmountVideoLayer();
			if (themeDispose) {
				themeDispose();
				themeDispose = null;
			}
		}
		/** 视频缩略图：静音取首帧（#t=0.1 促使部分浏览器渲染首帧）；加载失败回退 🎬 占位。 */
		function VideoThumb(props) {
			const [failed, setFailed] = react.useState(false);
			if (failed) return react.createElement("div", {
				style: {
					...thumbStyle,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 18,
					lineHeight: 1
				},
				onClick: props.onClick
			}, "🎬");
			return react.createElement("video", {
				src: props.src,
				muted: true,
				preload: "metadata",
				style: props.active ? thumbActive : thumbStyle,
				onClick: props.onClick,
				onError: () => setFailed(true)
			});
		}
		function Panel() {
			const open = react.useSyncExternalStore(subscribePanel, getPanelOpen);
			const [media, setMedia] = react.useState([]);
			const [dir, setDir] = react.useState("");
			const [dirInput, setDirInput] = react.useState("");
			const [dirError, setDirError] = react.useState("");
			const [error, setError] = react.useState("");
			const [enabled, setEnabled] = react.useState(true);
			const [intervalMs, setIntervalMs] = react.useState(8e3);
			const [panelOpacity, setPanelOpacity] = react.useState(.5);
			const [index, setIndex] = react.useState(0);
			/** 目录切换后的 cache-bust 参数：避免同名文件命中旧目录的浏览器缓存。 */
			const [bust, setBust] = react.useState(0);
			const lastDirRef = react.useRef("");
			const savedDirRef = react.useRef("");
			const loadedRef = react.useRef(false);
			const dragIndexRef = react.useRef(-1);
			const failuresRef = react.useRef(0);
			const advanceRef = react.useRef(() => {});
			const refresh = react.useCallback(() => {
				fetchJson("/list").then((d) => {
					if (!d?.ok) {
						setError(JSON.stringify(d));
						return;
					}
					const list = Array.isArray(d.media) ? d.media : (d.images || []).map((name) => ({
						name,
						kind: "image"
					}));
					if (d.dir && d.dir !== lastDirRef.current) {
						lastDirRef.current = d.dir;
						setBust(Date.now());
					}
					failuresRef.current = 0;
					loadedRef.current = true;
					setMedia(list);
					setDir(d.dir || "");
					setError("");
					setDirError(typeof d.dirError === "string" ? d.dirError : "");
					if (d.settings) {
						setEnabled(!!d.settings.enabled);
						setIntervalMs(d.settings.intervalMs || 8e3);
						setPanelOpacity(typeof d.settings.panelOpacity === "number" ? d.settings.panelOpacity : .5);
						const md = typeof d.settings.mediaDir === "string" ? d.settings.mediaDir : "";
						savedDirRef.current = md;
						setDirInput(md);
					}
				}).catch((e) => setError(String(e)));
			}, []);
			react.useEffect(() => {
				refresh();
			}, [refresh]);
			react.useEffect(() => {
				if (open) refresh();
			}, [open, refresh]);
			const current = media.length ? media[Math.min(index, media.length - 1)] : null;
			const currentName = current?.name ?? "";
			const currentKind = current?.kind ?? "image";
			const mediaUrl = (name) => imageUrl(name) + (bust ? "?b=" + bust : "");
			advanceRef.current = () => {
				if (media.length > 0 && failuresRef.current >= media.length) return;
				setIndex((i) => media.length ? (i + 1) % media.length : 0);
			};
			const skipCurrent = (name, reason) => {
				console.warn("[bg-carousel] 跳过媒体 " + name + "：" + reason);
				failuresRef.current += 1;
				if (media.length > 0 && failuresRef.current >= media.length) {
					setError("所有媒体都无法播放，已暂停自动轮播；可点「刷新」、手动点缩略图或换个目录重试");
					return;
				}
				advanceRef.current();
			};
			react.useEffect(() => {
				if (!enabled || !current) return;
				if (current.kind === "video") {
					mountVideoLayer(mediaUrl(current.name), {
						onEnded: (video) => {
							if (enabled && media.length > 1) advanceRef.current();
							else {
								video.currentTime = 0;
								video.play().catch(() => {});
							}
						},
						onFailed: (video, reason) => skipCurrent(video.currentSrc || current.name, reason),
						onPlaying: () => {
							failuresRef.current = 0;
						}
					});
					return () => {
						unmountVideoLayer();
					};
				}
				setBackground(mediaUrl(current.name), panelOpacity);
				return () => {
					if (bgStyleEl) bgStyleEl.textContent = "";
				};
			}, [
				enabled,
				currentName,
				currentKind,
				bust
			]);
			react.useEffect(() => {
				if (!enabled || !currentName) return;
				applyOverlay(themeService, panelOpacity);
				return () => {
					if (themeDispose) {
						themeDispose();
						themeDispose = null;
					}
				};
			}, [
				enabled,
				currentName,
				panelOpacity
			]);
			react.useEffect(() => {
				if (!enabled || media.length <= 1) return;
				const t = window.setTimeout(() => advanceRef.current(), intervalMs);
				return () => window.clearTimeout(t);
			}, [
				enabled,
				media,
				index,
				intervalMs
			]);
			react.useEffect(() => {
				if (!loadedRef.current) return;
				fetchJson("/settings", {
					method: "POST",
					body: JSON.stringify({
						enabled,
						intervalMs,
						panelOpacity,
						mediaDir: savedDirRef.current,
						order: media.map((m) => m.name)
					})
				}).catch(() => {});
			}, [
				enabled,
				intervalMs,
				panelOpacity
			]);
			react.useEffect(() => () => {
				clearBackground();
			}, []);
			if (!open) return null;
			const saveDir = () => {
				const next = dirInput.trim();
				savedDirRef.current = next;
				fetchJson("/settings", {
					method: "POST",
					body: JSON.stringify({ mediaDir: next })
				}).then(() => refresh()).catch((e) => setError(String(e)));
			};
			const commitReorder = (targetIdx) => {
				const from = dragIndexRef.current;
				dragIndexRef.current = -1;
				if (from < 0 || from === targetIdx || from >= media.length || targetIdx >= media.length) return;
				const next = media.slice();
				const moved = next.splice(from, 1)[0];
				next.splice(targetIdx, 0, moved);
				setMedia(next);
				setIndex(Math.max(0, next.findIndex((m) => m.name === currentName)));
				fetchJson("/settings", {
					method: "POST",
					body: JSON.stringify({ order: next.map((m) => m.name) })
				}).catch(() => {});
			};
			const selectThumb = (i) => {
				failuresRef.current = 0;
				setIndex(i);
			};
			const thumbs = media.map((m, i) => react.createElement("div", {
				key: m.name,
				draggable: true,
				title: m.name + (m.kind === "video" ? "（视频）" : "") + "，拖拽可调整顺序",
				style: thumbWrapStyle,
				onDragStart: () => {
					dragIndexRef.current = i;
				},
				onDragOver: (e) => {
					e.preventDefault();
				},
				onDrop: () => commitReorder(i),
				onDragEnd: () => {
					dragIndexRef.current = -1;
				}
			}, m.kind === "video" ? react.createElement(VideoThumb, {
				src: mediaUrl(m.name) + "#t=0.1",
				active: i === index,
				onClick: () => selectThumb(i)
			}) : react.createElement("img", {
				src: mediaUrl(m.name),
				alt: m.name,
				style: i === index ? thumbActive : thumbStyle,
				onClick: () => selectThumb(i)
			})));
			const message = dirError || error;
			return react.createElement("div", { style: panelStyle }, react.createElement("div", { style: {
				fontWeight: 600,
				fontSize: 14
			} }, "背景轮播"), react.createElement("div", { style: rowStyle }, react.createElement("input", {
				style: dirInputStyle,
				value: dirInput,
				placeholder: "媒体目录（留空 = 工作区 backgrounds）",
				onChange: (e) => setDirInput(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter") saveDir();
				}
			}), react.createElement("button", {
				style: btnStyle,
				onClick: saveDir
			}, "保存"), react.createElement("button", {
				style: btnStyle,
				onClick: () => {
					setDirInput("");
					savedDirRef.current = "";
					fetchJson("/settings", {
						method: "POST",
						body: JSON.stringify({ mediaDir: "" })
					}).then(() => refresh()).catch(() => {});
				}
			}, "默认")), react.createElement("div", { style: rowStyle }, react.createElement("span", { style: {
				flex: 1,
				wordBreak: "break-all",
				opacity: .85,
				fontSize: 12
			} }, dir ? "当前：" + dir : "正在定位媒体目录…"), react.createElement("button", {
				style: btnStyle,
				onClick: () => {
					if (dir) window.open("file:///" + dir.replace(/\\/g, "/"));
				}
			}, "打开文件夹"), react.createElement("button", {
				style: btnStyle,
				onClick: refresh
			}, "刷新")), react.createElement("div", { style: rowStyle }, react.createElement("label", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				cursor: "pointer",
				whiteSpace: "nowrap"
			} }, react.createElement("input", {
				type: "checkbox",
				checked: enabled,
				onChange: (e) => setEnabled(e.target.checked)
			}), "自动轮播"), react.createElement("label", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				whiteSpace: "nowrap"
			} }, "间隔(秒)", react.createElement("input", {
				type: "number",
				min: 2,
				max: 120,
				value: Math.round(intervalMs / 1e3),
				style: inputStyle,
				onChange: (e) => {
					const v = parseInt(e.target.value, 10);
					if (v > 0) setIntervalMs(v * 1e3);
				}
			}))), react.createElement("div", { style: rowStyle }, react.createElement("label", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				whiteSpace: "nowrap"
			} }, "面板不透明", react.createElement("input", {
				type: "range",
				min: 10,
				max: 95,
				value: Math.round(panelOpacity * 100),
				style: {
					flex: 1,
					minWidth: 80,
					cursor: "pointer"
				},
				onChange: (e) => setPanelOpacity(parseInt(e.target.value, 10) / 100)
			}), react.createElement("span", { style: {
				width: 34,
				textAlign: "right",
				opacity: .85
			} }, Math.round(panelOpacity * 100) + "%"))), message ? react.createElement("div", { style: {
				color: "var(--dsw-alias-state-error-primary,#e5534b)",
				fontSize: 12,
				whiteSpace: "pre-wrap"
			} }, message) : null, media.length ? react.createElement("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap"
			} }, thumbs) : react.createElement("div", { style: {
				fontSize: 12,
				opacity: .7
			} }, "目录中没有受支持的媒体文件"), react.createElement("div", { style: {
				fontSize: 12,
				opacity: .7,
				lineHeight: 1.5
			} }, "支持 jpg/png/webp/svg/gif 与 mp4/webm/mov/m3u8/flv（视频静音播放）。缩略图可拖拽排序；视频在间隔短于时长时会被截断切换。"));
		}
		function Trigger(props) {
			const open = react.useSyncExternalStore(subscribePanel, getPanelOpen);
			return react.createElement("button", {
				onClick: () => setPanelOpen(!open),
				title: "背景轮播",
				style: {
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 4,
					padding: "4px 8px",
					whiteSpace: "nowrap",
					background: "transparent",
					border: "none",
					cursor: "pointer",
					color: "var(--dsw-alias-label-secondary,#999)",
					fontSize: 12,
					borderRadius: 6,
					lineHeight: 1
				}
			}, "🖼" + (props.wide ? " 背景" : ""));
		}
		function apply(ctx) {
			themeService = ctx.theme || null;
			const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
			const onScheme = () => {
				renderBgStyle();
				renderVideoDim();
				if (currentUrl) applyOverlay(themeService, currentOpacity);
			};
			ctx.effect(() => {
				if (!media) return;
				media.addEventListener("change", onScheme);
				return () => media.removeEventListener("change", onScheme);
			}, "dsh-bg-carousel: scheme follow");
			ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-bg-carousel",
				label: () => "背景轮播"
			}, Trigger)), "dsh-bg-carousel: footer action");
			ctx.effect(() => ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-bg-carousel"
			}, Panel)), "dsh-bg-carousel: overlay panel");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map