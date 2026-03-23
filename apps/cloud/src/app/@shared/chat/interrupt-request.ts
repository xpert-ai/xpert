import { TInterruptCommand, TXpertChatInterruptPatch, TXpertChatResumeDecision } from '../../@core'

export function extractInterruptPatch(command?: TInterruptCommand | null): TXpertChatInterruptPatch | undefined {
  if (!command) {
    return undefined
  }

  const patch: TXpertChatInterruptPatch = {}
  if (command.toolCalls?.length) {
    patch.toolCalls = command.toolCalls
  }
  if (command.update !== undefined) {
    patch.update = command.update
  }
  if (command.agentKey) {
    patch.agentKey = command.agentKey
  }

  return Object.keys(patch).length ? patch : undefined
}

export function buildResumeDecision(
  type: TXpertChatResumeDecision['type'],
  command?: TInterruptCommand | null
): TXpertChatResumeDecision {
  return {
    type,
    ...(command?.resume !== undefined ? { payload: command.resume } : {})
  }
}
