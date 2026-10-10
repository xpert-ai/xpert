import { RuntimeResourceService } from '../agent-plugin/runtime-resource.service'
import { XpertProjectFeatureGuard } from '../xpert-project/guards/project-feature.guard'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectWorkspaceFilesService } from '../xpert-project/services/project-workspace-files.service'
import { XpertWorkspaceFilesService } from '../xpert/xpert-workspace-files.service'
import { XpertProjectService } from '../xpert-project/project.service'
import { XpertProjectTypeService } from '../xpert-project/services/project-type.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandBus } from '@nestjs/cqrs'
import { GetRuntimeCapabilitiesCommand } from '../xpert/runtime-capabilities/get-runtime-capabilities.command'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { GroupComposerService } from './group-composer.service'
import { GroupAccessService } from './group-access.service'
import { GroupParticipant } from './group.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { groupSendSchema } from './group.schema'

const id = '11111111-1111-4111-8111-111111111111'
describe('group Composer scope', () => {
    const published = { getAccessiblePublishedXpert: jest.fn() }
    const resources = { catalog: jest.fn(), resolve: jest.fn(), authorize: jest.fn() }
    const feature = { canActivate: jest.fn() }
    const projectAccess = { assertCanUseXpert: jest.fn() }
    const projectFiles = { list: jest.fn() }
    const assistantFiles = { list: jest.fn() }
    const projects = { findAvailableForXpert: jest.fn() }
    const types = { list: jest.fn() }
    const commands = { execute: jest.fn() }
    const access = { authorize: jest.fn(), assistant: jest.fn() }
    const participants = { findOneBy: jest.fn() }
    const conversations = { findOneByOrFail: jest.fn() }
    const threads = { findOneByOrFail: jest.fn() }
    const messages = { existsBy: jest.fn() }
    const member = Object.assign(new GroupParticipant(), {
        id,
        groupId: 'group',
        subjectId: 'assistant',
        runtimeConversationId: 'private',
        runtimeThreadId: 'thread',
        active: true,
        kind: 'assistant'
    })
    let service: GroupComposerService
    beforeEach(async () => {
        jest.clearAllMocks()
        feature.canActivate.mockResolvedValue(true)
        projectAccess.assertCanUseXpert.mockResolvedValue(undefined)
        participants.findOneBy.mockResolvedValue(member)
        conversations.findOneByOrFail.mockResolvedValue({ id: 'private', projectId: null })
        threads.findOneByOrFail.mockResolvedValue({ status: 'idle' })
        messages.existsBy.mockResolvedValue(false)
        const module = await Test.createTestingModule({
            providers: [
                GroupComposerService,
                { provide: RuntimeResourceService, useValue: resources },
                { provide: XpertProjectFeatureGuard, useValue: feature },
                { provide: XpertProjectAccessService, useValue: projectAccess },
                { provide: XpertProjectWorkspaceFilesService, useValue: projectFiles },
                { provide: XpertWorkspaceFilesService, useValue: assistantFiles },
                { provide: XpertProjectService, useValue: projects },
                { provide: XpertProjectTypeService, useValue: types },
                { provide: GroupAccessService, useValue: access },
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: CommandBus, useValue: commands },
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: unknown) => {
                            if (entity === GroupParticipant) return participants
                            if (entity === ChatConversation) return conversations
                            if (entity === ChatConversationThread) return threads
                            if (entity === ChatMessage) return messages
                            throw new Error('Unexpected entity')
                        }
                    }
                }
            ]
        }).compile()
        service = module.get(GroupComposerService)
    })
    afterEach(() => jest.restoreAllMocks())
    it('dispatches capabilities for the published Assistant with the selected Project scope', async () => {
        const source = {
            id: 'assistant',
            title: 'Published',
            graph: { nodes: [], connections: [] },
            draft: { team: { title: 'Draft' }, nodes: [], connections: [] }
        }
        published.getAccessiblePublishedXpert.mockResolvedValue(source)
        const result = { skills: [], plugins: [], subAgents: [], commands: [] }
        commands.execute.mockResolvedValue(result)
        const project = jest.spyOn(service, 'project').mockResolvedValue(undefined)
        await expect(service.capabilities('assistant', 'project')).resolves.toBe(result)
        expect(project).toHaveBeenCalledWith('assistant', 'project')
        expect(commands.execute).toHaveBeenCalledWith(
            new GetRuntimeCapabilitiesCommand(
                expect.objectContaining({ id: 'assistant', title: 'Published' }),
                'assistant',
                'project'
            )
        )
    })
    it('does not query capabilities when Assistant access is denied', async () => {
        const denied = new Error('assistant access denied')
        published.getAccessiblePublishedXpert.mockRejectedValueOnce(denied)
        await expect(service.capabilities('assistant')).rejects.toBe(denied)
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it('requires group membership and the exact active Assistant binding', async () => {
        await expect(service.member('group', id, 'other-assistant')).rejects.toMatchObject({ status: 403 })
        expect(access.authorize).toHaveBeenCalledWith('group')
        expect(access.assistant).not.toHaveBeenCalled()
        await service.member('group', id, 'assistant')
        expect(access.assistant).toHaveBeenCalledWith('assistant')
        participants.findOneBy.mockResolvedValue(null)
        await expect(service.member('group', id)).rejects.toMatchObject({ status: 403 })
    })
    it('does not project private runtime identifiers in Composer context', async () => {
        expect(await service.context(member)).toEqual({ projectId: null, locked: false, busy: false })
        messages.existsBy.mockResolvedValue(true)
        expect(await service.context(member)).toEqual({ projectId: null, locked: true, busy: false })
    })
    it('rejects a project switch in an existing runtime even while idle', async () => {
        conversations.findOneByOrFail.mockResolvedValue({ id: 'private', projectId: 'project' })
        messages.existsBy.mockResolvedValue(true)
        await expect(service.validate(member, { participantId: id })).rejects.toMatchObject({ status: 409 })
    })
    it('requires canonical existing workspace paths and rejects traversal before listing', async () => {
        const files = jest
            .spyOn(service, 'files')
            .mockResolvedValue([{ filePath: 'a.txt', fullPath: 'docs/a.txt', fileType: 'txt' }])
        const reference = { filePath: 'docs/a.txt', workspacePath: 'docs/a.txt', purpose: 'workspace' as const }
        await expect(service.validate(member, { participantId: id, files: [reference] })).resolves.toBeUndefined()
        expect(files).toHaveBeenCalledWith('assistant', undefined, 'docs', 0)
        files.mockClear()
        await expect(
            service.validate(member, {
                participantId: id,
                files: [{ ...reference, filePath: '../a', workspacePath: '../a' }]
            })
        ).rejects.toMatchObject({ status: 403 })
        expect(files).not.toHaveBeenCalled()
        files.mockResolvedValue([])
        await expect(service.validate(member, { participantId: id, files: [reference] })).rejects.toMatchObject({
            status: 403
        })
    })
    it('accepts typed context but rejects private runtime IDs, arbitrary file URLs and extra provenance', () => {
        const send = { clientMessageId: id, text: 'hello', intent: 'request', recipientIds: [id] }
        expect(
            groupSendSchema.safeParse({
                ...send,
                composer: { participantId: id, projectId: id, runtimeResources: { revision: 0, resources: [] } }
            }).success
        ).toBe(true)
        for (const field of [
            { runtimeConversationId: id },
            { userId: id },
            { files: [{ url: 'https://example.test/file' }] }
        ])
            expect(groupSendSchema.safeParse({ ...send, composer: { participantId: id, ...field } }).success).toBe(
                false
            )
    })
    it('uses the injected resources after Project authorization for catalog, validation and OAuth', async () => {
        const selection = { revision: 1, resources: [] }
        resources.resolve.mockResolvedValue({ selection })
        await service.resourceCatalog('assistant', { projectId: 'project', search: 'skill' })
        expect(resources.catalog).toHaveBeenCalledWith('assistant', { projectId: 'project', search: 'skill' })
        await expect(service.validateResources('assistant', selection, 'project')).resolves.toBe(selection)
        expect(resources.resolve).toHaveBeenCalledWith('assistant', selection, 'project')
        const reference = { projectId: 'project', bindingId: 'binding', version: '1', serverName: 'mcp' }
        await service.authorizeResource('assistant', reference)
        expect(resources.authorize).toHaveBeenCalledWith('assistant', reference)
        expect(projectAccess.assertCanUseXpert).toHaveBeenCalledTimes(3)
        expect(projectAccess.assertCanUseXpert).toHaveBeenCalledWith('project', 'assistant')
    })
    it('blocks resource and Project file operations when Project access is denied', async () => {
        projectAccess.assertCanUseXpert.mockRejectedValue(new Error('Project denied'))
        await expect(service.resourceCatalog('assistant', { projectId: 'project' })).rejects.toThrow('Project denied')
        await expect(service.validateResources('assistant', { revision: 0, resources: [] }, 'project')).rejects.toThrow(
            'Project denied'
        )
        await expect(
            service.authorizeResource('assistant', {
                projectId: 'project',
                bindingId: 'b',
                version: '1',
                serverName: 'mcp'
            })
        ).rejects.toThrow('Project denied')
        await expect(service.files('assistant', 'project')).rejects.toThrow('Project denied')
        expect(resources.catalog).not.toHaveBeenCalled()
        expect(resources.resolve).not.toHaveBeenCalled()
        expect(resources.authorize).not.toHaveBeenCalled()
        expect(projectFiles.list).not.toHaveBeenCalled()
    })
    it('keeps catalog permissions in the service and uses the injected Project providers', async () => {
        const permission = jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(false)
        await expect(service.listProjectTypes('assistant')).rejects.toMatchObject({ status: 403 })
        await expect(service.listProjects({ xpertId: 'assistant' })).rejects.toMatchObject({ status: 403 })
        expect(types.list).not.toHaveBeenCalled()
        expect(projects.findAvailableForXpert).not.toHaveBeenCalled()
        permission.mockReturnValue(true)
        await service.listProjectTypes('assistant')
        await service.listProjects({ xpertId: 'assistant', take: 10 })
        expect(types.list).toHaveBeenCalledWith('assistant')
        expect(projects.findAvailableForXpert).toHaveBeenCalledWith({ xpertId: 'assistant', take: 10 })
    })
    it('routes files to the injected Assistant or Project provider', async () => {
        await service.files('assistant', undefined, 'docs', 0)
        await service.files('assistant', 'project', 'docs', 0)
        expect(assistantFiles.list).toHaveBeenCalledWith('assistant', 'docs', 0)
        expect(projectFiles.list).toHaveBeenCalledWith('project', 'docs', 0)
        expect(projectAccess.assertCanUseXpert).toHaveBeenCalledWith('project', 'assistant')
    })
})
