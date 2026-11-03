import { describe, it, expect } from 'vitest'
import { blockedExtensionOf } from '../uploadPreflight'

describe('blockedExtensionOf（禁传扩展名前置判定，镜像 core filecheck.IsBlockedExtension）', () => {
  it('命中黑名单（大小写不敏感）返回规范化扩展名', () => {
    expect(blockedExtensionOf('SETUP.EXE', ['.exe'])).toBe('.exe')
    expect(blockedExtensionOf('run.bat', ['.BAT'])).toBe('.bat')
  })
  it('名单条目不带点也能命中', () => {
    expect(blockedExtensionOf('a.bat', ['bat'])).toBe('.bat')
  })
  it('点文件名（.bashrc）按整段扩展名判——与 Go filepath.Ext 同口径', () => {
    expect(blockedExtensionOf('.bashrc', ['.bashrc'])).toBe('.bashrc')
  })
  it('无扩展名/未命中/空名单/缺名单 返回 null', () => {
    expect(blockedExtensionOf('README', ['.exe'])).toBeNull()
    expect(blockedExtensionOf('a.jpg', ['.exe'])).toBeNull()
    expect(blockedExtensionOf('a.exe', [])).toBeNull()
    expect(blockedExtensionOf('a.exe', undefined)).toBeNull()
    expect(blockedExtensionOf('a.exe', null)).toBeNull()
  })
  it('只认最后一个点之后（多段扩展名镜像 filepath.Ext）', () => {
    expect(blockedExtensionOf('backup.tar.exe', ['.exe'])).toBe('.exe')
    expect(blockedExtensionOf('x.exe.jpg', ['.exe'])).toBeNull()
  })
  it('尾点不算扩展名', () => {
    expect(blockedExtensionOf('file.', ['.'])).toBeNull()
    expect(blockedExtensionOf('file.', ['.exe'])).toBeNull()
  })
})
