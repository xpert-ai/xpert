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
  // Support both Unix and Windows paths
  // Windows paths can be: E:\path, E:/path, file:///E:/path
  // Unix paths can be: /Users/path, file:///Users/path
  const match =
    callerLine?.match(/\((file:\/\/\/[^\s)]+)\)/) || // case 1: file:///path... (both Unix and Windows)
    callerLine?.match(/\(([A-Za-z]:[\\\/][^\s)]+)\)/) || // case 2: Windows drive path (E:\path or E:/path)
    callerLine?.match(/\((\/[^\s)]+)\)/) || // case 3: Unix absolute path (/Users/xxx)
    callerLine?.match(/at (file:\/\/\/[^\s]+)/) || // case 4: at file:///... (both Unix and Windows)
    callerLine?.match(/at ([A-Za-z]:[\\\/][^\s]+)/) || // case 5: at Windows drive path
    callerLine?.match(/at (\/[^\s]+)/) // case 6: at Unix absolute path

  let file = match?.[1]

  // remove the file:/// prefix
  if (file?.startsWith('file:///')) {
    file = file.replace('file:///', '')
  } else if (file?.startsWith('file://')) {
    file = file.replace('file://', '')
  }

  // Normalize path separators (handle both \ and / on Windows)
  if (file) {
    file = path.normalize(file)
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