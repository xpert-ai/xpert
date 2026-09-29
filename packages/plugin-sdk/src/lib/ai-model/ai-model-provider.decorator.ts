import { SetMetadata } from '@nestjs/common'
import path from 'path'
import { STRATEGY_META_KEY } from '../types'


export const AI_MODEL_PROVIDER = 'AI_MODEL_PROVIDER'

export function AIModelProviderStrategy(provider: string) {
  const err = new Error()
  const stack = err.stack?.split('\n') ?? []

  // Find the current decorator function's position on the stack.
  const decoratorIndex = stack.findIndex((line) =>
    line.includes('AIModelProviderStrategy')
  )

  // The line that calls the decorator (the next line)
  const callerLine = stack[decoratorIndex + 1]

  // Extract the file path
  // [local-patch 2026-09-25] Windows 兼容：原正则只认 POSIX 路径。
  // 在 Windows 上栈帧形如 `at file:///D:/a/b.js:1:2` 或 `at f (D:\\a\\b.js:1:2)`，
  // 原实现会取不到路径并回落到 process.cwd()，导致 join(dir, `${name}.yaml`) 指向错误位置、
  // provider schema 读成空对象（表现为 /api/copilot/providers 返回 [{}]）。
  const match =
    callerLine?.match(/\((file:\/\/\/[^\s)]+)\)/) || // case 1: file:///path...
    callerLine?.match(/\(([A-Za-z]:[\\/][^\s)]+)\)/) || // case 1b: (D:\dir\file.js:1:2)
    callerLine?.match(/\((\/[^\s)]+)\)/) || // case 2: (/Users/xxx)
    callerLine?.match(/at (file:\/\/\/[^\s]+)/) || // case 3: at file:///...
    callerLine?.match(/at ([A-Za-z]:[\\/][^\s]+)/) || // case 3b: at D:\dir\file.js:1:2
    callerLine?.match(/at (\/[^\s]+)/) // case 4: at /Users/xxx

  // [local-patch 2026-09-25] 最坏情况下退化为直接取栈行，避免回落 process.cwd()
  let file = match?.[1] ?? callerLine?.trim().replace(/^at\s+/, '')

  if (file) {
    // remove the file:// or file:/// prefix
    file = file.replace(/^file:\/\//, '')
    // [local-patch 2026-09-25] Windows: "/D:/a/b.js" -> "D:/a/b.js"（否则 path.join 会拼出非法路径）
    file = file.replace(/^\/+([A-Za-z]:)/, '$1')
    // Strip :line:col suffix (e.g. "D:/a/b.js:37:5" -> "D:/a/b.js")
    file = file.replace(/:\d+:\d+$/, '')
  }

  // Decode URL-encoded paths (e.g. Chinese characters: %E9%A1%B9%E7%9B%AE -> 项目)
  if (file) {
    try {
      file = decodeURIComponent(file)
    } catch {
      // keep as-is if decode fails
    }
  }

  const dir = file ? path.dirname(file) : process.cwd()

  return function (target: any) {
    SetMetadata(STRATEGY_META_KEY, AI_MODEL_PROVIDER)(target)
    // Ensure NestJS is discoverable
    SetMetadata(AI_MODEL_PROVIDER, provider)(target)
    // Write custom path (does not affect Discovery)
    Reflect.defineMetadata(`${AI_MODEL_PROVIDER}_DIR`, dir, target)
  }
}