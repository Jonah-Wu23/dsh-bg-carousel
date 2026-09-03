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
