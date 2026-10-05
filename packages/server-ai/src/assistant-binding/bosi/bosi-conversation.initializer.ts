// Apply personal defaults once, only for the binding owner. These references never
// grant access; runtime resolution continues to check versions, scope and credentials.
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { AssistantBindingScope, AssistantCode } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AssistantBinding } from '../assistant-binding.entity'
import { parseBosiOnboardingPreferences } from './bosi-onboarding.schema'
import { ConversationInitializerRegistry } from '../../chat-conversation/conversation-initializer.registry'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ConnectorService } from '../../connector/connector.service'
import { RuntimeResourceService } from '../../agent-plugin/runtime-resource.service'
import { Xpert } from '../../xpert/xpert.entity'

@Injectable()
export class BosiConversationInitializer implements OnModuleInit, OnModuleDestroy {
    private unregister?: () => void
    constructor(
        private readonly database: DataSource,
        private readonly modules: ModuleRef
    ) {}

    onModuleInit() {
        this.unregister = this.modules
            .get(ConversationInitializerRegistry, { strict: false })
            .register('bosi-defaults', (conversation) => this.initialize(conversation))
    }
    onModuleDestroy() {
        this.unregister?.()
    }

    async initialize(conversation: ChatConversation) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (
            !tenantId ||
            !organizationId ||
            !userId ||
            !conversation.xpertId ||
            conversation.projectId ||
            conversation.options?.bosiDefaultsApplied ||
            conversation.createdById !== userId ||
            conversation.tenantId !== tenantId ||
            conversation.organizationId !== organizationId
        )
            return
        const binding = await this.database.getRepository(AssistantBinding).findOneBy({
            tenantId,
            organizationId,
            userId,
            assistantId: conversation.xpertId,
            code: AssistantCode.CLAWXPERT,
            scope: AssistantBindingScope.USER
        })
        if (!binding?.desktopOnboarding || binding.enabled === false) return
        const preferences = parseBosiOnboardingPreferences(binding.desktopOnboarding)
        const assistant = await this.database.getRepository(Xpert).findOneBy({
            id: conversation.xpertId,
            tenantId,
            organizationId
        })
        if (assistant?.workspaceId !== preferences.workspaceId) return
        const runtime = this.modules.get(RuntimeResourceService, { strict: false })
        const resources = preferences.packages.map((entry) => entry.resource)
        // Validate selected versions rather than silently substituting newer packages.
        if (resources.length && conversation.options?.runtimeResources === undefined)
            await runtime.resolve(conversation.xpertId, { revision: 0, resources })
        const connectors =
            preferences.connectorIds.length && conversation.options?.runtimeCapabilities === undefined
                ? await this.modules.get(ConnectorService, { strict: false }).runtimeOptions(conversation.xpertId)
                : null
        const connectorIds =
            connectors?.items
                .filter(
                    (item) =>
                        item.runtimeUsage !== 'credential' &&
                        item.authorizationMode === 'shared' &&
                        item.granted &&
                        item.status === 'active' &&
                        preferences.connectorIds.includes(item.bindingId)
                )
                .map((item) => item.bindingId) ?? []
        await this.database.transaction(async (manager) => {
            const current = await manager.findOneOrFail(ChatConversation, {
                where: { id: conversation.id, tenantId, organizationId, createdById: userId },
                lock: { mode: 'pessimistic_write' }
            })
            if (current.options?.bosiDefaultsApplied) {
                conversation.options = current.options
                return
            }
            const options: NonNullable<ChatConversation['options']> = { ...current.options, bosiDefaultsApplied: true }
            options.runtimeResources ??= { revision: 0, resources }
            if (connectorIds.length && options.runtimeCapabilities === undefined)
                options.runtimeCapabilities = {
                    mode: 'allowlist',
                    inheritUnselected: true,
                    skills: { ids: [] },
                    plugins: { nodeKeys: [] },
                    connectors: { bindingIds: connectorIds }
                }
            current.options = options
            await manager.save(current)
            conversation.options = options
        })
    }
}
