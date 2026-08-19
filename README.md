# dsh-bg-carousel

DeepSeek Harness 背景轮播插件：把工作区 `backgrounds` 目录里的图片作为背景，自动轮播。

混合型插件（hybrid）：宿主端提供 `/dsh-bg/api` JSON API，客户端在侧边栏底部注册「🖼 背景」入口，打开控制面板。

## 功能

- 自动扫描 `{workspaceRoot}/backgrounds`（或 `{workspaceRoot}/workspace/backgrounds`）目录下的图片（jpg / png / webp / gif / bmp / svg）
- 侧边栏「🖼 背景」按钮打开面板：缩略图预览、点击切换、自动轮播开关、轮播间隔设置（2–120 秒）
- 背景以 CSS `body::before` 全屏覆盖方式渲染，半透明遮罩保证界面可读性
- 图片经宿主 API 以 base64 data URL 下发，无需额外静态资源路由

## 安装

插件依赖 dsh 宿主环境（`fs` / `sandboxPolicy` / `webServer` 服务与 `dsh-client-ui-slots` 插槽）。把本仓库放入 dsh 的 `plugins/` 目录，然后在宿主中用插件注入器注册（例如 super-injector 的 `dev_inject_plugin <本目录>`）。

## 使用

1. 把图片复制到工作区的 `backgrounds` 目录
2. 在侧边栏底部点击「🖼 背景」打开面板
3. 点「刷新」加载图片；点击缩略图切换背景，勾选「自动轮播」并按设定间隔循环

## API

宿主在 `{workspaceRoot}` 下挂载 `prefix /dsh-bg/api`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/list` | 返回图片列表与当前设置 |
| POST | `/image` | 按文件名返回 base64 data URL（限制 12 MiB） |
| POST | `/settings` | 更新轮播间隔（1500–120000 ms）与开关 |

## 构建

```bash
DSH_CHECKOUT=<dsh 源码 checkout> bash scripts/build.sh
```

构建依赖 dsh 仓库内的 tsc 与类型包（`cordis`、`@deepseek-ai/dsh-tools` 等），会以 junction/symlink 链接到 `node_modules` 后编译 `src/` → `lib/`。仓库内置的 `lib/` 为已构建产物，可直接使用。

## License

[MIT](LICENSE)
