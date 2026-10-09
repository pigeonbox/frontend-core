// NOTE: @/api/* 和 @/types/user 的真实模块已存在且有完整类型，
// 不再在此用 any 声明覆盖（避免降级类型检查）。仅保留无真实文件的类型声明。
// （原 @/types/share 垫片已删除：真实模块 src/types/share.ts 已建立，
//   ambient declare module 会遮蔽真实文件——教训见 2026-10-06 W1）

declare module 'swagger-ui-dist/swagger-ui-es-bundle' {
  export const SwaggerUIBundle: any
  export const SwaggerUIStandalonePreset: any
}

declare module 'swagger-ui-dist/swagger-ui.css' {
  const css: string
  export default css
}