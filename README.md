# dsh-bg-carousel

DeepSeek Harness 背景轮播插件（标准 dsh bundle）：把工作区 `backgrounds` 目录里的图片作为背景，自动轮播。

混合型插件（hybrid）：宿主端提供 `/dsh-bg/api` JSON API，客户端在侧边栏底部注册「🖼 背景」入口，打开控制面板。

## 功能

- 自动扫描 `{workspaceRoot}/backgrounds`（或 `{workspaceRoot}/workspace/backgrounds`）目录下的图片（jpg / png / webp / gif / bmp / svg）
- 侧边栏「🖼 背景」按钮打开面板：缩略图预览、点击切换、自动轮播开关、轮播间隔设置（2–120 秒）
- 背景以 CSS `body::before` 全屏覆盖方式渲染，半透明遮罩保证界面可读性
- 图片经宿主 API 以 base64 data URL 下发，无需额外静态资源路由

## 安装（标准 bundle，一键 `dsh plugin add`）

本插件是标准 dsh bundle（package.json 声明 `dsh.bundle.patch`），安装后由 profile 自动归入 bundle 层，无需任何手动注入。

方式一：GitHub Release tgz（推荐）

```bash
dsh plugin add https://github.com/Jonah-Wu23/dsh-bg-carousel/releases/download/v0.1.0/dsh-bg-carousel-0.1.0.tgz
```

方式二：git 源

```bash
dsh plugin add github:Jonah-Wu23/dsh-bg-carousel
```

方式三：本地目录 / tgz

```bash
dsh plugin add ./dsh-bg-carousel-0.1.0.tgz
# 或
dsh plugin add /path/to/dsh-bg-carousel
```

`dsh plugin add` 需要 `pnpm` 在 PATH 中。安装后重启 dsh 即生效；`dsh plugin rm @dsh-external/dsh-bg-carousel` 可卸载。

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

## 发布与构建

- 打 tag `v*` 自动触发 GitHub Actions 构建 `dsh-bg-carousel-<version>.tgz` 并附加到 Release（见 `.github/workflows/release.yml`）
- 手动构建：`npm pack`（`files` 已包含 `lib/`、`cordis.patch.yml`、README、LICENSE）
- 本地重编源码：`DSH_CHECKOUT=<dsh 源码 checkout> bash scripts/build.sh`（依赖 dsh 仓库内的 tsc 与类型包；仓库内置 `lib/` 为已构建产物，可直接使用）

## License

[MIT](LICENSE)
