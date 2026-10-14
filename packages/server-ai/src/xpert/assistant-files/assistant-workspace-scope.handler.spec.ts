import { ForbiddenException } from '@nestjs/common'
import { UserType } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { AssistantWorkspaceScopeHandler } from './assistant-workspace-scope.handler'
import { ResolveAssistantWorkspaceScopeCommand } from './resolve-assistant-workspace-scope.command'

describe('AssistantWorkspaceScopeHandler', () => {
    const input = { tenantId: 'tenant', userId: 'technical', xpertId: 'assistant', workspaceDataScope: 'user' as const }
    const query = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn()
    }
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(query) }
    const handler = new AssistantWorkspaceScopeHandler(repository as never)
    const creator = { id: 'human', tenantId: 'tenant', type: UserType.USER }

    beforeEach(() => {
        jest.clearAllMocks()
        query.getOne.mockReset()
    })

    it('resolves an Assistant technical account to its persisted creator without request metadata', async () => {
        query.getOne.mockResolvedValue(Object.assign(new Xpert(), { createdBy: creator }))
        await expect(handler.execute(new ResolveAssistantWorkspaceScopeCommand(input))).resolves.toEqual({
            tenantId: 'tenant',
            catalog: 'user-xperts',
            userId: 'human',
            xpertId: 'assistant'
        })
        expect(query.andWhere).toHaveBeenCalledWith('principal.id = :userId', { userId: 'technical' })
        expect(query.andWhere).toHaveBeenCalledWith('principal.type = :type', { type: UserType.COMMUNICATION })
        expect(query.andWhere).toHaveBeenCalledWith(
            'principal."thirdPartyId" = CONCAT(CAST(:prefix AS text), assistant.id)',
            {
                prefix: 'xpert:'
            }
        )
        expect(query.andWhere).toHaveBeenCalledWith('principal."tenantId" = :tenantId')
    })

    it('retains the actor directory when no Assistant technical-principal binding exists', async () => {
        query.getOne.mockResolvedValue(null)
        await expect(handler.execute(new ResolveAssistantWorkspaceScopeCommand(input))).resolves.toMatchObject({
            catalog: 'user-xperts',
            userId: 'technical'
        })
    })

    it.each(['shared', undefined] as const)(
        'leaves %s shared storage independent of account ownership',
        async (scope) => {
            await expect(
                handler.execute(new ResolveAssistantWorkspaceScopeCommand({ ...input, workspaceDataScope: scope }))
            ).resolves.toMatchObject({ catalog: 'xperts', isolateByUser: false })
            expect(repository.createQueryBuilder).not.toHaveBeenCalled()
        }
    )

    it.each([null, { ...creator, tenantId: 'another-tenant' }, { ...creator, type: UserType.COMMUNICATION }])(
        'rejects a missing, cross-tenant or non-human creator instead of choosing another directory',
        async (createdBy) => {
            query.getOne.mockResolvedValue({ createdBy })
            await expect(handler.execute(new ResolveAssistantWorkspaceScopeCommand(input))).rejects.toThrow(
                ForbiddenException
            )
        }
    )

    // Opt-in, read-only fixtures exercise the production predicates on PostgreSQL.
    const databaseUrl = process.env.ASSISTANT_WORKSPACE_TEST_DATABASE_URL
    const postgres = databaseUrl ? describe : describe.skip
    postgres('PostgreSQL principal lookup', () => {
        let database: DataSource
        beforeAll(async () => {
            database = await new DataSource({
                type: 'postgres',
                url: databaseUrl,
                extra: { options: '-c default_transaction_read_only=on' }
            }).initialize()
        })
        afterAll(async () => database?.destroy())

        it.each([
            ['technical', 'human'],
            ['human', 'human'],
            ['another-user', 'another-user']
        ])('resolves %s to %s with correctly typed SQL parameters', async (userId, expectedOwner) => {
            query.getOne.mockImplementation(async () => {
                const calls = [...query.where.mock.calls, ...query.andWhere.mock.calls]
                const predicates = calls.map(([condition]) => condition).join(' AND ')
                const parameters = Object.assign({}, ...calls.map(([, values]) => values))
                const [sql, values] = database.driver.escapeQueryWithParameters(
                    `WITH assistant AS (
                        SELECT '00000000-0000-4000-8000-000000000001'::uuid AS id, 'tenant'::text AS "tenantId"
                    ), principal AS (
                        SELECT 'technical'::text AS id, 'tenant'::text AS "tenantId",
                            :principalType::text AS type,
                            'xpert:00000000-0000-4000-8000-000000000001'::text AS "thirdPartyId"
                    )
                    SELECT assistant.id FROM assistant CROSS JOIN principal WHERE ${predicates}`,
                    { ...parameters, principalType: UserType.COMMUNICATION },
                    {}
                )
                const rows: { id: string }[] = await database.query(sql, values)
                return rows.length ? Object.assign(new Xpert(), { createdBy: creator }) : null
            })
            await expect(
                handler.execute(new ResolveAssistantWorkspaceScopeCommand({ ...input, userId }))
            ).resolves.toMatchObject({ catalog: 'user-xperts', userId: expectedOwner })
        })
    })
})
