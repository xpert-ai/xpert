import type { IUser } from '@xpert-ai/contracts'
import { runWithRequestContext as runWithPluginRequestContext } from '@xpert-ai/plugin-sdk'
import { RequestContext, runWithRequestContext as runWithLegacyRequestContext } from '@xpert-ai/server-core'

export type AgentRequestContextSnapshot = {
    user: IUser | null
    headers: Record<string, string>
}

export function captureAgentRequestContext(input: {
    tenantId?: string | null
    organizationId?: string | null
    language?: string | null
    user?: IUser | null
}): AgentRequestContextSnapshot {
    const user = input.user ?? RequestContext.currentUser() ?? null
    const tenantId = input.tenantId ?? user?.tenantId ?? RequestContext.currentTenantId()

    return {
        user,
        headers: {
            ...(tenantId ? { ['tenant-id']: tenantId } : {}),
            ...(input.organizationId ? { ['organization-id']: input.organizationId } : {}),
            ...(input.language ? { language: input.language } : {})
        }
    }
}

export function streamWithCurrentRequestContext<T>(
    input: {
        tenantId: string
        organizationId?: string | null
        language?: string | null
    },
    createEvents: () => AsyncIterable<T>
): AsyncIterable<T> {
    return streamWithCapturedRequestContext(captureAgentRequestContext(input), createEvents)
}

function streamWithCapturedRequestContext<T>(
    context: AgentRequestContextSnapshot,
    createEvents: () => AsyncIterable<T>
): AsyncIterable<T> {
    let iterator: AsyncIterator<T> | null = null

    return {
        [Symbol.asyncIterator]: () => ({
            next: () =>
                runWithCapturedAgentRequestContext(context, () => {
                    iterator ??= createEvents()[Symbol.asyncIterator]()
                    return iterator.next()
                }),
            return: (value?: unknown) =>
                runWithCapturedAgentRequestContext(context, async () => {
                    if (!iterator?.return) {
                        return {
                            done: true,
                            value: value as T
                        } satisfies IteratorReturnResult<T>
                    }

                    return iterator.return(value as T)
                }),
            throw: (error?: unknown) =>
                runWithCapturedAgentRequestContext(context, async () => {
                    if (!iterator?.throw) {
                        throw error
                    }

                    return iterator.throw(error)
                })
        })
    }
}

export function runWithCapturedAgentRequestContext<T>(
    context: AgentRequestContextSnapshot,
    task: () => T | Promise<T>
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        runWithPluginRequestContext(
            {
                user: context.user ?? undefined,
                headers: context.headers
            },
            {},
            () => {
                return runWithLegacyRequestContext(
                    {
                        user: context.user ?? undefined,
                        headers: context.headers
                    },
                    () => {
                        return Promise.resolve().then(task).then(resolve).catch(reject)
                    }
                )
            }
        )
    })
}
