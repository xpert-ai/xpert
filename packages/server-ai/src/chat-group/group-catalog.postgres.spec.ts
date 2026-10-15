import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { UserType } from '@xpert-ai/contracts'
import { GroupParticipant } from './group.entity'
import { GroupCatalogService } from './group-catalog.service'
import { GroupAccessService } from './group-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'

// Use a disposable local PostgreSQL database, never a platform database.
const databaseUrl = process.env.GROUP_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const schema = `group_catalog_${randomUUID().replace(/-/g, '')}`
const text = { type: 'varchar' as const, nullable: true }
const scope = { tenantId: 'tenant', organizationId: 'org' }

postgres('group member candidate queries on PostgreSQL', () => {
    let db: DataSource
    let service: GroupCatalogService
    const access = {
        scope: () => ({ ...scope, userId: 'named' }),
        user: jest.fn().mockResolvedValue(undefined),
        authorize: jest.fn().mockResolvedValue(undefined)
    }

    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: databaseUrl,
            schema,
            entities: [
                new EntitySchema({
                    name: 'GroupParticipant',
                    target: GroupParticipant,
                    columns: {
                        id: { type: 'varchar', primary: true },
                        tenantId: text,
                        organizationId: text,
                        groupId: text,
                        subjectId: text,
                        kind: text,
                        active: { type: 'boolean' }
                    }
                }),
                new EntitySchema<User>({
                    name: 'User',
                    target: User,
                    tableName: 'user',
                    columns: {
                        id: { type: 'varchar', primary: true },
                        tenantId: text,
                        type: text,
                        firstName: text,
                        lastName: text,
                        username: text,
                        email: text,
                        imageUrl: text,
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true }
                    }
                }),
                new EntitySchema<UserOrganization>({
                    name: 'UserOrganization',
                    target: UserOrganization,
                    tableName: 'user_organization',
                    columns: {
                        id: { type: 'varchar', primary: true },
                        tenantId: text,
                        organizationId: text,
                        userId: text,
                        isActive: { type: 'boolean' }
                    },
                    relations: { user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } } }
                })
            ]
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        const users = [
            { id: 'named', firstName: 'Alice', lastName: 'Smith' },
            { id: 'email', email: 'invitee@example.com' },
            { id: 'username', username: 'invitee-login', email: 'other@example.com' },
            { id: 'bare' },
            { id: 'percent', username: 'literal%value' },
            { id: 'underscore', username: 'literal_value' },
            { id: 'backslash', username: 'literal\\value' },
            { id: 'other-org', email: 'invitee@example.com' },
            { id: 'other-tenant', email: 'invitee@example.com', tenantId: 'other' },
            { id: 'inactive', email: 'invitee@example.com' },
            { id: 'technical', email: 'invitee@example.com', type: UserType.COMMUNICATION },
            { id: 'deleted', email: 'invitee@example.com', deletedAt: new Date() }
        ]
        await db
            .getRepository(User)
            .save(users.map((user) => ({ tenantId: scope.tenantId, type: UserType.USER, ...user })))
        await db.getRepository(UserOrganization).save(
            users.map((user) => ({
                ...scope,
                id: user.id,
                userId: user.id,
                tenantId: user.tenantId ?? scope.tenantId,
                organizationId: user.id === 'other-org' ? 'other' : scope.organizationId,
                isActive: user.id !== 'inactive'
            }))
        )
        service = new GroupCatalogService(
            db,
            access as unknown as GroupAccessService,
            {} as PublishedXpertAccessService
        )
    })

    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })

    it.each(['', '   '])(
        'includes unnamed accounts for a blank search %j while retaining scope and user filters',
        async (search) => {
            const rows = await service.candidates('user', search, 'group')
            expect(rows.map((row) => row.subjectId).sort()).toEqual([
                'backslash',
                'bare',
                'email',
                'named',
                'percent',
                'underscore',
                'username'
            ])
            expect(rows.find((row) => row.subjectId === 'email')).toEqual({
                kind: 'user',
                subjectId: 'email',
                name: 'invitee@example.com',
                avatar: null
            })
            expect(rows.find((row) => row.subjectId === 'username')?.name).toBe('invitee-login')
            expect(rows.find((row) => row.subjectId === 'bare')?.name).toBe('bare')
            expect(access.authorize).toHaveBeenCalledWith('group', true)
            expect(access.user).toHaveBeenCalledWith(scope, 'named')
        }
    )

    it('filters active human members before applying pagination, but permits removed members', async () => {
        const repository = db.getRepository(GroupParticipant)
        await repository.save([
            { id: 'member-email', ...scope, groupId: 'paged-group', subjectId: 'email', kind: 'user', active: true },
            {
                id: 'member-username',
                ...scope,
                groupId: 'paged-group',
                subjectId: 'username',
                kind: 'user',
                active: false
            }
        ])
        const first = await service.candidates('user', 'invitee', 'paged-group', { limit: 1, offset: 0 })
        expect(first.map((item) => item.subjectId)).toEqual(['username'])
        expect(await service.candidates('user', 'invitee', 'paged-group', { limit: 1, offset: 1 })).toEqual([])
    })

    it.each([
        [' ALICE ', ['named']],
        ['smith', ['named']],
        ['INVITEE@EXAMPLE.COM', ['email']],
        ['invitee-LOGIN', ['username']],
        ['invitee', ['email', 'username']],
        ['missing', []],
        ['%', ['percent']],
        ['_', ['underscore']],
        ['\\', ['backslash']]
    ])('matches literal name, email and username search %j', async (search, expected) => {
        expect((await service.candidates('user', search)).map((row) => row.subjectId).sort()).toEqual(expected)
    })
})
