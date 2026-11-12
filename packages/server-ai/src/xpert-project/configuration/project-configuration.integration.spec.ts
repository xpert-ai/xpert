import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntitySchema } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { projectTaskConfigurationSchema } from '@xpert-ai/contracts'
import { ProjectConfigurationService } from './project-configuration.service'
import { XpertProjectConfiguration } from './project-configuration.entity'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectAccessRuntimeService } from '../services/project-access-runtime.service'
import { XpertProjectTypeService } from '../services/project-type.service'
import { AssistantPrincipalAccessService } from '../../xpert/assistant-principal/assistant-principal-access.service'
import { ModelExecutionPolicyService, parseExecutionPolicy } from '../../model-execution/execution-policy'

const url = process.env.XPERT_PROJECT_CONFIGURATION_TEST_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const, nullable: true }, text = { type: 'varchar' as const, nullable: true }
const base = { id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const }, tenantId: uuid, organizationId: uuid }
const schemas = [
    new EntitySchema({ name: 'XpertProject', target: XpertProject, tableName: 'xpert_project', columns: {
        ...base, ownerId: uuid, name: text, status: text, applicationKey: text, projectTypeKey: text,
        deletedAt: { type: 'timestamp', nullable: true, deleteDate: true }
    } }),
    new EntitySchema({ name: 'XpertProjectMembership', target: XpertProjectMembership, tableName: 'xpert_project_membership', columns: {
        ...base, projectId: uuid, userId: uuid, role: text, deletedAt: { type: 'timestamp', nullable: true },
        removedAt: { type: 'timestamp', nullable: true }
    } }),
    new EntitySchema({ name: 'XpertProjectConfiguration', target: XpertProjectConfiguration, tableName: 'xpert_project_configuration', columns: {
        ...base, projectId: uuid, values: { type: 'jsonb' }, revision: { type: 'int' },
        deletedAt: { type: 'timestamp', nullable: true, deleteDate: true }
    } })
]

integration('Project configuration / PostgreSQL', () => {
    let database: DataSource, service: ProjectConfigurationService
    const schema = `project_config_${randomUUID().replace(/-/g, '')}`
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const project = { ...actor, id: randomUUID(), status: 'active' as const, ownerId: actor.userId,
        applicationKey: 'platform', projectTypeKey: 'coding' }
    const migration = readFileSync(join(__dirname, '../migrations/20261107000000-project-configuration.sql'), 'utf8')
    const check = readFileSync(join(__dirname, '../migrations/checks/20261107000000-project-configuration.sql'), 'utf8')
    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_')) throw new Error('Dedicated test database required')
        database = await new DataSource({ type: 'postgres', url }).initialize()
        await database.query(`CREATE SCHEMA ${schema}`)
        await database.destroy()
        database = await new DataSource({ type: 'postgres', url, schema,
            extra: { options: `-c search_path=${schema},public` }, entities: schemas }).initialize()
        await database.query(`CREATE TABLE tenant (id uuid PRIMARY KEY); CREATE TABLE organization (id uuid PRIMARY KEY);
            CREATE TABLE "user" (id uuid PRIMARY KEY);
            CREATE TABLE xpert_project (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "ownerId" uuid,
                name varchar, status varchar, "applicationKey" varchar, "projectTypeKey" varchar, "deletedAt" timestamp);
            CREATE TABLE xpert_project_membership (id uuid PRIMARY KEY, "projectId" uuid, "tenantId" uuid, "organizationId" uuid,
                "userId" uuid, role varchar, "deletedAt" timestamp, "removedAt" timestamp);`)
        await database.query(migration)
        await database.query(migration)
        expect(await database.query(check)).toEqual([])
        await database.query('INSERT INTO tenant VALUES ($1)', [actor.tenantId])
        await database.query('INSERT INTO organization VALUES ($1)', [actor.organizationId])
        await database.query('INSERT INTO "user" VALUES ($1)', [actor.userId])
        const access = { assertCanRead: async () => ({ project, role: 'owner' }), assertCanManage: async () => ({ project, role: 'owner' }) }
        const module = await Test.createTestingModule({ providers: [ProjectConfigurationService, ProjectAccessRuntimeService,
            { provide: getRepositoryToken(XpertProject), useValue: database.getRepository(XpertProject) },
            { provide: getRepositoryToken(XpertProjectConfiguration), useValue: database.getRepository(XpertProjectConfiguration) },
            { provide: XpertProjectAccessService, useValue: access },
            { provide: AssistantPrincipalAccessService, useValue: { isPrincipal: async () => false } },
            { provide: XpertProjectTypeService, useValue: { resolve: () => ({ configuration: { schema: projectTaskConfigurationSchema(7200) } }) } },
            { provide: ModelExecutionPolicyService, useValue: { require: async () => parseExecutionPolicy({}) } }
        ] }).compile()
        service = module.get(ProjectConfigurationService)
    })
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        await database.query('TRUNCATE xpert_project CASCADE')
        await database.query('TRUNCATE xpert_project_membership')
        await database.getRepository(XpertProject).save(project)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        if (database?.isInitialized) { await database.query(`DROP SCHEMA ${schema} CASCADE`); await database.destroy() }
    })
    it.each(['tenant', 'organization', 'user'])('rejects execution configuration reads from a different %s', async (boundary) => {
        const other = { ...actor }
        if (boundary === 'tenant') other.tenantId = randomUUID()
        if (boundary === 'organization') other.organizationId = randomUUID()
        if (boundary === 'user') other.userId = randomUUID()
        await expect(service.taskDuration(project.id, other)).rejects.toThrow()
        expect(await database.getRepository(XpertProjectConfiguration).count()).toBe(0)
    })
    it('serializes first-write races and rejects the stale writer', async () => {
        const results = await Promise.allSettled([5400, 7200].map((seconds) => service.update(project.id,
            { revision: 0, values: { taskExecutionMaxDurationSeconds: seconds } })))
        expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1)
        const rows = await database.getRepository(XpertProjectConfiguration).find()
        expect(rows).toHaveLength(1)
        expect(rows[0].revision).toBe(1)
        await database.query(migration)
        expect((await database.getRepository(XpertProjectConfiguration).find())[0]).toEqual(rows[0])
    })
    it.each(['archive', 'remove-manager'])('rejects %s while a writer waits for the Project lock', async (change) => {
        if (change === 'remove-manager') {
            await database.query('UPDATE xpert_project SET "ownerId"=$1 WHERE id=$2', [randomUUID(), project.id])
            await database.query('INSERT INTO xpert_project_membership (id,"projectId","tenantId","organizationId","userId",role) VALUES ($1,$2,$3,$4,$5,$6)',
                [randomUUID(), project.id, actor.tenantId, actor.organizationId, actor.userId, 'manager'])
        }
        const blocker = database.createQueryRunner()
        await blocker.connect(); await blocker.startTransaction()
        try {
            await blocker.query('SELECT id FROM xpert_project WHERE id=$1 FOR UPDATE', [project.id])
            const outcome = service.update(project.id, { revision: 0, values: {} }).then(() => 'accepted', () => 'rejected')
            const until = Date.now() + 5000
            let waiting = false
            while (Date.now() < until) {
                const rows = await database.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%xpert_project%'")
                if (rows.length) { waiting = true; break }
                await new Promise((resolve) => setTimeout(resolve, 20))
            }
            expect(waiting).toBe(true)
            if (change === 'archive') await blocker.query("UPDATE xpert_project SET status='archived' WHERE id=$1", [project.id])
            else await blocker.query('UPDATE xpert_project_membership SET "removedAt"=now() WHERE "projectId"=$1', [project.id])
            await blocker.commitTransaction()
            expect(await outcome).toBe('rejected')
            expect(await database.getRepository(XpertProjectConfiguration).count()).toBe(0)
        } finally {
            if (blocker.isTransactionActive) await blocker.rollbackTransaction()
            await blocker.release()
        }
    }, 15000)
})
