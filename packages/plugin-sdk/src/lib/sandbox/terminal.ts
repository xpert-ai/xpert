import type { TSandboxConfigurable } from '@xpert-ai/contracts'
import type { MaybePromise } from './protocol'

export type SandboxTerminalExit = {
  exitCode: number | null
  signal?: number | null
}

export type SandboxTerminalOpenOptions = {
  cols: number
  rows: number
  onExit: (event: SandboxTerminalExit) => void
  onOutput: (data: string) => void
}

export interface SandboxTerminalSession {
  close(): MaybePromise<void>
  resize(cols: number, rows: number): MaybePromise<void>
  write(data: string): MaybePromise<void>
}

export interface SandboxTerminalAdapter {
  open(options: SandboxTerminalOpenOptions): MaybePromise<SandboxTerminalSession>
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export function isSandboxTerminalAdapter(value: unknown): value is SandboxTerminalAdapter {
  return isObjectLike(value) && typeof Reflect.get(value, 'open') === 'function'
}

export function resolveSandboxTerminalAdapter(
  sandbox: TSandboxConfigurable | SandboxTerminalAdapter | null | undefined | unknown
): SandboxTerminalAdapter | null {
  if (!isObjectLike(sandbox)) {
    return null
  }

  const candidate = Reflect.has(sandbox, 'backend') ? Reflect.get(sandbox, 'backend') : sandbox
  return isSandboxTerminalAdapter(candidate) ? candidate : null
}
