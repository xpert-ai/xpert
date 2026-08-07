import { IUser, IXpertTask, TChatOptions, TScheduleOptions } from '@xpert-ai/contracts'
import type { OutboundActorTokenProvider } from '@xpert-ai/server-core'

/**
 * Scheduled xpert_task runs do not have a browser request, but MCP resources
 * using current_user_oidc still need a delegated user access token. The host
 * mints a short-lived actor token and exposes it through the existing env key
 * used by MCP header templates.
 */
type TaskAutomationContext = {
    source?: string
    assistantCode?: string
    businessAssistantId?: string
    assistantId?: string
    xpertId?: string
    oidcClientId: string
}

type TaskScheduleOptions = TScheduleOptions & {
    automationContext?: TaskAutomationContext
}

type ContextWithEnv = Record<string, unknown> & {
    env?: Record<string, unknown>
}

export function applyScheduledTaskOidcContext(
    task: IXpertTask,
    user: IUser | null | undefined,
    options: TChatOptions,
    actorTokenProvider?: Pick<OutboundActorTokenProvider, 'mint'>
): TChatOptions {
    const automationContext = readAutomationContext(task.options)
    const context: ContextWithEnv = toRecord(options.context)
    const taskEnv = toRecord(context.env)
    const businessAssistantId =
        normalizeString(taskEnv.business_assistant_id) ?? normalizeString(automationContext?.businessAssistantId)
    const existingOidcToken = normalizeString(taskEnv.oidc_token)

    if (existingOidcToken) {
        return {
            ...options,
            context: {
                ...context,
                env: {
                    ...taskEnv,
                    ...(businessAssistantId ? { business_assistant_id: businessAssistantId } : {})
                }
            }
        }
    }

    if (!automationContext) {
        return options
    }

    if (!actorTokenProvider) {
        throw new Error('Outbound actor token provider is required to run scheduled MCP task calls')
    }

    const oidcToken = createScheduledTaskOidcToken(task, user, automationContext, actorTokenProvider)

    return {
        ...options,
        context: {
            ...context,
            env: {
                ...taskEnv,
                oidc_token: oidcToken,
                ...(businessAssistantId ? { business_assistant_id: businessAssistantId } : {})
            }
        }
    }
}

function createScheduledTaskOidcToken(
    task: IXpertTask,
    user: IUser | null | undefined,
    automationContext: TaskAutomationContext,
    actorTokenProvider: Pick<OutboundActorTokenProvider, 'mint'>
): string {
    const tenantId = normalizeString(task.tenantId) ?? normalizeString(user?.tenantId)
    const organizationId = normalizeString(task.organizationId)
    const delegatedUserId = normalizeString(task.createdById) ?? normalizeString(user?.id)
    const taskId = normalizeString(task.id)
    const xpertId = normalizeString(task.xpertId) ?? normalizeString(automationContext?.xpertId)
    const assistantCode = normalizeString(automationContext?.assistantCode)
    const businessAssistantId = normalizeString(automationContext?.businessAssistantId)
    const assistantId = normalizeString(automationContext?.assistantId)
    const automationSource = normalizeString(automationContext?.source)
    const clientId = readTokenClientId(automationContext)

    if (!tenantId || !delegatedUserId || !taskId) {
        throw new Error('scheduled actor token task call is missing tenant, user, or task identity')
    }

    return actorTokenProvider.mint({
        user: user ? { ...user, id: delegatedUserId, tenantId } : ({ id: delegatedUserId, tenantId } as IUser),
        tenantId,
        organizationId,
        audience: readTokenAudience(),
        ttlSeconds: readTokenTtlSeconds(),
        clientId,
        roles: user?.role?.name ? [user.role.name] : undefined,
        act: {
            sub: 'xpert_task',
            task_id: taskId,
            xpert_id: xpertId,
            automation_source: automationSource,
            business_assistant_id: businessAssistantId,
            assistant_code: assistantCode,
            assistant_id: assistantId
        }
    }).token
}

function readTokenAudience(): string | string[] | undefined {
    const raw = readEnv('XPERT_TASK_OIDC_TOKEN_AUDIENCE')
    const audiences = raw
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)

    if (!audiences?.length) {
        return undefined
    }

    return audiences.length === 1 ? audiences[0] : audiences
}

function readTokenClientId(automationContext: TaskAutomationContext): string {
    const sourceClientId = normalizeString(automationContext.oidcClientId)
    if (sourceClientId) {
        return sourceClientId
    }

    throw new Error('automationContext.oidcClientId is required to run scheduled MCP task calls')
}

function readAutomationContext(options: TScheduleOptions | null | undefined): TaskAutomationContext | null {
    const automationContext = (options as TaskScheduleOptions | undefined)?.automationContext
    return automationContext && typeof automationContext === 'object' ? automationContext : null
}

function readTokenTtlSeconds(): number | undefined {
    const rawValue = Number.parseInt(readEnv('XPERT_TASK_OIDC_TOKEN_TTL_SECONDS') ?? '', 10)
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : undefined
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {}
    }
    return { ...(value as Record<string, unknown>) }
}

function readEnv(name: string): string | null {
    return normalizeString(process.env[name])
}

function normalizeString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
