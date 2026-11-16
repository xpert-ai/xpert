import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileMemoryService } from './file-memory.service'
import { StandardReplies } from './standard-replies'
import { memoryRevision } from './dream-review'

it('matches only approved versions and explicit questions in the same scope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-reply-'))
    try {
        const scope = { tenantId: 'tenant', id: 'assistant', userId: 'owner', workspaceDataScope: 'user' as const }
        const memory = new FileMemoryService({
            resolve: () => ({ path: (relative) => path.join(root, relative) }),
            readSnapshot: (_scope, relative) => fs.readFile(path.join(root, relative), 'utf8')
        })
        const service = new StandardReplies(memory, path.join(root, 'approvals'))
        const original = {
            type: 'project' as const,
            title: '仓库交接清单归档时间',
            summary: '归档时间',
            content: '仓库交接清单每天 18:00 归档。'
        }
        const { memoryId } = await memory.writeMemory(scope, original)
        const version = async () => memoryRevision((await memory.listTopicRecords(scope))[0].document)
        const revision = await version()
        const reply = {
            question: '仓库交接清单几点归档？',
            aliases: ['仓库清单的归档时间是什么？'],
            answer: original.content
        }
        const input = { id: memoryId, revision, approvalId: null, reply }
        await service.configure(scope, input)
        expect(await service.resolve(scope, reply.question)).toMatchObject({ kind: 'approved', text: original.content })
        expect(await service.resolve(scope, ' 仓库清单的归档时间是什么? ')).toMatchObject({
            kind: 'approved',
            text: original.content
        })
        expect(await service.resolve(scope, '仓库交接清单几点归档，按哪个时区？')).toBeUndefined()
        expect(await service.resolve({ ...scope, userId: 'other' }, reply.question)).toBeUndefined()
        await expect(service.configure(scope, input)).rejects.toThrow()
        const { memoryId: second } = await memory.writeMemory(scope, { ...original, title: 'Another note' })
        const other = (await memory.listTopicRecords(scope)).find((r) => r.document.frontmatter.id === second)
        await expect(
            service.configure(scope, { ...input, id: second, revision: memoryRevision(other.document) })
        ).rejects.toThrow()
        await memory.writeMemory(scope, {
            ...original,
            memoryId,
            content: '仓库交接清单每天 20:00 归档。',
            source: 'dream'
        })
        expect(await service.resolve(scope, reply.question)).toEqual({
            kind: 'inactive',
            current: '仓库交接清单每天 20:00 归档。'
        })
        await memory.writeMemory(scope, { ...original, memoryId })
        expect(await service.resolve(scope, reply.question)).toEqual({ kind: 'inactive', current: original.content })
        const current = (await memory.listTopicRecords(scope)).find((r) => r.document.frontmatter.id === memoryId)
        const stale = await service.detail(scope, memoryId, memoryRevision(current.document), 'active')
        expect(stale.active).toBe(false)
        await service.configure(scope, { ...input, approvalId: stale.id, revision: memoryRevision(current.document) })
        expect(await service.resolve(scope, reply.question)).toMatchObject({ kind: 'approved', text: original.content })
        await memory.archiveMemory(scope, { memoryId })
        expect(await service.resolve(scope, reply.question)).toEqual({ kind: 'inactive', current: undefined })
    } finally {
        await fs.rm(root, { recursive: true, force: true })
    }
})
