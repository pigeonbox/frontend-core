/**
 * 用户域类型入口。
 *
 * wire 契约类型已切换到 contracts IDL 生成的 @pigeonbox/contracts
 * (单一真相源,与后端 Go 模型/openapi 同链生成,勿再手写漂移);
 * 此处仅保留纯 UI 表单模型(客户端校验字段,如 confirmPassword)。
 */
import type { user as userContract } from '@pigeonbox/contracts'

/** 用户信息(wire: /user/info、login 载荷 user;role 仅 /user/info 返回) */
export type UserInfo = userContract.UserData

/** 用户存储统计(wire: /user/stats) */
export type UserStats = userContract.UserStats

export interface LoginForm {
  username: string
  password: string
}

export interface RegisterForm {
  username: string
  email: string
  password: string
  confirmPassword: string
  nickname?: string
}
