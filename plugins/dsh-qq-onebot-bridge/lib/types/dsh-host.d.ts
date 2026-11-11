// 宿主包的本地类型补丁：这些包在运行时由 DSH 提供，但当前安装没有 .d.ts。
// 只声明 bridge.js 实际用到的入口，避免 any 扩散到业务模块。

declare module '@deepseek-ai/dsh-llm' {
  export function createUserMessage(...args: any[]): any
}

declare module '@deepseek-ai/dsh-session' {
  export function SessionId(value: string): any
  export type SessionId = any
}

declare module '@deepseek-ai/dsh-tools' {
  export function defineTool(definition: any): any
}
