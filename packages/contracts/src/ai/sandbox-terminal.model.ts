export const SANDBOX_TERMINAL_NAMESPACE = 'sandbox-terminal' as const

export enum SandboxTerminalClientEvent {
  Open = 'open',
  Input = 'input',
  Resize = 'resize',
  Close = 'close'
}

export enum SandboxTerminalServerEvent {
  Opened = 'opened',
  Output = 'output',
  Exit = 'exit',
  Error = 'error',
  Closed = 'closed'
}

export enum SandboxTerminalClosedReason {
  ClientClosed = 'client_closed',
  Error = 'error',
  OpenFailed = 'open_failed',
  ProcessExited = 'process_exited',
  SocketDisconnected = 'socket_disconnected',
  UnsupportedProvider = 'unsupported_provider'
}

export enum SandboxTerminalErrorCode {
  CloseFailed = 'close_failed',
  ConversationNotFound = 'conversation_not_found',
  ConversationRequired = 'conversation_required',
  InputFailed = 'input_failed',
  OpenFailed = 'open_failed',
  ProviderUnavailable = 'provider_unavailable',
  ResizeFailed = 'resize_failed',
  SandboxDisabled = 'sandbox_disabled',
  SessionNotFound = 'session_not_found',
  UnsupportedProvider = 'unsupported_provider'
}

export type SandboxTerminalDimensions = {
  cols: number
  rows: number
}

export type SandboxTerminalOpenRequest = SandboxTerminalDimensions & {
  conversationId: string
  projectId?: string | null
  requestId: string
}

export type SandboxTerminalInputRequest = {
  data: string
  sessionId: string
}

export type SandboxTerminalResizeRequest = SandboxTerminalDimensions & {
  sessionId: string
}

export type SandboxTerminalCloseRequest = {
  sessionId: string
}

export type SandboxTerminalOpenedEvent = {
  provider: string
  requestId: string
  sessionId: string
  workingDirectory: string
}

export type SandboxTerminalOutputEvent = {
  data: string
  sessionId: string
}

export type SandboxTerminalExitEvent = {
  exitCode: number | null
  sessionId: string
  signal?: number | null
}

export type SandboxTerminalErrorEvent = {
  code: SandboxTerminalErrorCode
  message: string
  requestId?: string
  sessionId?: string
}

export type SandboxTerminalClosedEvent = {
  reason: SandboxTerminalClosedReason
  requestId?: string
  sessionId?: string
}

export type SandboxTerminalClientMessage =
  | {
      event: SandboxTerminalClientEvent.Open
      data: SandboxTerminalOpenRequest
    }
  | {
      event: SandboxTerminalClientEvent.Input
      data: SandboxTerminalInputRequest
    }
  | {
      event: SandboxTerminalClientEvent.Resize
      data: SandboxTerminalResizeRequest
    }
  | {
      event: SandboxTerminalClientEvent.Close
      data: SandboxTerminalCloseRequest
    }

export type SandboxTerminalServerMessage =
  | {
      event: SandboxTerminalServerEvent.Opened
      data: SandboxTerminalOpenedEvent
    }
  | {
      event: SandboxTerminalServerEvent.Output
      data: SandboxTerminalOutputEvent
    }
  | {
      event: SandboxTerminalServerEvent.Exit
      data: SandboxTerminalExitEvent
    }
  | {
      event: SandboxTerminalServerEvent.Error
      data: SandboxTerminalErrorEvent
    }
  | {
      event: SandboxTerminalServerEvent.Closed
      data: SandboxTerminalClosedEvent
    }
