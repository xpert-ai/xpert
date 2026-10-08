jest.mock('@xpert-ai/server-core', () => ({
    ResolveUserOrganizationAccessCommand: jest.requireActual(
        '../../../../server/src/user-organization/commands/resolve-user-organization-access.command'
    ).ResolveUserOrganizationAccessCommand
}))
jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant'),
        getOrganizationId: jest.fn(() => 'org'),
        currentUserId: jest.fn(() => 'user'),
        currentApiPrincipal: () => null,
        getLanguageCode: () => 'en-US'
    }
}))
jest.mock('./bosi-onboarding.service', () => ({ BosiOnboardingService: class {} }))
jest.mock('../assistant-binding.entity', () => ({ AssistantBinding: class AssistantBinding {} }))
jest.mock('../assistant-binding.service', () => ({ AssistantBindingService: class {} }))
jest.mock('../../xpert-template/xpert-template.service', () => ({ XpertTemplateService: class {} }))
jest.mock('../../xpert-template/capabilities/assistant-capability.service', () => ({
    AssistantCapabilityService: class {}
}))
jest.mock('../../xpert-workspace/workspace.service', () => ({ XpertWorkspaceService: class {} }))
jest.mock('../../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../../chat-message/chat-message.entity', () => ({ ChatMessage: class ChatMessage {} }))
jest.mock('../../xpert/xpert.entity', () => ({ Xpert: class Xpert {} }))
jest.mock('../../xpert-agent-execution/agent-execution.entity', () => ({
    XpertAgentExecution: class XpertAgentExecution {}
}))

import { ForbiddenException, ConflictException } from '@nestjs/common'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Subject } from 'rxjs'
import { BosiBootstrapService } from './bosi-bootstrap.service'
import { AssistantBinding } from '../assistant-binding.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { PluginTemplateInstallCommand } from '../../plugin-resource/commands/install-template.command'
import { RunCreateStreamCommand } from '../../ai/commands/run-create-stream.command'
import { XpertAgentExecutionStatusEnum, BosiCapability } from '@xpert-ai/contracts'

function fixture() {
    let binding: AssistantBinding | null = null
    let draft: { id: string; workspaceId: string; publishAt?: Date } | null = null
    let execution: { id: string; status: XpertAgentExecutionStatusEnum } | null = null
    const messages = { findOne: jest.fn(async () => ({ id: 'welcome-ai' })) }
    let locked = false
    const stream = new Subject<MessageEvent>()
    const repo = {
        create: jest.fn((value) => ({ ...value, id: 'binding' })),
        save: jest.fn(async (value) => {
            binding = structuredClone(value)
            return value
        }),
        update: jest.fn(async (_id, value) => {
            binding = { ...binding, ...structuredClone(value) }
            return { affected: 1 }
        })
    }
    const runners: { release: jest.Mock }[] = []
    const database = {
        getRepository: (entity) =>
            entity === AssistantBinding
                ? repo
                : entity === Xpert
                  ? { findOneBy: jest.fn(async () => draft) }
                  : entity === ChatMessage
                    ? messages
                    : { findOne: jest.fn(async () => execution) },
        createQueryRunner: () => {
            const runner = {
                connect: jest.fn(),
                release: jest.fn(),
                query: jest.fn(async (sql: string) => {
                    if (sql.includes('pg_try_advisory_lock')) {
                        if (locked) return [{ locked: false }]
                        locked = true
                        return [{ locked: true }]
                    }
                    locked = false
                    return []
                })
            }
            runners.push(runner)
            return runner
        }
    }
    const bindings = {
        getBinding: jest.fn(async () => (binding ? structuredClone(binding) : null)),
        upsertBinding: jest.fn(async ({ assistantId }) => {
            binding.assistantId = assistantId
        })
    }
    const published = { getAccessiblePublishedXpert: jest.fn(async (id) => ({ id })) }
    const capabilities = {
        setup: jest.fn(async () => ({
            canInstall: true,
            requiredModelFeatures: [],
            optionalCapabilities: [{ key: 'cloud-computer' }, { key: 'desktop-shell' }],
            models: [
                { id: 'p/model', label: 'Model', copilotModel: { copilotId: 'p', model: 'model', modelType: 'llm' } }
            ]
        }))
    }
    const install = jest.fn(async (command: PluginTemplateInstallCommand) => {
        draft = { id: 'assistant', workspaceId: 'workspace' }
        await command.bootstrap.onImported({ id: draft.id })
        draft.publishAt = new Date()
        return { xpert: { id: draft.id } }
    })
    const run = jest.fn(async () => {
        execution = { id: 'welcome-run', status: XpertAgentExecutionStatusEnum.RUNNING }
        return { execution, stream }
    })
    const access = jest.fn(async () => ({ id: 'user' }))
    const execute = jest.fn(async (command) =>
        command instanceof ResolveUserOrganizationAccessCommand
            ? access()
            : command instanceof PluginTemplateInstallCommand
              ? install(command)
              : command instanceof RunCreateStreamCommand
                ? run()
                : { id: 'conversation' }
    )
    const workspaces = {
        workspace: jest.fn(async () => ({ id: 'workspace' })),
        findOne: jest.fn(async () => ({ id: 'workspace' })),
        setMyDefault: jest.fn()
    }
    const service = new BosiBootstrapService(
        database as never,
        bindings as never,
        { getTemplateDetail: jest.fn(async () => ({})) } as never,
        capabilities as never,
        workspaces as never,
        published as never,
        { execute } as never,
        { execute: jest.fn(async () => null) } as never,
        { get: () => ({ workspace: workspaces.workspace }) } as never
    )
    return {
        service,
        access,
        repo,
        bindings,
        capabilities,
        published,
        install,
        run,
        stream,
        messages,
        execute,
        runners,
        workspaces,
        get binding() {
            return binding
        },
        set binding(value) {
            binding = value
        },
        get draft() {
            return draft
        },
        get execution() {
            return execution
        },
        set execution(value) {
            execution = value
        }
    }
}
const choice = { capabilities: [] as [], modelId: 'p/model' }

describe('Bosi bootstrap recovery and ownership', () => {
    beforeEach(() => jest.clearAllMocks())
    it('exposes only client progress while retaining the durable recovery checkpoint', async () => {
        const f = fixture()
        const created = await f.service.create(choice)
        expect(f.binding.desktopBootstrap).toMatchObject({
            version: 1,
            draftId: 'assistant',
            welcomeMessageId: expect.any(String)
        })
        const responses = [created, await f.service.setup(), await f.service.create(choice), await f.service.welcome()]
        responses.push(await f.service.welcome())
        expect(f.binding.desktopBootstrap.welcomeRunId).toBe('welcome-run')
        f.execution.status = XpertAgentExecutionStatusEnum.SUCCESS
        responses.push(await f.service.setup(), await f.service.welcome())
        for (const response of responses) {
            expect(response.progress).toEqual({
                phase: expect.any(String),
                capabilities: [],
                modelId: choice.modelId,
                threadId: created.progress.threadId
            })
        }
        expect(responses.at(-1).progress.phase).toBe('ready')
    })
    it.each<BosiCapability[]>([[], ['cloud-computer'], ['desktop-shell'], ['cloud-computer', 'desktop-shell']])(
        'persists and composes capability combination %j without changing it on repeat',
        async (...capabilities) => {
            const f = fixture()
            await f.service.create({ ...choice, capabilities })
            expect(f.install.mock.calls[0][0].capabilities).toEqual(capabilities)
            await f.service.create({ ...choice, capabilities: [] })
            expect(f.binding.desktopBootstrap.capabilities).toEqual(capabilities)
            expect(f.install).toHaveBeenCalledTimes(1)
        }
    )
    it('reuses existing bindings without changing capabilities or sending a welcome', async () => {
        const f = fixture()
        f.binding = { id: 'old', assistantId: 'existing' } as AssistantBinding
        expect(await f.service.setup()).toEqual({ assistantId: 'existing', progress: null })
        await f.service.create(choice)
        await f.service.welcome()
        expect(f.install).not.toHaveBeenCalled()
        expect(f.run).not.toHaveBeenCalled()
        expect(f.published.getAccessiblePublishedXpert).toHaveBeenCalledWith('existing')
    })
    it('does not convert an inaccessible binding into a new-user state', async () => {
        const f = fixture()
        f.binding = { id: 'old', assistantId: 'existing' } as AssistantBinding
        f.published.getAccessiblePublishedXpert.mockRejectedValue(new ForbiddenException())
        await expect(f.service.setup()).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.install).not.toHaveBeenCalled()
    })
    it('checks organization access through the shared command before reading the binding', async () => {
        const f = fixture()
        f.access.mockResolvedValue(null)
        await expect(f.service.setup()).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.bindings.getBinding).not.toHaveBeenCalled()
        expect(f.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org', userId: 'user' })
            })
        )
        expect(f.repo.save).not.toHaveBeenCalled()
    })
    it('reports a disabled binding instead of silently replacing it', async () => {
        const f = fixture()
        f.binding = { id: 'old', assistantId: 'existing', enabled: false } as AssistantBinding
        await expect(f.service.create(choice)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.install).not.toHaveBeenCalled()
    })
    it('serializes concurrent callers and creates only one Assistant', async () => {
        const f = fixture()
        const results = await Promise.allSettled([f.service.create(choice), f.service.create(choice)])
        expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1)
        const rejected = results.find((value) => value.status === 'rejected')
        expect(rejected.status === 'rejected' && rejected.reason).toBeInstanceOf(ConflictException)
        const repeat = await f.service.create(choice)
        expect(repeat.assistantId).toBe('assistant')
        expect(f.install).toHaveBeenCalledTimes(1)
        expect(f.repo.create).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant', organizationId: 'org', userId: 'user', scope: 'user' })
        )
        for (const runner of f.runners) expect(runner.release).toHaveBeenCalledTimes(1)
    })
    it('resumes the imported draft after installation failed without importing again', async () => {
        const f = fixture()
        f.install.mockImplementationOnce(async (command) => {
            await command.bootstrap.onImported({ id: 'imported' })
            throw new Error('Publish temporarily unavailable')
        })
        await expect(f.service.create(choice)).rejects.toThrow('Publish temporarily unavailable')
        expect(f.binding.desktopBootstrap.draftId).toBe('imported')
        expect(f.binding.desktopBootstrap.phase).toBe('installing')
        expect((await f.service.setup()).progress).toEqual({
            phase: 'installing',
            capabilities: [],
            modelId: choice.modelId,
            threadId: f.binding.desktopBootstrap.threadId
        })
        // The persisted draft lookup resolves after the failed process restarts.
        const repo = { findOneBy: async () => ({ id: 'imported', workspaceId: 'workspace' }) }
        const database = Reflect.get(f.service, 'database')
        const getRepository = database.getRepository
        database.getRepository = (entity) => (entity === Xpert ? repo : getRepository(entity))
        await f.service.create(choice)
        expect(f.install.mock.calls[1][0].bootstrap.resumeXpertId).toBe('imported')
    })
    it('resumes initialization after publication succeeds but binding persistence fails', async () => {
        const f = fixture()
        f.bindings.upsertBinding.mockRejectedValueOnce(new Error('binding unavailable'))
        await expect(f.service.create(choice)).rejects.toThrow('binding unavailable')
        expect(f.draft.publishAt).toBeInstanceOf(Date)
        expect(f.binding.assistantId).toBeUndefined()
        const threadId = f.binding.desktopBootstrap.threadId
        const recovered = await f.service.create(choice)
        expect(f.install.mock.calls[1][0].bootstrap.resumeXpertId).toBe('assistant')
        expect(recovered).toMatchObject({ assistantId: 'assistant', progress: { phase: 'welcome_pending', threadId } })
    })
    it('does not resume into a workspace that differs from the private reservation', async () => {
        const f = fixture()
        f.bindings.upsertBinding.mockRejectedValueOnce(new Error('binding unavailable'))
        await expect(f.service.create(choice)).rejects.toThrow('binding unavailable')
        f.draft.workspaceId = 'shared-workspace'
        await expect(f.service.create(choice)).rejects.toBeInstanceOf(ConflictException)
        expect(f.workspaces.workspace).toHaveBeenCalledTimes(2)
        expect(f.install).toHaveBeenCalledTimes(1)
    })
    it('recovers a saved binding whose progress checkpoint was not advanced', async () => {
        const f = fixture()
        await f.service.create(choice)
        f.binding.desktopBootstrap.phase = 'installing'
        expect((await f.service.setup()).progress.phase).toBe('welcome_pending')
        await f.service.welcome()
        await f.service.welcome()
        expect(f.install).toHaveBeenCalledTimes(1)
        expect(f.run).toHaveBeenCalledTimes(1)
    })
    it('persists a single welcome and recovers a failed execution on the same thread', async () => {
        const f = fixture()
        const initial = await f.service.create(choice)
        const welcomeMessageId = f.binding.desktopBootstrap.welcomeMessageId
        const first = await f.service.welcome()
        const repeat = await f.service.welcome()
        expect(repeat.progress.threadId).toBe(initial.progress.threadId)
        expect(first.progress.phase).toBe('welcome_running')
        expect(f.run).toHaveBeenCalledTimes(1)
        const send = f.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof RunCreateStreamCommand)
        expect(send.runCreate.input).toEqual({
            action: 'send',
            message: {
                clientMessageId: welcomeMessageId,
                input: { input: 'server-ai:BosiStartConversation' }
            }
        })
        f.execution.status = XpertAgentExecutionStatusEnum.ERROR
        await f.service.welcome()
        const last = f.execute.mock.calls
            .map(([command]) => command)
            .filter((command) => command instanceof RunCreateStreamCommand)
            .at(-1)
        expect(last.runCreate.input).toEqual({
            action: 'retry',
            source: { executionId: 'welcome-run', aiMessageId: 'welcome-ai' }
        })
        expect(last.threadId).toBe(initial.progress.threadId)
        f.execution.status = XpertAgentExecutionStatusEnum.SUCCESS
        expect((await f.service.setup()).progress.phase).toBe('ready')
        await f.service.welcome()
        expect(f.run).toHaveBeenCalledTimes(2)
    })
    it('recovers a preflight failure with no AI message using the same welcome thread and client message', async () => {
        const f = fixture()
        const initial = await f.service.create(choice)
        const welcomeMessageId = f.binding.desktopBootstrap.welcomeMessageId
        f.execution = { id: 'failed-preflight', status: XpertAgentExecutionStatusEnum.ERROR }
        f.messages.findOne.mockResolvedValue(null)
        await f.service.welcome()
        const command = f.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof RunCreateStreamCommand)
        expect(command.threadId).toBe(initial.progress.threadId)
        expect(command.runCreate.input).toEqual({
            action: 'send',
            message: {
                clientMessageId: welcomeMessageId,
                input: { input: 'server-ai:BosiStartConversation' }
            }
        })
        expect(f.messages.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: 'org',
                createdInThreadId: initial.progress.threadId,
                executionId: 'failed-preflight',
                role: 'ai'
            },
            select: ['id']
        })
        await f.service.welcome()
        expect(f.run).toHaveBeenCalledTimes(1)
        expect(f.install).toHaveBeenCalledTimes(1)
        f.execution.status = XpertAgentExecutionStatusEnum.SUCCESS
        await f.service.welcome()
        expect(f.run).toHaveBeenCalledTimes(1)
        expect(f.binding.desktopBootstrap.phase).toBe('ready')
    })
    it('rejects unavailable models before writing a binding', async () => {
        const f = fixture()
        await expect(f.service.create({ ...choice, modelId: 'missing' })).rejects.toThrow()
        expect(f.repo.save).not.toHaveBeenCalled()
        expect(f.install).not.toHaveBeenCalled()
    })
    it('requires the entire tenant, organization and user scope', async () => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValueOnce(null)
        await expect(fixture().service.setup()).rejects.toBeInstanceOf(ForbiddenException)
    })
})
