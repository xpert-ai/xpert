import type { ShellState, ShellSettings, ShellInput, ShellCommand, ShellReport } from '@xpert-ai/contracts'

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
export function parseSettings(value: unknown): ShellSettings
export function parseInput(value: unknown): ShellInput
export function parseCommand(value: unknown): ShellCommand
export function parseReport(value: unknown): ShellReport
