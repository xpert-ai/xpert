jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentApiPrincipal: jest.fn() } }))
jest.mock('../../../artifacts/artifacts.service', () => ({ ArtifactsService: class {} }))
jest.mock('../../conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../../../chat-message/chat-message.service', () => ({ ChatMessageService: class {} }))
jest.mock('../../../ai/public-xpert-principal', () => ({ assertPublicXpertSessionConversationAccess: jest.fn() }))
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ApiKeyBindingType, SecretTokenBindingType, type IApiPrincipal } from '@xpert-ai/contracts'
import { Test, type TestingModule } from '@nestjs/testing'
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs'
import { ForbiddenException, NotFoundException, GoneException, Injectable, Module } from '@nestjs/common'
import { ReadConversationArtifactHandler } from './read-conversation-artifact.handler'
import { ReadConversationArtifactCommand } from '../read-conversation-artifact.command'
import { ChatConversationService } from '../../conversation.service'
import { ChatMessageService } from '../../../chat-message/chat-message.service'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { assertPublicXpertSessionConversationAccess } from '../../../ai/public-xpert-principal'

@Injectable()
class ArtifactConsumer {
    constructor(private readonly commandBus: CommandBus) {}

    read(conversationId: string, ref: ReadConversationArtifactCommand['ref']) {
        return this.commandBus.execute(new ReadConversationArtifactCommand(conversationId, ref))
    }
}

@Module({ imports: [CqrsModule], providers: [ArtifactConsumer] })
class ConsumerModule {}

@Module({})
class ArtifactOwnerModule {}

const ref = { artifactId: 'artifact', artifactVersionId: 'saved-v1' }
const output = {
    id: 'delivery',
    kind: 'file',
    title: 'index.html',
    origin: 'tool',
    resource: { type: 'artifact', ...ref }
}
const message = (outputs: unknown[] = [output]) => ({
    id: 'message',
    content: '',
    taskSummary: { version: 1, outputs }
})
describe('conversation artifact access through CommandBus', () => {
    const assertAccess = jest.fn(),
        findAll = jest.fn(),
        resolve = jest.fn()
    const publicAccess = jest.mocked(assertPublicXpertSessionConversationAccess)
    let consumer: ArtifactConsumer
    let module: TestingModule
    beforeEach(async () => {
        jest.resetAllMocks()
        assertAccess.mockResolvedValue({
            id: 'conversation',
            tenantId: 'tenant',
            organizationId: 'org',
            xpertId: 'assistant'
        })
        findAll.mockResolvedValue({ items: [message()] })
        resolve.mockResolvedValue({
            buffer: Buffer.from('saved'),
            mimeType: 'text/html',
            fileName: 'index.html',
            artifact: { pluginName: 'platform.file-activity', resourceType: 'file-change' }
        })
        module = await Test.createTestingModule({
            imports: [
                ConsumerModule,
                {
                    module: ArtifactOwnerModule,
                    imports: [CqrsModule],
                    providers: [
                        ReadConversationArtifactHandler,
                        { provide: ChatConversationService, useValue: { assertAccess } },
                        { provide: ChatMessageService, useValue: { findAllInOrganizationOrTenant: findAll } },
                        { provide: ArtifactsService, useValue: { resolveForManagementAccess: resolve } }
                    ]
                }
            ]
        }).compile()
        await module.init()
        consumer = module.get(ArtifactConsumer)
    })
    afterEach(async () => {
        await module.close()
    })
    it('requires conversation and public Assistant scope, then reauthorizes the exact artifact version', async () => {
        expect((await consumer.read('conversation', ref)).buffer.toString()).toBe('saved')
        expect(assertAccess).toHaveBeenCalledWith('conversation', 'read')
        expect(publicAccess).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'conversation', xpertId: 'assistant' }),
            expect.any(QueryBus)
        )
        expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: 'conversation' } }))
        expect(resolve).toHaveBeenCalledWith(ref)
        await consumer.read('conversation', ref)
        expect(resolve).toHaveBeenCalledTimes(2)
    })
    it('stops at the rejected conversation access boundary', async () => {
        assertAccess.mockRejectedValue(new ForbiddenException())
        await expect(consumer.read('conversation', ref)).rejects.toBeInstanceOf(ForbiddenException)
        expect(findAll).not.toHaveBeenCalled()
        expect(resolve).not.toHaveBeenCalled()
    })
    it('rejects a client secret for another published Assistant', async () => {
        publicAccess.mockRejectedValue(new ForbiddenException())
        await expect(consumer.read('conversation', ref)).rejects.toBeInstanceOf(ForbiddenException)
        expect(resolve).not.toHaveBeenCalled()
    })
    it.each([
        SecretTokenBindingType.PUBLIC_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.USER_XPERT
    ])('accepts a correctly scoped %s session after conversation and artifact authorization', async (binding) => {
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({
            id: 'user',
            tenantId: 'tenant',
            principalType: 'client_secret',
            clientSecretBindingType: binding,
            requestedOrganizationId: 'org',
            resourceScope: { kind: 'assistant', xpertId: 'assistant' },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'assistant',
                tenantId: 'tenant',
                organizationId: 'org'
            }
        } as IApiPrincipal)
        expect((await consumer.read('conversation', ref)).buffer.toString()).toBe('saved')
        expect(publicAccess).toHaveBeenCalled()
        expect(resolve).toHaveBeenCalledWith(ref)
    })
    it.each([
        { tenantId: 'other' },
        { requestedOrganizationId: 'other' },
        {
            resourceScope: { kind: 'assistant', xpertId: 'other' },
            apiKey: { type: ApiKeyBindingType.ASSISTANT, entityId: 'other', tenantId: 'tenant', organizationId: 'org' }
        }
    ])('rejects delegated credentials outside their tenant/organization/Assistant binding: %p', async (override) => {
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({
            id: 'user',
            tenantId: 'tenant',
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            requestedOrganizationId: 'org',
            resourceScope: { kind: 'assistant', xpertId: 'assistant' },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'assistant',
                tenantId: 'tenant',
                organizationId: 'org'
            },
            ...override
        } as IApiPrincipal)
        await expect(consumer.read('conversation', ref)).rejects.toBeInstanceOf(ForbiddenException)
        expect(findAll).not.toHaveBeenCalled()
        expect(resolve).not.toHaveBeenCalled()
    })
    it('does not let an accessible conversation read unreferenced artifacts or different versions', async () => {
        await expect(consumer.read('conversation', { ...ref, artifactVersionId: 'latest' })).rejects.toBeInstanceOf(
            NotFoundException
        )
        await expect(consumer.read('conversation', { ...ref, artifactId: 'unrelated' })).rejects.toBeInstanceOf(
            NotFoundException
        )
        expect(resolve).not.toHaveBeenCalled()
    })
    it.each(['pending', 'running', 'failed'])('rejects %s deliveries before reading any bytes', async (status) => {
        findAll.mockResolvedValue({ items: [message([{ ...output, status }])] })
        await expect(consumer.read('conversation', ref)).rejects.toBeInstanceOf(NotFoundException)
        expect(resolve).not.toHaveBeenCalled()
    })
    it('requires an exact saved version instead of resolving a latest or workspace reference', async () => {
        findAll.mockResolvedValue({
            items: [
                message([
                    { ...output, resource: { type: 'artifact', artifactId: ref.artifactId } },
                    { ...output, id: 'workspace', resource: { type: 'workspace_file', path: 'index.html' } }
                ])
            ]
        })
        await expect(consumer.read('conversation', ref)).rejects.toBeInstanceOf(NotFoundException)
        expect(resolve).not.toHaveBeenCalled()
    })
    it('propagates revoked ownership and checksum errors without falling back to workspace bytes', async () => {
        for (const error of [new NotFoundException(), new GoneException()]) {
            resolve.mockRejectedValueOnce(error)
            await expect(consumer.read('conversation', ref)).rejects.toBe(error)
        }
    })
    it('finds older deliveries beyond the first page', async () => {
        findAll.mockResolvedValueOnce({ items: Array.from({ length: 100 }, () => message([])) })
        await consumer.read('conversation', ref)
        expect(findAll).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 100, take: 100 }))
    })
    it('supports both review endpoints but rejects a report from an unrelated producer', async () => {
        const last = { ...ref, artifactVersionId: 'saved-v2' }
        findAll.mockResolvedValue({
            items: [
                {
                    id: 'message',
                    content: '',
                    taskSummary: {
                        version: 1,
                        fileChanges: [
                            {
                                before: { sha256: 'a'.repeat(64), size: 1 },
                                after: { sha256: 'b'.repeat(64), size: 2 },
                                id: 'change',
                                workspacePath: 'index.html',
                                title: 'index.html',
                                operation: 'modified',
                                coverage: 'observed',
                                resource: { type: 'file_change', first: ref, last }
                            }
                        ]
                    }
                }
            ]
        })
        await consumer.read('conversation', ref)
        await consumer.read('conversation', last)
        expect(resolve).toHaveBeenLastCalledWith(last)
        resolve.mockResolvedValueOnce({
            buffer: Buffer.from('{}'),
            artifact: { pluginName: 'other', resourceType: 'file-change' }
        })
        await expect(consumer.read('conversation', ref)).rejects.toBeInstanceOf(NotFoundException)
    })
})
