import type { IUser } from '@xpert-ai/contracts'
import { runWithRequestContext as runWithPluginRequestContext } from '@xpert-ai/plugin-sdk'
import { RequestContext, runWithRequestContext as runWithLegacyRequestContext } from '@xpert-ai/server-core'

export type RequestContextSnapshot = {
    user: IUser | null
    headers: Record<string, string>
}

export function captureRequestContext(input: {
    tenantId?: string | null
    organizationId?: string | null
    language?: string | null
    user?: IUser | null
    headers?: Record<string, string | null | undefined>
}): RequestContextSnapshot {
    const user = input.user ?? RequestContext.currentUser() ?? null
    const tenantId =
        input.tenantId ?? input.headers?.['tenant-id'] ?? user?.tenantId ?? RequestContext.currentTenantId()
    const organizationId = input.organizationId ?? input.headers?.['organization-id']
    const language = input.language ?? input.headers?.language
    const headers = Object.fromEntries(
        Object.entries(input.headers ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )

    return {
        user,
        headers: {
            ...headers,
            ...(tenantId ? { ['tenant-id']: tenantId } : {}),
            ...(organizationId ? { ['organization-id']: organizationId } : {}),
            ...(language ? { language } : {})
        }
    }
}

export function runWithCapturedRequestContext<T>(
    context: RequestContextSnapshot,
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
