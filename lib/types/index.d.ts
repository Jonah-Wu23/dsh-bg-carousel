/**
 * @dsh-external/dsh-bg-carousel — host 半（dsh v0.1.2-alpha.1）。
 * 扫描媒体目录（默认 {workspaceRoot}/backgrounds，可在 UI 里改），经 webServer
 * 前缀路由提供 /dsh-bg/img（媒体字节）与 /dsh-bg/api（JSON API）。
 *
 * 服务依赖经 `ctx.inject(['fs','sandboxPolicy','webServer'], …)` 在运行时等齐：
 * 只有 web profile 提供 webServer；装进 headless/base 等 profile 时这里永远
 * 不触发，插件安静待命，而不是把整个 harness 启动判成 "entry did not activate"。
 */
export declare const name = "@dsh-external/dsh-bg-carousel";
export declare const inject: string[];
/** cordis Context 的本插件用到的那一面（vendor/cordis/src）。 */
interface HostContext {
    effect(execute: () => void | (() => void), label?: string): () => void;
    /** 等齐 deps 后再挂子插件；等不到就永不触发（cordis Registry.inject）。 */
    inject(deps: string[], callback: (scope: HostContext) => void): unknown;
    get(name: string): unknown;
}
export declare function apply(ctx: HostContext): void;
export {};
