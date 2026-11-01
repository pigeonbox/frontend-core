/**
 * 上传体积两个闸口的判据（2026-10-30）。
 *
 * PigeonBox 有两个**互不相干**的上限，2026-10-30 之前它们从没一起出现在界面上：
 *
 * · 单文件上限（upload.max_file_size）：单个文件的体积上限（分片/直传等整文件通道）
 * · 单次发送**总量**上限（user.user_upload_size）：一次发送（多文件合计）的体积上限，
 *   只约束登录用户（匿名走访客日配额）
 *
 * 配出「总量上限 < 单文件上限」⇒ **超过单文件上限的文件永远发不出去**
 * （先被总量闸拒，报「上传总大小超过限制」）。此时「单文件上限」是个不可达配置，
 * 管理员看到的界面却仍在宣称它有效 ⇒ 必须提示并可一键对齐。
 */

/**
 * 两个闸口是否矛盾：总量上限低于单文件上限。
 *
 * 边界：
 * · 总量上限 0 = 不限 ⇒ 不矛盾（总量闸没开，单文件闸说了算）
 * · 单文件上限 0 = 不限 ⇒ 不矛盾（没有「超过单文件上限」的文件）
 * · 两者相等 ⇒ 不矛盾（刚好允许一个最大文件）
 */
export function uploadCapMismatch(totalCap: number, maxFileSize: number): boolean {
  return totalCap > 0 && maxFileSize > 0 && totalCap < maxFileSize
}

/**
 * 「与单文件上限对齐」的建议值：总量上限 = 单文件上限。
 * 单文件上限不限（0）时无从对齐 ⇒ 返回 0（总量不限，与之相容）。
 */
export function alignedUploadCap(maxFileSize: number): number {
  return maxFileSize > 0 ? maxFileSize : 0
}
