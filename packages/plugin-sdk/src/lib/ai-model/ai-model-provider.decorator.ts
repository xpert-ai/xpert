import { SetMetadata } from '@nestjs/common'
import path from 'path'


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
  const match = callerLine?.match(/\(([^)]+)\)/) ?? callerLine?.match(/at (\/[^\s]+)/)
  const file = match?.[1]
  const dir = file ? path.dirname(file) : process.cwd()

  return function (target: any) {
    // Ensure NestJS is discoverable
    SetMetadata(AI_MODEL_PROVIDER, provider)(target)
    // Write custom path (does not affect Discovery)
    Reflect.defineMetadata(`${AI_MODEL_PROVIDER}_DIR`, dir, target)
  }
}