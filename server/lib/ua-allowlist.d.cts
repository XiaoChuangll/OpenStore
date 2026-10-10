// ua-allowlist.cjs 的类型声明（仅供 TS 引用）
export declare const MAX_ENTRIES: number;
export declare function compilePatterns(raw: unknown): RegExp[];
export declare function normalizeAllowUa(raw: unknown): string;
export declare function makeIsAllowedClient(patterns: RegExp[]): (ua?: string | null) => boolean;
