jest.mock('../../shared/volume/artifact-byte-storage', () => ({ artifactByteStorage: jest.fn() }))
jest.mock('../../ai/public-xpert-principal', () => ({ assertPublicXpertSessionConversationAccess: jest.fn() }))
jest.mock('../../ai/workbench-principal', () => ({ assertWorkbenchPrincipal: jest.fn() }))
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationService } from '../conversation.service'
import { VolumeClient } from '../../shared/volume'
import { artifactByteStorage } from '../../shared/volume/artifact-byte-storage'
import { assertPublicXpertSessionConversationAccess } from '../../ai/public-xpert-principal'
import { ToolDetailsService } from './tool-details.service'
import { StoreToolDetailCommand } from './store-tool-detail.command'

const id = '10000000-0000-4000-8000-000000000001'
const execution = '20000000-0000-4000-8000-000000000001'
describe('immutable tool detail authorization and storage', () => {
    const bytes = new Map<string, Buffer>()
    const read = jest.fn(async (path: string) => {
        const value = bytes.get(path)
        if (!value) throw new Error('missing')
        return value
    })
    const write = jest.fn(async (path: string, value: Buffer) => {
        bytes.set(path, value)
    })
    const conversation = {
        id,
        threadId: 'thread',
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        createdById: 'user'
    } as ChatConversation
    const assertAccess = jest.fn(async () => conversation)
    const findOneBy = jest.fn(async () => conversation)
    const existsBy = jest.fn(async () => true)
    const resolve = jest.fn()
    const service = new ToolDetailsService(
        {
            getRepository: (entity) => (entity === ChatConversation ? { findOneBy } : { existsBy })
        } as unknown as DataSource,
        { assertAccess } as unknown as ChatConversationService,
        {} as QueryBus,
        { resolve } as unknown as Pick<VolumeClient, 'resolve'>
    )
    beforeEach(() => {
        bytes.clear()
        jest.clearAllMocks()
        assertAccess.mockResolvedValue(conversation)
        existsBy.mockResolvedValue(true)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
        jest.mocked(artifactByteStorage).mockReturnValue({ read, write, remove: jest.fn() })
        jest.mocked(assertPublicXpertSessionConversationAccess).mockResolvedValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())
    const store = (text: string) =>
        service.store(
            new StoreToolDetailCommand(id, execution, {
                toolCallId: 'call',
                executionId: execution,
                phase: 'output',
                format: 'text',
                text
            })
        )
    it('binds snapshots to tenant, organization, conversation, execution, call and phase', async () => {
        const ref = await store('original')
        expect(ref).toBeDefined()
        expect(findOneBy).toHaveBeenCalledWith({ id, tenantId: 'tenant', organizationId: 'org' })
        expect(existsBy).toHaveBeenCalledWith({
            id: execution,
            threadId: 'thread',
            tenantId: 'tenant',
            organizationId: 'org'
        })
        expect((await service.read(ref!, 0)).content).toBe('original')
        for (const forged of [
            { toolCallId: 'other' },
            { phase: 'input' as const },
            { executionId: id },
            { conversationId: execution }
        ]) {
            await expect(service.read({ ...ref!, ...forged }, 0)).rejects.toMatchObject({ status: 404 })
        }
        existsBy.mockResolvedValue(false)
        await expect(service.read(ref!, 0)).rejects.toMatchObject({ status: 404 })
    })
    it('denies before reading bytes and rechecks public session access on every page', async () => {
        const ref = await store('safe snapshot')
        assertAccess.mockRejectedValueOnce(new Error('denied'))
        await expect(service.read(ref!, 0)).rejects.toThrow('denied')
        expect(read).not.toHaveBeenCalled()
        jest.mocked(assertPublicXpertSessionConversationAccess).mockRejectedValueOnce(new Error('assistant denied'))
        await expect(service.read(ref!, 0)).rejects.toThrow('assistant denied')
        expect(read).not.toHaveBeenCalled()
        await service.read(ref!, 0)
        expect(assertAccess).toHaveBeenLastCalledWith(id, 'read')
        expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledTimes(3)
    })
    it('reads immutable pages without splitting Unicode and reports unavailable content', async () => {
        const text = 'x'.repeat(16383) + '🙂' + 'end'
        const ref = await store(text)
        await store('new content')
        const first = await service.read(ref!, 0)
        expect(first.content).toBe('x'.repeat(16383))
        expect(first.nextOffset).toBe(16383)
        const second = await service.read(ref!, first.nextOffset!)
        expect(second.content).toBe('🙂end')
        expect(second.nextOffset).toBeNull()
        expect(first.content + second.content).toBe(text)
        await expect(service.read(ref!, text.length + 1)).rejects.toMatchObject({ status: 404 })
        read.mockRejectedValueOnce(new Error('hash mismatch'))
        await expect(service.read(ref!, 0)).rejects.toMatchObject({ status: 404 })
        read.mockResolvedValueOnce(Buffer.from('invalid json'))
        await expect(service.read(ref!, 0)).rejects.toMatchObject({ status: 404 })
    })
})
