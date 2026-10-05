// The binding is the durable bootstrap record. A database session lock serializes
// installers across API processes; imported drafts and welcome threads survive retries.
import { randomUUID } from 'node:crypto'
import {
    AssistantBindingScope,
    AssistantCode,
    BosiCapability,
    BosiSetup,
    LanguagesEnum,
    XpertAgentExecutionStatusEnum,
    AiProviderRole,
    ICopilot,
    TXpertChatSendRequest,
    TXpertChatRetryRequest
} from '@xpert-ai/contracts'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ModuleRef } from '@nestjs/core'
import type { BosiOnboardingChoice } from '@xpert-ai/contracts'
import { BosiOnboardingService } from './bosi-onboarding.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { DataSource, IsNull } from 'typeorm'
import { t } from 'i18next'
import { AssistantBinding } from '../assistant-binding.entity'
import { AssistantBindingService } from '../assistant-binding.service'
import { BosiSelection, bosiProgressSchema } from './bosi-bootstrap.schema'
import type { BosiBootstrapProgress } from './bosi-bootstrap.schema'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { BOSI_TEMPLATE_ID } from '../../xpert-template/capabilities/bosi-template'
import { XpertWorkspaceService } from '../../xpert-workspace/workspace.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { Xpert } from '../../xpert/xpert.entity'
import { PluginTemplateInstallCommand } from '../../plugin-resource/commands/install-template.command'
import type { PluginResourceInstallResult } from '../../plugin-resource/plugin-resource-installer.service'
import { ThreadCreateCommand } from '../../ai/commands/thread-create.command'
import { RunCreateStreamCommand } from '../../ai/commands/run-create-stream.command'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { CopilotOneByRoleQuery } from '../../copilot/queries/get-one-by-role.query'

/** Whitelist client progress fields; never serialize the persistence checkpoint directly. */
function publicProgress(progress?: BosiBootstrapProgress | null): BosiSetup['progress'] {
    if (!progress) return null
    return {
        phase: progress.phase,
        capabilities: [...progress.capabilities],
        modelId: progress.modelId,
        threadId: progress.threadId
    }
}

@Injectable()
export class BosiBootstrapService {
    private readonly logger = new Logger(BosiBootstrapService.name)
    constructor(
        private readonly database: DataSource,
        private readonly bindings: AssistantBindingService,
        private readonly templates: XpertTemplateService,
        private readonly capabilities: AssistantCapabilityService,
        private readonly workspaces: XpertWorkspaceService,
        private readonly published: PublishedXpertAccessService,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus,
        private readonly modules: ModuleRef
    ) {}

    private scope() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId =
            RequestContext.currentApiPrincipal()?.requestedOrganizationId ?? RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId)
            throw new ForbiddenException(t('server-ai:Error.BosiScopeRequired'))
        return { tenantId, organizationId, userId, code: AssistantCode.CLAWXPERT, scope: AssistantBindingScope.USER }
    }

    private language() {
        return RequestContext.getLanguageCode() as LanguagesEnum
    }

    private async binding() {
        const scope = this.scope()
        const user = await this.commands.execute(new ResolveUserOrganizationAccessCommand(scope))
        if (!user) throw new ForbiddenException(t('server-ai:Error.BosiOrganizationAccessDenied'))
        const binding = await this.bindings.getBinding(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
        if (binding?.enabled === false) throw new ForbiddenException(t('server-ai:Error.BosiBindingUnavailable'))
        if (binding?.desktopBootstrap) binding.desktopBootstrap = bosiProgressSchema.parse(binding.desktopBootstrap)
        if (binding?.assistantId) {
            try {
                await this.published.getAccessiblePublishedXpert(binding.assistantId)
            } catch (error) {
                if (error instanceof NotFoundException)
                    throw new ForbiddenException(t('server-ai:Error.BosiBindingUnavailable'))
                throw error
            }
        }
        return binding
    }

    async setup(selected: BosiCapability[] = []): Promise<BosiSetup> {
        const binding = await this.binding()
        if (binding?.assistantId) {
            if (!binding.desktopBootstrap) return { assistantId: binding.assistantId, progress: null }
            return this.locked(async () => {
                const current = await this.binding()
                await this.reconcileWelcome(current)
                return { assistantId: current.assistantId, progress: publicProgress(current.desktopBootstrap) }
            })
        }
        const template = await this.templates.getTemplateDetail(BOSI_TEMPLATE_ID, this.language())
        const base = await this.capabilities.setup(template, this.language(), [])
        const options = await Promise.all(
            (['cloud-computer', 'desktop-shell'] as const).map(async (key) => {
                if (!base.optionalCapabilities.some((option) => option.key === key))
                    return { key, available: false, reason: t('server-ai:Error.BosiCapabilityUnavailable') }
                const check = await this.capabilities.setup(template, this.language(), [key])
                return { key, available: check.canInstall, reason: check.reason }
            })
        )
        const setup = await this.capabilities.setup(template, this.language(), selected)
        const scope = this.scope()
        const primary = await this.queries.execute<CopilotOneByRoleQuery, ICopilot>(
            new CopilotOneByRoleQuery(scope.tenantId, scope.organizationId, AiProviderRole.Primary, ['copilotModel'])
        )
        setup.defaultModelId = setup.models.find(
            (item) =>
                item.copilotModel.copilotId === primary?.id && item.copilotModel.model === primary?.copilotModel?.model
        )?.id
        return {
            assistantId: null,
            progress: publicProgress(binding?.desktopBootstrap),
            capabilities: options,
            setup
        }
    }

    private async locked<T>(action: () => Promise<T>): Promise<T> {
        const context = this.scope()
        const key = JSON.stringify([context.tenantId, context.organizationId, context.userId])
        const runner = this.database.createQueryRunner()
        let locked = false
        try {
            await runner.connect()
            const rows: { locked: boolean }[] = await runner.query(
                'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
                ['bosi-bootstrap', key]
            )
            locked = rows[0]?.locked === true
            if (!locked) throw new ConflictException(t('server-ai:Error.BosiCreating'))
            return await action()
        } finally {
            try {
                if (locked)
                    await runner.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', ['bosi-bootstrap', key])
            } finally {
                await runner.release()
            }
        }
    }

    async create(input: BosiSelection): Promise<BosiSetup> {
        return this.locked(async () => {
            const repo = this.database.getRepository(AssistantBinding)
            let binding = await this.binding()
            if (binding?.assistantId) {
                await this.reconcileWelcome(binding)
                return { assistantId: binding.assistantId, progress: publicProgress(binding.desktopBootstrap) }
            }
            const template = await this.templates.getTemplateDetail(BOSI_TEMPLATE_ID, this.language())
            const selected = binding?.desktopBootstrap?.capabilities ?? [...new Set(input.capabilities)]
            const modelId = binding?.desktopBootstrap?.modelId ?? input.modelId
            const check = await this.capabilities.setup(template, this.language(), selected)
            const model = check.models.find((item) => item.id === modelId)?.copilotModel
            if (!check.canInstall || !model)
                throw new BadRequestException(check.reason || t('server-ai:Error.TemplateCapabilityModelRequired'))
            if (!binding) binding = await repo.save(repo.create({ ...this.scope() }))
            if (!binding.desktopBootstrap) {
                binding.desktopBootstrap = {
                    version: 1,
                    phase: 'installing',
                    capabilities: selected,
                    modelId,
                    threadId: randomUUID(),
                    welcomeMessageId: randomUUID()
                }
                await repo.save(binding)
            }
            const progress = binding.desktopBootstrap
            const prior = progress.draftId
                ? await this.database.getRepository(Xpert).findOneBy({
                      id: progress.draftId,
                      tenantId: binding.tenantId,
                      organizationId: binding.organizationId
                  })
                : await this.database.getRepository(Xpert).findOneBy({
                      name: `bosi-${binding.id}`,
                      tenantId: binding.tenantId,
                      organizationId: binding.organizationId,
                      createdById: binding.userId
                  })
            if (prior && !progress.draftId) {
                progress.draftId = prior.id
                await repo.update(binding.id, { desktopBootstrap: progress })
            }
            // Revalidate privacy on retries as sharing or ownership may have changed meanwhile.
            const workspace = await this.onboarding.workspace(binding)
            if (prior && prior.workspaceId !== workspace.id)
                throw new ConflictException(t('server-ai:Error.BosiPrivateWorkspaceRequired'))
            // A published Assistant can still need workspace initialization after a failed install.
            // The shared installer resumes that step without publishing or importing again.
            const result = await this.commands.execute<PluginTemplateInstallCommand, PluginResourceInstallResult>(
                new PluginTemplateInstallCommand(
                    BOSI_TEMPLATE_ID,
                    workspace.id,
                    this.language(),
                    {
                        name: `bosi-${binding.id}`,
                        title: 'Bosi',
                        copilotModel: model,
                        workspaceDataScope: 'user'
                    },
                    true,
                    undefined,
                    selected,
                    {
                        resumeXpertId: prior?.id,
                        onImported: async ({ id }) => {
                            progress.draftId = id
                            await repo.update(binding.id, { desktopBootstrap: progress })
                        }
                    }
                )
            )
            const assistantId = result.xpert?.id
            if (!assistantId) throw new BadRequestException(t('server-ai:Error.BosiNotCreated'))
            const latest = await this.binding()
            if (latest?.assistantId && latest.assistantId !== assistantId)
                throw new ConflictException(t('server-ai:Error.BosiBindingChanged'))
            await this.bindings.upsertBinding({
                code: AssistantCode.CLAWXPERT,
                scope: AssistantBindingScope.USER,
                assistantId
            })
            progress.phase = 'welcome_pending'
            await repo.update(binding.id, { desktopBootstrap: progress })
            return { assistantId, progress: publicProgress(progress) }
        })
    }

    async prepareWorkspace() {
        return this.locked(async () => {
            const binding = await this.onboardingBinding()
            const workspace = binding.assistantId
                ? await this.workspaces.findOne(
                      (await this.published.getAccessiblePublishedXpert(binding.assistantId)).workspaceId
                  )
                : await this.onboarding.workspace(binding)
            return { id: workspace.id, name: workspace.name }
        })
    }

    private get onboarding() {
        return this.modules.get(BosiOnboardingService, { strict: false })
    }

    private async onboardingBinding() {
        const existing = await this.binding()
        if (existing) return existing
        const repo = this.database.getRepository(AssistantBinding)
        return repo.save(repo.create(this.scope()))
    }

    onboardingCatalog() {
        return this.locked(async () => this.onboarding.catalog(await this.onboardingBinding()))
    }

    chooseOnboarding(input: BosiOnboardingChoice) {
        return this.locked(async () => this.onboarding.choose(await this.onboardingBinding(), input))
    }

    onboardingConnection(provider: string) {
        return this.locked(async () => this.onboarding.connection(await this.onboardingBinding(), provider))
    }

    resolveOnboardingConnection(target: { workspaceId: string; bindingId: string }) {
        return this.locked(async () => this.onboarding.resolveConnection(await this.onboardingBinding(), target))
    }

    private async reconcileWelcome(binding: AssistantBinding) {
        const progress = binding.desktopBootstrap
        if (!progress || progress.phase === 'ready') return
        if (progress.phase === 'installing') {
            if (!binding.assistantId) return
            // The binding is written only after installation finishes. Recover a crash
            // between saving that binding and advancing the bootstrap checkpoint.
            progress.phase = 'welcome_pending'
        }
        const execution = await this.database.getRepository(XpertAgentExecution).findOne({
            where: {
                threadId: progress.threadId,
                tenantId: binding.tenantId,
                organizationId: binding.organizationId,
                parentId: IsNull()
            },
            order: { createdAt: 'DESC' }
        })
        if (execution) progress.welcomeRunId = execution.id
        if (execution?.status === XpertAgentExecutionStatusEnum.SUCCESS) progress.phase = 'ready'
        else if (
            execution &&
            [
                XpertAgentExecutionStatusEnum.ERROR,
                XpertAgentExecutionStatusEnum.TIMEOUT,
                XpertAgentExecutionStatusEnum.INTERRUPTED
            ].includes(execution.status)
        )
            progress.phase = 'welcome_failed'
        else if (execution) progress.phase = 'welcome_running'
        await this.database.getRepository(AssistantBinding).update(binding.id, { desktopBootstrap: progress })
    }

    private async welcomeInput(
        binding: AssistantBinding
    ): Promise<TXpertChatSendRequest | Omit<TXpertChatRetryRequest, 'conversationId'>> {
        const progress = binding.desktopBootstrap
        // A failed preflight can persist an execution before creating any AI
        // message. Only response retries have a source message/checkpoint.
        const response = progress.welcomeRunId
            ? await this.database.getRepository(ChatMessage).findOne({
                  where: {
                      tenantId: binding.tenantId,
                      organizationId: binding.organizationId,
                      createdInThreadId: progress.threadId,
                      executionId: progress.welcomeRunId,
                      role: 'ai'
                  },
                  select: ['id']
              })
            : null
        return response
            ? { action: 'retry', source: { executionId: progress.welcomeRunId, aiMessageId: response.id } }
            : {
                  action: 'send',
                  message: {
                      clientMessageId: progress.welcomeMessageId,
                      input: { input: t('server-ai:BosiStartConversation') }
                  }
              }
    }

    async welcome(): Promise<BosiSetup> {
        return this.locked(async () => {
            const binding = await this.binding()
            if (!binding?.assistantId) throw new BadRequestException(t('server-ai:Error.BosiNotCreated'))
            await this.reconcileWelcome(binding)
            const progress = binding.desktopBootstrap
            if (!progress || progress.phase === 'ready' || progress.phase === 'welcome_running')
                return { assistantId: binding.assistantId, progress: publicProgress(progress) }
            const repo = this.database.getRepository(AssistantBinding)
            await this.commands.execute(
                new ThreadCreateCommand({
                    thread_id: progress.threadId,
                    assistant_id: binding.assistantId,
                    if_exists: 'do_nothing'
                })
            )
            // Recover an existing run by its dedicated thread before starting another.
            const result = await this.commands.execute(
                new RunCreateStreamCommand(progress.threadId, {
                    assistant_id: binding.assistantId,
                    stream_mode: ['values'],
                    stream_subgraphs: true,
                    on_disconnect: 'continue',
                    multitask_strategy: 'reject',
                    if_not_exists: 'reject',
                    input: await this.welcomeInput(binding)
                })
            )
            progress.phase = 'welcome_running'
            progress.welcomeRunId = result.execution.id
            await repo.update(binding.id, { desktopBootstrap: progress })
            result.stream.subscribe({
                // Derive the result from persisted executions so an old stream cannot
                // overwrite a newer retry's status when callbacks arrive out of order.
                error: () => {
                    void this.reconcileWelcome(binding).catch(() =>
                        this.logger.warn(t('server-ai:Error.BosiWelcomeReconcileFailed'))
                    )
                },
                complete: () => {
                    void this.reconcileWelcome(binding).catch(() =>
                        this.logger.warn(t('server-ai:Error.BosiWelcomeReconcileFailed'))
                    )
                }
            })
            return { assistantId: binding.assistantId, progress: publicProgress(progress) }
        })
    }
}
