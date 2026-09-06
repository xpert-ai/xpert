import { ForbiddenException, Injectable, Optional } from '@nestjs/common'
import type { IUser } from '@xpert-ai/contracts'
import {
    ActorTokenRuntimeFactoryCapability,
    RequestContext,
    type ActorTokenAct,
    type ActorTokenApi,
    type ActorTokenResult,
    type ActorTokenRuntimeFactory,
    type ActorTokenRuntimeScope
} from '@xpert-ai/plugin-sdk'
import { OutboundActorTokenProvider } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { RuntimeCapabilityProvider } from '../shared/runtime/runtime-capability-provider.decorator'
import { normalizeOptionalString } from '../shared/runtime/runtime-input'

// The platform holds this stateless factory. Identity, delegation claims and token caches belong to each API.
@Injectable()
@RuntimeCapabilityProvider(ActorTokenRuntimeFactoryCapability)
export class ActorTokenRuntimeService implements ActorTokenRuntimeFactory {
    constructor(@Optional() private readonly provider?: OutboundActorTokenProvider) {}

    createScopedApi(scope: ActorTokenRuntimeScope): ActorTokenApi {
        const tenantId = normalizeOptionalString(scope.tenantId) ?? RequestContext.currentTenantId()
        const organizationId = normalizeOptionalString(scope.organizationId) ?? RequestContext.getOrganizationId()
        const userId = normalizeOptionalString(scope.userId) ?? RequestContext.currentUserId()
        const currentUser = RequestContext.currentUser()
        const user: IUser | null =
            currentUser?.id === userId
                ? structuredClone(currentUser)
                : userId && tenantId
                  ? { id: userId, tenantId }
                  : null
        const claims: ActorTokenAct = Object.fromEntries(
            Object.entries({
                sub: 'xpert_runtime',
                ...scope.act,
                workspace_id: normalizeOptionalString(scope.workspaceId),
                project_id: normalizeOptionalString(scope.projectId),
                xpert_id: normalizeOptionalString(scope.xpertId),
                xpert_name: normalizeOptionalString(scope.xpertName),
                conversation_id: normalizeOptionalString(scope.conversationId),
                thread_id: normalizeOptionalString(scope.threadId),
                agent_key: normalizeOptionalString(scope.agentKey),
                execution_id: normalizeOptionalString(scope.executionId)
            }).filter(([, value]) => value !== undefined)
        )
        let cached: { key: string; expiresAt: number; result: ActorTokenResult } | undefined

        return {
            getToken: async (input = {}) => {
                const callerTenant = RequestContext.currentTenantId()
                const callerUser = RequestContext.currentUserId()
                const callerOrganization = RequestContext.getOrganizationId()
                if (
                    !tenantId ||
                    !userId ||
                    (callerTenant && callerTenant !== tenantId) ||
                    (callerUser && callerUser !== userId) ||
                    ((callerTenant || callerUser) && (callerOrganization ?? null) !== (organizationId ?? null))
                ) {
                    throw new ForbiddenException(t('server-ai:Error.ActorTokenRuntimeIdentityMismatch'))
                }
                if (!this.provider) {
                    throw new Error(t('server-ai:Error.ActorTokenProviderUnavailable'))
                }
                // Request-specific extra claims cannot replace the host-bound identity claims.
                const act = { ...input.act, ...claims }
                const key = JSON.stringify({
                    audience: input.audience ?? null,
                    ttlSeconds: input.ttlSeconds ?? null,
                    act
                })
                if (cached?.key === key && cached.expiresAt - Date.now() > 30_000) return cached.result

                const result = this.provider.mint({
                    user,
                    tenantId,
                    organizationId,
                    audience: input.audience,
                    ttlSeconds: input.ttlSeconds,
                    act
                })
                cached = { key, expiresAt: Date.parse(result.expiresAt), result }
                return result
            }
        }
    }
}
