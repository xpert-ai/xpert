export interface SandboxExecutionOptions {
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface ResolvedSandboxExecutionOptions {
  timeoutMs: number
  maxOutputBytes: number
}

export const SANDBOX_SHELL_TIMEOUT_LIMITS_SEC = {
  min: 1,
  max: 3600
} as const

export const DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC = 600
export const DEFAULT_SANDBOX_FILE_SEARCH_TIMEOUT_SEC = 120
export const DEFAULT_SANDBOX_FILE_OPERATION_TIMEOUT_SEC = 120

export const DEFAULT_SANDBOX_SHELL_TIMEOUT_MS = DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC * 1000
export const DEFAULT_SANDBOX_FILE_SEARCH_TIMEOUT_MS = DEFAULT_SANDBOX_FILE_SEARCH_TIMEOUT_SEC * 1000
export const DEFAULT_SANDBOX_FILE_OPERATION_TIMEOUT_MS = DEFAULT_SANDBOX_FILE_OPERATION_TIMEOUT_SEC * 1000

export const DEFAULT_SANDBOX_EXECUTION_MAX_OUTPUT_BYTES = 1024 * 1024

export const DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS: Readonly<SandboxExecutionOptions> = {
  timeoutMs: DEFAULT_SANDBOX_SHELL_TIMEOUT_MS,
  maxOutputBytes: DEFAULT_SANDBOX_EXECUTION_MAX_OUTPUT_BYTES
}

export const DEFAULT_SANDBOX_FILE_SEARCH_EXECUTION_OPTIONS: Readonly<SandboxExecutionOptions> = {
  timeoutMs: DEFAULT_SANDBOX_FILE_SEARCH_TIMEOUT_MS,
  maxOutputBytes: DEFAULT_SANDBOX_EXECUTION_MAX_OUTPUT_BYTES
}

export const DEFAULT_SANDBOX_FILE_OPERATION_EXECUTION_OPTIONS: Readonly<SandboxExecutionOptions> = {
  timeoutMs: DEFAULT_SANDBOX_FILE_OPERATION_TIMEOUT_MS,
  maxOutputBytes: DEFAULT_SANDBOX_EXECUTION_MAX_OUTPUT_BYTES
}

export function secondsToMilliseconds(seconds: number): number {
  return Math.trunc(seconds * 1000)
}

export function formatSandboxTimeout(timeoutMs: number): string {
  const timeoutSeconds = timeoutMs / 1000
  const secondsLabel = Number.isInteger(timeoutSeconds)
    ? String(timeoutSeconds)
    : Number(timeoutSeconds.toFixed(3)).toString()
  return `${secondsLabel}s (${timeoutMs}ms)`
}

export function buildSandboxTimeoutMessage(subject: string, timeoutMs: number): string {
  return `${subject} timed out after ${formatSandboxTimeout(timeoutMs)}`
}

export function appendSandboxMessage(output: string, message: string): string {
  return output ? `${output}\n${message}` : message
}

export function resolveSandboxExecutionOptions(
  options?: SandboxExecutionOptions,
  defaults: SandboxExecutionOptions = DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS
): ResolvedSandboxExecutionOptions {
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.trunc(options.timeoutMs)
      : typeof defaults.timeoutMs === 'number' && Number.isFinite(defaults.timeoutMs) && defaults.timeoutMs > 0
        ? Math.trunc(defaults.timeoutMs)
        : DEFAULT_SANDBOX_SHELL_TIMEOUT_MS

  const maxOutputBytes =
    typeof options?.maxOutputBytes === 'number' && Number.isFinite(options.maxOutputBytes) && options.maxOutputBytes > 0
      ? Math.trunc(options.maxOutputBytes)
      : typeof defaults.maxOutputBytes === 'number' &&
          Number.isFinite(defaults.maxOutputBytes) &&
          defaults.maxOutputBytes > 0
        ? Math.trunc(defaults.maxOutputBytes)
        : DEFAULT_SANDBOX_EXECUTION_MAX_OUTPUT_BYTES

  return {
    timeoutMs,
    maxOutputBytes
  }
}
