/**
 * 上传前置校验（2026-11-03）：选文件时即拦「必被服务端拒」的文件。
 *
 * 判据必须镜像服务端 core/pkg/utils/filecheck.go 的 IsBlockedExtension：
 * 最后一个点之后整段小写比对（Go filepath.Ext 口径——".bashrc" 整段是扩展名）。
 * 前置拦截只是省一次往返/流量，**服务端校验仍是权威**；两侧判据同源
 * （/api/config 的 blockedExtensions 就是 GetBlockedExtensions() 的同一份值）。
 */
export function blockedExtensionOf(
  filename: string,
  blocked: string[] | undefined | null
): string | null {
  if (!blocked || blocked.length === 0) return null
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  const ext = filename.slice(dot).toLowerCase()
  if (ext.length <= 1) return null // 尾点「file.」不算扩展名（Go 侧比对也必不命中）
  for (const raw of blocked) {
    const b = raw.trim().toLowerCase()
    const norm = b.startsWith('.') ? b : `.${b}`
    if (norm === ext) return ext
  }
  return null
}
