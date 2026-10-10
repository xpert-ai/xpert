import { CommandBus, CommandHandler, CqrsModule, ICommandHandler } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand, User } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, QueryRunner } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../workspace-access.service'
import { XpertWorkspace } from '../../workspace.entity'
import { EnsurePersonalDefaultWorkspaceCommand } from '../ensure-personal-default-workspace.command'
import { EnsurePersonalDefaultWorkspaceHandler } from './ensure-personal-default-workspace.handler'

const postgres = process.env.PERSONAL_WORKSPACE_PG_E2E === '1' ? describe : describe.skip
const workspaceSchema = new EntitySchema<XpertWorkspace>({
    name: 'PersonalWorkspaceFixture',
    tableName: 'personal_workspace_fixture',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        tenantId: { type: 'uuid' },
        organizationId: { type: 'uuid' },
        ownerId: { type: 'uuid' },
        name: { type: String },
        status: { type: String },
        createdAt: { type: 'timestamptz', createDate: true },
        settings: { type: 'jsonb' }
    },
    relations: {
        members: {
            type: 'many-to-many',
            target: 'PersonalWorkspaceMemberFixture',
            joinTable: {
                name: 'personal_workspace_members_fixture',
                joinColumn: { name: 'workspaceId' },
                inverseJoinColumn: { name: 'userId' }
            }
        }
    }
})
const memberSchema = new EntitySchema<User>({
    name: 'PersonalWorkspaceMemberFixture',
    tableName: 'personal_workspace_user_fixture',
    columns: { id: { type: 'uuid', primary: true } }
})

@CommandHandler(ResolveUserOrganizationAccessCommand)
class OrganizationAccessPolicy implements ICommandHandler<ResolveUserOrganizationAccessCommand> {
    async execute(): Promise<User> {
        return new User()
    }
}

postgres('personal workspace UUID and JSON identity lookup (PostgreSQL)', () => {
    let db: DataSource
    let runner: QueryRunner
    let module: TestingModule
    const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }

    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS,
            database: process.env.DB_NAME ?? 'postgres',
            entities: [workspaceSchema, memberSchema]
        }).initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // Connection-local tables exercise real PostgreSQL types without modifying user workspaces.
        await runner.query(`CREATE TEMP TABLE personal_workspace_fixture (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid, "organizationId" uuid,
            "ownerId" uuid, name text, status text, "createdAt" timestamptz DEFAULT NOW(), settings jsonb);
            CREATE TEMP TABLE personal_workspace_user_fixture (id uuid PRIMARY KEY);
            CREATE TEMP TABLE personal_workspace_members_fixture ("workspaceId" uuid, "userId" uuid);`)
        module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                EnsurePersonalDefaultWorkspaceHandler,
                OrganizationAccessPolicy,
                {
                    provide: getRepositoryToken(XpertWorkspace),
                    useValue: runner.manager.getRepository(workspaceSchema)
                },
                { provide: XpertWorkspaceAccessService, useValue: { assertCanAuthor: jest.fn() } }
            ]
        }).compile()
        await module.init()
    })

    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
        await runner.query('TRUNCATE personal_workspace_fixture, personal_workspace_members_fixture')
    })

    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        await module?.close()
        await runner?.release()
        await db?.destroy()
    })

    const execute = (): Promise<XpertWorkspace> =>
        module.get(CommandBus).execute(new EnsurePersonalDefaultWorkspaceCommand('Bosi'))

    it('creates on first use and reuses the same workspace on retry with a UUID owner and JSON userId', async () => {
        const first = await execute()
        expect(first).toMatchObject({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            ownerId: scope.userId,
            settings: { system: { kind: 'user-default', userId: scope.userId } }
        })
        expect((await execute()).id).toBe(first.id)
        expect(await runner.manager.getRepository(workspaceSchema).count()).toBe(1)
    })

    it('ignores mismatched JSON identity without trying to parse arbitrary JSON text as a UUID', async () => {
        const first = await execute()
        await runner.manager.getRepository(workspaceSchema).update(first.id, {
            settings: { system: { kind: 'user-default', userId: 'legacy-user' } }
        })
        expect((await execute()).id).not.toBe(first.id)
    })
})
