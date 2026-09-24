// Shared desktop shell contracts. Runtime validation belongs in desktop-protocol.
export type ShellState =
  | 'pending'
  | 'running'
  | 'cancel_requested'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'rejected'
  | 'unknown'
export interface ShellSettings {
  name: string
  shell: '/bin/zsh' | '/bin/bash'
  cwd: string
  path: string
}
export interface ShellExecInput {
  action: 'exec'
  command: string
  cwd?: string
  timeout_sec?: number
}
export type ShellInput =
  | ShellExecInput
  | { action: 'status'; operationId: string; cursor?: number }
  | { action: 'cancel'; operationId: string }
export interface ShellScope {
  tenantId: string
  organizationId: string
  userId: string
}
export interface ShellDeviceInfo {
  id: string
  name: string
  platform: string
  shell: string
}
export interface ShellChunk {
  seq: number
  stream: 'stdout' | 'stderr'
  data: string
}
export interface ShellResult {
  operationId: string
  executionTarget: 'desktop'
  device: ShellDeviceInfo
  cwd: string
  state: ShellState
  stdout: string
  stderr: string
  exitCode: number | null
  signal?: string
  nextCursor: number
  truncated: boolean
  error?: { code: string; message: string }
}
interface WireBase {
  version: 1
  operationId: string
  connectionEpoch: string
}
export interface ShellExecCommand extends WireBase {
  type: 'exec'
  grantId: string
  argsHash: string
  command: string
  cwd: string
  timeoutSec: number
  deadline: number
}
export interface ShellCancelCommand extends WireBase {
  type: 'cancel'
  reason?: 'cancelled' | 'timed_out'
}
export type ShellCommand = ShellExecCommand | ShellCancelCommand
export interface ShellOutputReport extends WireBase {
  type: 'output'
  state: 'running'
  seq: number
  stream: 'stdout' | 'stderr'
  data: string
}
export interface ShellStateReport extends WireBase {
  type: 'state'
  state: ShellState
  seq: number
  exitCode: number | null
  signal?: string
  truncated: boolean
  errorCode?: string
}
export type ShellReport = ShellOutputReport | ShellStateReport

export interface IDesktopShellDevice extends ShellScope {
  id: string
  installationId: string
  name: string
  platform: string
  shell: string
  cwd: string
  enabled: boolean
  credentialHash: string
  credentialExpiresAt: Date
  connectionEpoch: string | null
  leaseExpiresAt: Date | null
}
export interface IDesktopShellGrant extends ShellScope {
  id: string
  deviceId: string
  assistantId: string
  threadId: string | null
  enabled: boolean
  expiresAt: Date
}
export interface IDesktopShellOperation extends ShellScope {
  id: string
  deviceId: string
  grantId: string
  threadId: string
  runId: string
  toolCallId: string
  argsHash: string
  command: string
  cwd: string
  timeoutSec: number
  deadline: Date
  state: ShellState
  output: ShellChunk[]
  outputBytes: number
  seq: number
  exitCode: number | null
  signal: string | null
  truncated: boolean
  errorCode: string | null
}
