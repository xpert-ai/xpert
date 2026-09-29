import { randomUUID } from 'node:crypto'
import { changeLanguage, init } from 'i18next'
import { DataSource, EntityManager, EntitySchema } from 'typeorm'
import type { TConversationBranchNaming } from '@xpert-ai/contracts'
import en from '../i18n/en.json'
import enUS from '../i18n/en-US.json'
import zh from '../i18n/zh-Hans.json'
import { ChatConversation } from './conversation.entity'
import { allocateBranchTitle } from './branch-title'

function sourceConversation(title = 'Original') {
    return Object.assign(new ChatConversation(), {
        id: randomUUID(),
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        title
    })
}

function branchConversation(source: ChatConversation, naming: TConversationBranchNaming) {
    return Object.assign(new ChatConversation(), {
        id: randomUUID(),
        tenantId: source.tenantId,
        organizationId: source.organizationId,
        title: naming.generatedTitle,
        branchSource: {
            conversationId: source.id,
            threadId: randomUUID(),
            messageId: randomUUID(),
            requestId: randomUUID(),
            naming
        }
    })
}

function fixture() {
    const branches: ChatConversation[] = []
    const lookup = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => branches)
    }
    const manager = {
        query: jest.fn().mockResolvedValue([]),
        getRepository: () => ({ createQueryBuilder: () => lookup })
    } as unknown as EntityManager
    return { manager, branches }
}

beforeAll(async () => {
    await init({
        lng: 'en',
        resources: { en: { 'server-ai': en }, 'en-US': { 'server-ai': enUS }, 'zh-Hans': { 'server-ai': zh } }
    })
})
beforeEach(async () => {
    await changeLanguage('en')
})

describe('branch titles', () => {
    it.each(['en', 'en-US', 'zh-Hans'])('starts at 2 in %s', async (language) => {
        await changeLanguage(language)
        const { manager } = fixture()
        const source = sourceConversation()
        expect(await allocateBranchTitle(manager, source)).toEqual({
            familyId: source.id,
            baseTitle: 'Original',
            number: 2,
            generatedTitle: 'Original (2)'
        })
    })

    it('increments across siblings and descendants without stacking suffixes', async () => {
        const { manager, branches } = fixture()
        const source = sourceConversation()
        const first = branchConversation(source, await allocateBranchTitle(manager, source))
        branches.push(first)
        branches.push(branchConversation(source, await allocateBranchTitle(manager, source)))
        expect(await allocateBranchTitle(manager, first)).toMatchObject({
            familyId: source.id,
            baseTitle: source.title,
            number: 4,
            generatedTitle: 'Original (4)'
        })
        expect(branches.map((branch) => branch.title)).toEqual(['Original (2)', 'Original (3)'])
    })

    it('keeps the numbering lineage after the original conversation is deleted', async () => {
        const { manager } = fixture()
        const original = sourceConversation()
        const branch = branchConversation(original, await allocateBranchTitle(manager, original))
        expect(await allocateBranchTitle(manager, branch)).toMatchObject({
            familyId: original.id,
            generatedTitle: 'Original (3)'
        })
    })

    it('starts a new group after a branch is renamed', async () => {
        const { manager } = fixture()
        const original = sourceConversation()
        const branch = branchConversation(original, await allocateBranchTitle(manager, original))
        branch.title = 'Renamed'
        expect(await allocateBranchTitle(manager, branch)).toMatchObject({
            familyId: branch.id,
            baseTitle: 'Renamed',
            generatedTitle: 'Renamed (2)'
        })
    })

    it.each(['Report (2026)', 'Report (2)', 'Report（分叉）', 'R&D <review>'])(
        'preserves literal title characters: %s',
        async (title) => {
            const { manager } = fixture()
            expect((await allocateBranchTitle(manager, sourceConversation(title))).generatedTitle).toBe(`${title} (2)`)
        }
    )

    it('localizes the fallback for an untitled conversation', async () => {
        await changeLanguage('zh-Hans')
        const { manager } = fixture()
        expect((await allocateBranchTitle(manager, sourceConversation(''))).generatedTitle).toBe('聊天 (2)')
    })
})

// Only an explicitly supplied, isolated test database is used.
const connectionString = process.env.CHATKIT_BRANCH_TEST_DATABASE_URL
const postgres = connectionString ? describe : describe.skip
postgres('branch numbering in PostgreSQL', () => {
    const schema = `branch_titles_${randomUUID().replace(/-/g, '')}`
    const conversations = new EntitySchema<ChatConversation>({
        name: ChatConversation.name,
        target: ChatConversation,
        tableName: 'chat_conversation',
        columns: {
            id: { type: 'uuid', primary: true },
            tenantId: { type: 'uuid' },
            organizationId: { type: 'uuid', nullable: true },
            title: { type: 'varchar', nullable: true },
            branchSource: { type: 'jsonb', nullable: true }
        }
    })
    const database = new DataSource({
        type: 'postgres',
        url: connectionString,
        schema,
        entities: [conversations],
        extra: { max: 3 }
    })
    const createBranch = (source: ChatConversation) =>
        database.transaction(async (manager) => {
            const naming = await allocateBranchTitle(manager, source)
            return manager.getRepository(conversations).save(branchConversation(source, naming))
        })

    beforeAll(async () => {
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
    })
    afterAll(async () => {
        if (database.isInitialized) {
            try {
                await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            } finally {
                await database.destroy()
            }
        }
    })

    it('serializes concurrent allocations from the original and its descendant', async () => {
        const source = sourceConversation()
        const first = await createBranch(source)
        const branches = await Promise.all([createBranch(source), createBranch(first)])
        expect(first.title).toBe('Original (2)')
        expect(branches.map((branch) => branch.title).sort()).toEqual(['Original (3)', 'Original (4)'])
    })

    it('scopes numbering to the tenant, organization and title family', async () => {
        const source = sourceConversation()
        expect((await createBranch(source)).title).toBe('Original (2)')
        const variations: Partial<ChatConversation>[] = [
            { tenantId: randomUUID() },
            { organizationId: randomUUID() },
            { organizationId: null },
            { id: randomUUID() },
            { title: 'Renamed' }
        ]
        for (const changes of variations) {
            const independent = Object.assign(new ChatConversation(), source, changes)
            expect((await createBranch(independent)).title).toBe(`${independent.title} (2)`)
        }
        expect((await createBranch(source)).title).toBe('Original (3)')
    })

    it('rolls back the allocation with a failed branch transaction', async () => {
        const source = sourceConversation()
        await expect(
            database.transaction(async (manager) => {
                const naming = await allocateBranchTitle(manager, source)
                await manager.getRepository(conversations).save(branchConversation(source, naming))
                throw new Error('Checkpoint copy failed')
            })
        ).rejects.toThrow('Checkpoint copy failed')
        expect((await createBranch(source)).title).toBe('Original (2)')
    })
})
