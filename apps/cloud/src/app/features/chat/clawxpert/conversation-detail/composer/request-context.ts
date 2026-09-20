import type { AssistantContextSetPayload } from '../../../../assistant/assistant-chat-client-command'

export type AssistantWorkbenchRequestContext = Omit<AssistantContextSetPayload, 'key' | 'clear'>

export function buildAssistantRequestContext(input: {
  workspaceId: string | null
  xpertId: string | null
  contexts: Record<string, AssistantWorkbenchRequestContext>
}) {
  const env: Record<string, string> = {}
  if (input.workspaceId) {
    env['workspaceId'] = input.workspaceId
  }
  if (input.xpertId) {
    env['xpertId'] = input.xpertId
  }

  const requestContext: Record<string, unknown> = {}
  for (const [key, context] of Object.entries(input.contexts)) {
    Object.assign(env, normalizeAssistantEnv(context.env))
    if (isRecord(context.context)) {
      requestContext[key] = context.context
    }
  }

  if (Object.keys(env).length) {
    requestContext['env'] = env
  }

  return requestContext
}

export function normalizeAssistantWorkbenchContext(
  context: AssistantWorkbenchRequestContext
): AssistantWorkbenchRequestContext {
  const env = normalizeAssistantEnv(context.env)
  const structuredContext = isRecord(context.context) ? context.context : undefined
  return {
    ...(Object.keys(env).length ? { env } : {}),
    ...(structuredContext ? { context: structuredContext } : {})
  }
}

function normalizeAssistantEnv(env: unknown): Record<string, string> {
  if (!isRecord(env)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key, getString(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
