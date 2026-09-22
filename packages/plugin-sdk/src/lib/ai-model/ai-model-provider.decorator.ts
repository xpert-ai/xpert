import { SetMetadata } from '@nestjs/common'
import path from 'path'
import { fileURLToPath } from 'node:url'
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
  const match =
    callerLine?.match(/\((file:\/\/\/[^\s)]+)\)/) || // case 1: file:///path...
    callerLine?.match(/\((\/[^\s)]+)\)/) || // case 2: (/Users/xxx)
    callerLine?.match(/at (file:\/\/\/[^\s]+)/) || // case 3: at file:///...
    callerLine?.match(/at (\/[^\s]+)/) || // case 4: at /Users/xxx
    // case 5/6: Windows stack frames carry a drive letter, e.g. (C:\proj\src\a.ts:1:2)
    callerLine?.match(/\(([A-Za-z]:[\\/][^\s)]+)\)/) ||
    callerLine?.match(/at ([A-Za-z]:[\\/][^\s]+)/)

  let file = match?.[1]

  // Strip :line:col suffix (e.g. "/path/file.js:37:5" -> "/path/file.js") before
  // converting a file URL, so the position never leaks into the resolved path.
  file = file?.replace(/:\d+:\d+$/, '')

  // Turn the frame's location into a real filesystem path on every platform.
  // `fileURLToPath` drops the leading slash before a Windows drive letter and
  // decodes percent-escapes; a plain `replace('file://', '')` leaves "/C:/...",
  // which is not a valid Windows path.
  if (file?.startsWith('file://')) {
    try {
      file = fileURLToPath(file)
    } catch {
      // Not a path this platform can map (e.g. a POSIX frame observed on Windows);
      // fall back to stripping the scheme so the directory is still usable.
      file = file.replace(/^file:\/\//, '')
    }
  } else if (file) {
    // Decode URL-encoded paths (e.g. Chinese characters: %E9%A1%B9%E7%9B%AE -> 项目)
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