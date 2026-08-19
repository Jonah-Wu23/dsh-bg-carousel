window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-bg-carousel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		//#region src/client/index.ts
		const inject = ["slots", "theme"];
		const API = "/dsh-bg/api";

		// 模块级共享面板状态：Trigger（footer）与 Panel（overlay）订阅同一源
		const panelStore = {
			open: false,
			listeners: new Set(),
		};
		function setPanelOpen(v) {
			panelStore.open = v;
			panelStore.listeners.forEach((fn) => fn());
		}
		function subscribePanel(fn) {
			panelStore.listeners.add(fn);
			return () => panelStore.listeners.delete(fn);
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

		// 静态图片 URL（Host 直接返回文件字节，不走 base64，支持大图）
		function imageUrl(name) {
			return "/dsh-bg/img/" + encodeURIComponent(name);
		}

		const panelStyle = {
			position: "fixed", right: 16, bottom: 16, width: 340, maxHeight: "70vh",
			display: "flex", flexDirection: "column", gap: 10, padding: 14,
			background: "var(--dsw-alias-bg-overlay,#1c1e26)",
			border: "1px solid var(--dsw-alias-border-l1,#333)",
			borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.35)",
			color: "var(--dsw-alias-label-primary,#eee)",
			fontFamily: "system-ui,sans-serif", fontSize: 13, zIndex: 9999,
			pointerEvents: "auto", overflow: "auto",
		};
		const rowStyle = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
		const btnStyle = {
			padding: "4px 10px", borderRadius: 6, cursor: "pointer",
			border: "1px solid var(--dsw-alias-border-l2,#444)",
			background: "var(--dsw-alias-bg-layer-1,#262a34)",
			color: "var(--dsw-alias-label-primary,#eee)", fontSize: 12, whiteSpace: "nowrap",
		};
		const thumbStyle = {
			width: 56, height: 40, objectFit: "cover", borderRadius: 6,
			cursor: "pointer", border: "2px solid transparent", background: "#00000033",
		};
		const thumbActive = Object.assign({}, thumbStyle, { borderColor: "var(--dsw-alias-brand-primary,#4f8cff)" });
		const inputStyle = {
			width: 56, padding: "2px 4px", borderRadius: 4,
			border: "1px solid var(--dsw-alias-border-l2,#444)",
			background: "var(--dsw-alias-bg-layer-1,#262a34)",
			color: "var(--dsw-alias-label-primary,#eee)",
		};

		let bgStyleEl = null;
		let themeDispose = null;
		let themeService = null;
		let currentUrl = null;
		let currentOpacity = 0.5;
		let mediaListener = null;

		// 当前是否为暗色主题（theme 服务快照 + OS prefers-color-scheme 兜底）
		function isDarkTheme() {
			if (themeService && themeService.getTheme) {
				try {
					const snap = themeService.getTheme();
					if (snap && snap.active && snap.active.colorScheme) {
						return snap.active.colorScheme === "dark";
					}
				} catch { /* fall through */ }
			}
			return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
		}

		// 背景图 + 暗化渐变（暗色主题压暗保证文字对比；亮色主题只轻微压暗）
		function renderBgStyle() {
			if (!bgStyleEl || !currentUrl) return;
			const dim = isDarkTheme() ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.08)";
			bgStyleEl.textContent = 'body{background:linear-gradient(' + dim + ',' + dim + '),url("' + currentUrl + '") center/cover no-repeat fixed!important}';
		}

		// 半透明遮罩按主题取色：暗色用深底、亮色用浅底（overrideTokens 自动按
		// 当前 colorScheme 选 light/dark，并跟随 OS 主题切换）
		function applyOverlay(theme, opacity) {
			if (themeDispose) { themeDispose(); themeDispose = null; }
			if (!theme || !theme.overrideTokens) return;
			const o = typeof opacity === "number" ? opacity : 0.5;
			themeDispose = theme.overrideTokens("dsh-bg-carousel", {
				"--dsw-alias-bg-base": {
					light: "rgba(255,255,255," + o + ")",
					dark: "rgba(8,10,14," + o + ")",
				},
				"--dsw-alias-bg-layer-1": {
					light: "rgba(255,255,255," + Math.min(o + 0.05, 0.95) + ")",
					dark: "rgba(8,10,14," + Math.min(o + 0.05, 0.95) + ")",
				},
				"--dsw-alias-bg-layer-2": {
					light: "rgba(255,255,255," + Math.min(o + 0.1, 0.95) + ")",
					dark: "rgba(8,10,14," + Math.min(o + 0.1, 0.95) + ")",
				},
				"--dsw-specific-sidebar-fill": {
					light: "rgba(255,255,255," + Math.max(o - 0.05, 0.1) + ")",
					dark: "rgba(8,10,14," + Math.max(o - 0.05, 0.1) + ")",
				},
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
			if (themeDispose) { themeDispose(); themeDispose = null; }
		}

		function Panel() {
			const open = react.useSyncExternalStore(subscribePanel, getPanelOpen);
			const [images, setImages] = react.useState([]);
			const [dir, setDir] = react.useState("");
			const [error, setError] = react.useState("");
			const [enabled, setEnabled] = react.useState(true);
			const [intervalMs, setIntervalMs] = react.useState(8000);
			const [panelOpacity, setPanelOpacity] = react.useState(0.5);
			const [index, setIndex] = react.useState(0);

			const refresh = react.useCallback(() => {
				fetchJson("/list").then((d) => {
					if (!d?.ok) {
						setError(JSON.stringify(d));
						return;
					}
					setImages(d.images || []);
					setDir(d.dir || "");
					setError("");
					if (d.settings) {
						setEnabled(!!d.settings.enabled);
						setIntervalMs(d.settings.intervalMs || 8000);
						setPanelOpacity(typeof d.settings.panelOpacity === "number" ? d.settings.panelOpacity : 0.5);
					}
				}).catch((e) => setError(String(e)));
			}, []);

			react.useEffect(() => { refresh(); }, [refresh]);
			react.useEffect(() => { if (open) refresh(); }, [open, refresh]);

			const currentName = images.length ? images[Math.min(index, images.length - 1)] : "";

			react.useEffect(() => {
				if (!enabled || images.length <= 1) return;
				const t = window.setInterval(() => {
					setIndex((i) => (i + 1) % (images.length || 1));
				}, intervalMs);
				return () => window.clearInterval(t);
			}, [enabled, images.length, intervalMs]);

			react.useEffect(() => {
				if (!enabled || !currentName) return;
				setBackground(imageUrl(currentName), panelOpacity);
				applyOverlay(themeService, panelOpacity);
				return clearBackground;
			}, [enabled, currentName, panelOpacity]);

			react.useEffect(() => {
				fetchJson("/settings", {
					method: "POST",
					body: JSON.stringify({ enabled, intervalMs, panelOpacity })
				}).catch(() => {});
			}, [enabled, intervalMs, panelOpacity]);

			react.useEffect(() => () => { clearBackground(); }, []);

			if (!open) return null;

			const thumbs = images.map((name, i) =>
				react.createElement("img", {
					key: name,
					src: imageUrl(name),
					title: name,
					style: i === index ? thumbActive : thumbStyle,
					onClick: () => setIndex(i),
				})
			);

			return react.createElement("div", { style: panelStyle },
				react.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, "背景轮播"),
				react.createElement("div", { style: rowStyle },
					react.createElement("span", { style: { flex: 1, wordBreak: "break-all", opacity: .85, fontSize: 12 } }, dir || "正在定位背景目录…"),
					react.createElement("button", {
						style: btnStyle,
						onClick: () => { if (dir) window.open("file:///" + dir.replace(/\\/g, "/")); },
					}, "打开文件夹"),
					react.createElement("button", { style: btnStyle, onClick: refresh }, "刷新"),
				),
				react.createElement("div", { style: rowStyle },
					react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" } },
						react.createElement("input", {
							type: "checkbox", checked: enabled,
							onChange: (e) => setEnabled(e.target.checked),
						}),
						"自动轮播",
					),
					react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" } },
						"间隔(秒)",
						react.createElement("input", {
							type: "number", min: 2, max: 120, value: Math.round(intervalMs / 1000),
							style: inputStyle,
							onChange: (e) => {
								const v = parseInt(e.target.value, 10);
								if (v > 0) setIntervalMs(v * 1000);
							},
						}),
					),
				),
				react.createElement("div", { style: rowStyle },
					react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" } },
						"面板不透明",
						react.createElement("input", {
							type: "range", min: 10, max: 95, value: Math.round(panelOpacity * 100),
							style: { flex: 1, minWidth: 80, cursor: "pointer" },
							onChange: (e) => setPanelOpacity(parseInt(e.target.value, 10) / 100),
						}),
						react.createElement("span", { style: { width: 34, textAlign: "right", opacity: .85 } },
							Math.round(panelOpacity * 100) + "%"),
					),
				),
				error ? react.createElement("div", { style: { color: "var(--dsw-alias-state-error-primary,#e5534b)", fontSize: 12 } }, error) : null,
				images.length
					? react.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, thumbs)
					: react.createElement("div", { style: { fontSize: 12, opacity: .7 } }, "目录中没有图片"),
				react.createElement("div", { style: { fontSize: 12, opacity: .7, lineHeight: 1.5 } },
					"把 jpg/png/webp/gif 图片复制到上方文件夹，然后点“刷新”。"),
			);
		}

		function Trigger(props) {
			const open = react.useSyncExternalStore(subscribePanel, getPanelOpen);
			return react.createElement("button", {
				onClick: () => setPanelOpen(!open),
				title: "背景轮播",
				style: {
					display: "inline-flex", alignItems: "center", justifyContent: "center",
					gap: 4, padding: "4px 8px", whiteSpace: "nowrap",
					background: "transparent", border: "none", cursor: "pointer",
					color: "var(--dsw-alias-label-secondary,#999)", fontSize: 12,
					borderRadius: 6, lineHeight: 1,
				},
			}, "🖼" + (props.wide ? " 背景" : ""));
		}

		function apply(ctx) {
			themeService = ctx.theme || null;

			// OS 亮暗翻转时重渲染背景暗化层与遮罩（theme/change 事件在 bundle
			// 环境不可靠，用 matchMedia 直接监听，theme 服务快照负责取色）
			const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
			const onScheme = () => {
				renderBgStyle();
				if (currentUrl) applyOverlay(themeService, currentOpacity);
			};
			ctx.effect(() => {
				if (!media) return;
				media.addEventListener("change", onScheme);
				return () => media.removeEventListener("change", onScheme);
			}, "dsh-bg-carousel: scheme follow");

			ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () =>
				ctx.slots.register({
					name: "sidebar.footer.action",
					id: "dsh-bg-carousel",
					label: () => "背景轮播",
				}, Trigger)
			), "dsh-bg-carousel: footer action");

			ctx.effect(() => ctx.slots.inject("shell.overlay", () =>
				ctx.slots.register({
					name: "shell.overlay",
					id: "dsh-bg-carousel",
				}, Panel)
			), "dsh-bg-carousel: overlay panel");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
