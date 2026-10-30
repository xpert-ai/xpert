import { ResolveAssistantExecutionIdentityCommand } from './resolve-assistant-execution-identity.command'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { ResolveGroupRuntimeAccessCommand } from '../chat-group/group-runtime-access.command'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ModelExecutionModel, XpertAgentExecutionStatusEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { CommandBus } from '@nestjs/cqrs'
import { IsNull, Repository } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { Copilot } from '../copilot/copilot.entity'
import { ModelAccessService } from '../model-access/model-access.service'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { assistantModelCandidates } from '../xpert/assistant-model-selection.util'
import { executionError } from './execution-errors'
import { ModelExecutionNativeProviderService } from './execution-native-provider.service'
import { snapshotExecutionParameters } from './execution-model-parameters'

export type ExecutionActor = { tenantId: string; organizationId: string; userId: string }

@Injectable()
export class AssistantExecutionPolicyService {
    constructor(
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        private readonly commandBus: CommandBus,
        @InjectRepository(Copilot) private readonly copilots: Repository<Copilot>,
        @InjectRepository(AssistantUserPreference) private readonly preferences: Repository<AssistantUserPreference>,
        @InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>,
        private readonly access: ModelAccessService,
        private readonly published: PublishedXpertAccessService,
        private readonly native: ModelExecutionNativeProviderService
    ) {}

    currentActor(): ExecutionActor {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId || RequestContext.currentApiPrincipal())
            throw executionError('Denied')
        return { tenantId, organizationId, userId }
    }

    async user(actor: ExecutionActor, conversationId?: string) {
        const user = await this.commandBus.execute(new ResolveUserOrganizationAccessCommand(actor))
        if (user) return user
        const identity = await this.commandBus.execute(
            new ResolveAssistantExecutionIdentityCommand(actor, conversationId)
        )
        if (!identity) throw executionError('Denied')
        return identity.user
    }

    async resolve(
        actor: ExecutionActor,
        conversationId: string | null | undefined,
        requireDefault = true,
        resolveDefault = true,
        runtimeAssistant?: { id: string; workspaceId: string }
    ) {
        // TypeORM omits undefined predicates; never turn a missing id into an arbitrary conversation.
        if (typeof conversationId !== 'string' || !conversationId.trim()) throw executionError('ConversationRequired')
        const user = await this.user(actor, conversationId)
        const resolve = async () => {
            let conversation = await this.conversations.findOne({
                where: {
                    id: conversationId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    createdById: actor.userId
                },
                relations: ['xpert']
            })
            conversation ??= await this.conversations.findOne({
                where: {
                    id: conversationId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    purpose: 'group_assistant_runtime'
                },
                relations: ['xpert']
            })
            if (conversation?.purpose === 'group_assistant_runtime') {
                await this.commandBus.execute(
                    new ResolveGroupRuntimeAccessCommand(actor, { type: 'runtime', conversationId })
                )
            }
            if (!conversation || (!runtimeAssistant && !conversation.xpert?.id)) throw executionError('Denied')
            if (runtimeAssistant && !conversation.projectId) throw executionError('Denied')
            const assistant = await this.assistant(actor, runtimeAssistant?.id ?? conversation.xpert.id)
            if (runtimeAssistant && assistant.workspaceId !== runtimeAssistant.workspaceId)
                throw executionError('Denied')
            // Binding-directed execution uses the selected Assistant's configured default, not an unrelated conversation preference.
            if (runtimeAssistant) resolveDefault = false
            const candidates = assistantModelCandidates(assistant)
            const input = {
                ...actor,
                xpertId: assistant.id,
                models: candidates.map(({ model }) => ({
                    copilotId: model.copilotId,
                    copilotModelId: model.model,
                    modelType: model.modelType
                }))
            }
            const availability = await this.access.canUseCatalogModels(input)
            const labels = await this.access.getCatalogModelLabels(input)
            const models: ModelExecutionModel[] = []
            for (let i = 0; i < candidates.length; i++) {
                if (!availability[i] || !labels[i]) continue
                const candidate = candidates[i]
                const copilot = await this.copilots.findOneBy({
                    tenantId: actor.tenantId,
                    id: candidate.model.copilotId
                })
                if (!copilot?.enabled || !copilot.modelProvider?.id) continue
                const metadata = await this.native.metadata(labels[i].provider, candidate.model.model, copilot)
                models.push({
                    id: candidate.id,
                    copilotId: copilot.id,
                    providerScopeId: copilot.modelProvider.id,
                    providerOrganizationId: copilot.modelProvider.organizationId ?? null,
                    provider: labels[i].provider,
                    model: candidate.model.model,
                    modelType: candidate.model.modelType,
                    capabilities: labels[i].capabilities,
                    parameters: snapshotExecutionParameters(candidate.model.options),
                    ...metadata,
                    protocols: ['openai_chat', ...metadata.protocols]
                })
            }
            // Nullable thread IDs must not broaden this lookup to another conversation's model selection.
            const [latest, preference] = await Promise.all([
                resolveDefault && conversation.threadId?.trim()
                    ? this.executions.findOne({
                          where: {
                              tenantId: actor.tenantId,
                              organizationId: actor.organizationId,
                              xpertId: assistant.id,
                              threadId: conversation.threadId,
                              parentId: IsNull(),
                              createdById: actor.userId
                          },
                          order: { createdAt: 'DESC' }
                      })
                    : Promise.resolve(null),
                resolveDefault
                    ? this.preferences.findOneBy({
                          tenantId: actor.tenantId,
                          organizationId: actor.organizationId,
                          userId: actor.userId,
                          assistantId: assistant.id
                      })
                    : Promise.resolve(null)
            ])
            const defaultModelId =
                latest?.metadata?.primaryModelId ??
                preference?.preferences?.modelSelection?.selectedModelId ??
                candidates.find((candidate) => candidate.default)?.id
            // A removed explicit selection needs a new selection; never silently change providers.
            if (requireDefault && !models.some((model) => model.id === defaultModelId)) throw executionError('Model')
            return { user, conversation, assistant, models, defaultModelId }
        }
        return user.type === UserType.COMMUNICATION
            ? runWithCapturedRequestContext(captureRequestContext({ ...actor, user }), resolve)
            : resolve()
    }

    async assistant(actor: ExecutionActor, xpertId: string) {
        if (!xpertId) throw executionError('Denied')
        if (RequestContext.currentUser()?.type === UserType.COMMUNICATION) {
            const identity = await this.commandBus.execute(
                new ResolveAssistantExecutionIdentityCommand(actor, undefined, xpertId)
            )
            if (!identity) throw executionError('Denied')
            return identity.assistant
        }
        const assistant = await this.published.getAccessiblePublishedXpert(xpertId, {
            relations: ['agent', 'agent.copilotModel', 'copilotModel']
        })
        if (
            !assistant?.id ||
            assistant.tenantId !== actor.tenantId ||
            (assistant.organizationId != null && assistant.organizationId !== actor.organizationId)
        )
            throw executionError('Denied')
        return assistant
    }

    /** Automatic CLI launches must never resolve a default from another run's latest selection. */
    async resolveForExecution(actor: ExecutionActor, conversationId: string, executionId: string) {
        if (!executionId) throw executionError('Denied')
        const parent = await this.executions.findOneBy({
            id: executionId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            createdById: actor.userId
        })
        const selection = await this.resolve(actor, conversationId, false, false)
        if (
            !parent ||
            parent.status !== XpertAgentExecutionStatusEnum.RUNNING ||
            parent.xpertId !== selection.assistant.id ||
            !parent.threadId ||
            parent.threadId !== selection.conversation.threadId
        )
            throw executionError('Denied')
        const snapshot = parent.metadata?.primaryModelSnapshot
        const selected = selection.models.find(
            (model) =>
                model.id === parent.metadata?.primaryModelId &&
                !!snapshot &&
                model.copilotId === snapshot.copilotId &&
                model.model === snapshot.model &&
                model.modelType === snapshot.modelType
        )
        if (!selected) throw executionError('Model')
        // The active execution owns its tuning snapshot even if the published Assistant changes mid-run.
        const parameters = snapshotExecutionParameters(snapshot.options)
        return { ...selection, models: [{ ...selected, parameters }], defaultModelId: selected.id, parent }
    }

    async authorize(actor: ExecutionActor, xpertId: string, model: ModelExecutionModel, billableUserId?: string) {
        const resolution = await this.access.assertCanUseModel({
            ...actor,
            xpertId,
            copilotId: model.copilotId,
            copilotModelId: model.model,
            modelType: model.modelType
        })
        if (billableUserId && resolution.billableUserId !== billableUserId) throw executionError('Denied')
        return resolution
    }
}
