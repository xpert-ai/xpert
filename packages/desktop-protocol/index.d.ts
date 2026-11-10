import type {
  ShellState,
  ShellSettings,
  ShellInput,
  ShellCommand,
  ShellReport,
  ShellPlatform
} from '@xpert-ai/contracts'
export * from './audio-capture'

export type {
  ShellState,
  ShellSettings,
  ShellExecInput,
  ShellInput,
  ShellScope,
  ShellDeviceInfo,
  ShellChunk,
  ShellResult,
  ShellExecCommand,
  ShellCancelCommand,
  ShellCommand,
  ShellOutputReport,
  ShellStateReport,
  ShellReport
} from '@xpert-ai/contracts'

export const VERSION: 1
export const NAMESPACE: '/desktop-shell'
export const LIMITS: Readonly<{
  command: number
  chunk: number
  output: number
  result: number
  timeout: number
  maxTimeout: number
  wait: number
  lease: number
  grant: number
  records: number
}>
export const STATES: ShellState[]
export function isId(value: unknown): value is string
export function isFinal(state: string): boolean
export function isShellPlatform(value: unknown): value is ShellPlatform
export function isShellCwd(value: unknown, platform?: string): value is string
export function parseSettings(value: unknown, platform?: string): ShellSettings
export function parseInput(value: unknown): ShellInput
export function parseComputerInfo(value: unknown): import('@xpert-ai/contracts').ShellComputerInfo
export function parseCommand(value: unknown, platform?: string): ShellCommand
export function parseReport(value: unknown): ShellReport

export function parsePreparation(value: unknown): import('@xpert-ai/contracts').ShellPreparationRequest
export function parsePolicy(value: unknown): import('@xpert-ai/contracts').ShellPolicy
