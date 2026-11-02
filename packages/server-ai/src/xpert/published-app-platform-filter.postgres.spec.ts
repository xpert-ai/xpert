import { randomUUID } from 'node:crypto'
import { DataSource, QueryRunner, SelectQueryBuilder } from 'typeorm'
import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { applyAppPlatformPublishedFilter } from './published-app-platform-filter'
import type { Xpert } from './xpert.entity'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { appPlatformKnowledgeIds } from '../knowledgebase/runtime/app-platform-knowledge-access'

const url = process.env.XPERT_APP_PLATFORM_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('managed published Assistant boundary / PostgreSQL', () => {
    let database: DataSource, runner: QueryRunner
    const tenant = randomUUID(),
        org = randomUUID(),
        user = randomUUID(),
        role = randomUUID()
    const workspace = randomUUID(),
        installation = randomUUID()
    const entry = randomUUID(),
        child = randomUUID(),
        standalone = randomUUID(),
        unrelated = randomUUID()
    const suiteIds = [entry, child, standalone].sort()
    const library = randomUUID(),
        otherLibrary = randomUUID()
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false }).initialize()
        runner = database.createQueryRunner()
        await runner.connect()
        await runner.startTransaction()
        // These unindexed temporary fixtures have no production statistics. Avoid
        // spending seconds compiling the planner's inflated JSON join estimates.
        await runner.query('SET LOCAL jit = off')
        // Temporary tables shadow application tables only on this connection and vanish on rollback.
        await runner.query(`CREATE TEMP TABLE "role" (id uuid, name varchar) ON COMMIT DROP;
            CREATE TEMP TABLE "user" (id uuid, "tenantId" uuid, "roleId" uuid, "isActive" boolean DEFAULT true) ON COMMIT DROP;
            CREATE TEMP TABLE role_permission ("tenantId" uuid, "roleId" uuid, permission varchar, enabled boolean) ON COMMIT DROP;
            CREATE TEMP TABLE xpert (id uuid, "tenantId" uuid, "organizationId" uuid, "workspaceId" uuid, slug varchar) ON COMMIT DROP;
            CREATE TEMP TABLE knowledgebase (id uuid, "tenantId" uuid, "organizationId" uuid, "deletedAt" timestamptz) ON COMMIT DROP;
            CREATE TEMP TABLE plugin_application_installation (id uuid, "tenantId" uuid, "organizationId" uuid,
                "workspaceId" varchar, "pluginName" varchar, "appName" varchar, status varchar, "resourceRefs" jsonb) ON COMMIT DROP;
            CREATE TEMP TABLE app_platform_delivery ("tenantId" uuid, "organizationId" uuid, "userId" uuid,
                "readyAt" timestamptz, apps jsonb, configuration jsonb) ON COMMIT DROP`)
        await runner.query('INSERT INTO "role" VALUES ($1,$2)', [role, RolesEnum.APP_USER])
        await runner.query('INSERT INTO "user" VALUES ($1,$2,$3,true)', [user, tenant, role])
        await runner.query('INSERT INTO role_permission VALUES ($1,$2,$3,true)', [
            tenant,
            role,
            AIPermissionsEnum.CHAT_VIEW
        ])
        for (const id of [entry, child, standalone, unrelated])
            await runner.query('INSERT INTO xpert VALUES ($1,$2,$3,$4,$5)', [id, tenant, org, workspace, id])
        await runner.query('INSERT INTO plugin_application_installation VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
            installation,
            tenant,
            org,
            workspace,
            '@fixture/app',
            'test',
            'ready',
            JSON.stringify({
                assistant: entry,
                'role:internal': child,
                'role:standalone': standalone,
                'legacy:assistant': unrelated,
                'knowledgebase:images': library
            })
        ])
        for (const id of [library, otherLibrary])
            await runner.query('INSERT INTO knowledgebase VALUES ($1,$2,$3,NULL)', [id, tenant, org])
        await runner.query('INSERT INTO app_platform_delivery VALUES ($1,$2,$3,now(),$4,$5)', [
            tenant,
            org,
            user,
            JSON.stringify([{ key: 'test', status: 'ready', installationId: installation }]),
            JSON.stringify({
                definition: {
                    apps: [
                        { key: 'test', appRef: { pluginName: '@fixture/app', appName: 'test' }, entries: ['assistant'] }
                    ]
                }
            })
        ])
    })
    afterAll(async () => {
        await runner?.rollbackTransaction()
        await runner?.release()
        await database?.destroy()
    })
    async function visible(
        organizationId = org,
        parent?: string,
        organizationSource: 'context' | 'resource' = 'context'
    ) {
        const query = new SelectQueryBuilder<Xpert>(database, runner).select('xpert.id', 'id')
        query.from('xpert', 'xpert')
        applyAppPlatformPublishedFilter(query, tenant, organizationId, user, parent, organizationSource)
        const rows: Array<{ id: string }> = await query.getRawMany()
        return rows.map((row) => row.id).sort()
    }
    it('exposes all installed App Assistants even for an old main-only snapshot, excluding legacy and unrelated resources', async () => {
        expect(await visible()).toEqual(suiteIds)
    })
    it('derives delivery organization from the bound resource only when explicitly requested', async () => {
        expect(await visible(null)).toEqual([])
        expect(await visible(null, undefined, 'resource')).toEqual(suiteIds)
    })
    it.each([RolesEnum.APP_USER, RolesEnum.ADMIN, 'BID_CUSTOMER'])(
        'keeps enrollment restrictions when the role name is %s',
        async (name) => {
            await runner.query('UPDATE pg_temp."role" SET name=$1', [name])
            expect(await visible()).toEqual(suiteIds)
            expect(await visible(org, unrelated)).toEqual([])
        }
    )
    it('uses the App enable flag without requiring a separate Assistant list', async () => {
        await runner.query(
            `UPDATE pg_temp.app_platform_delivery SET configuration=configuration #- '{definition,apps,0,entries}'`
        )
        expect(await visible()).toEqual(suiteIds)
        await runner.query(
            `UPDATE pg_temp.app_platform_delivery SET configuration=jsonb_set(configuration,'{definition,apps,0,enabled}','false')`
        )
        expect(await visible()).toEqual([])
        await runner.query(
            `UPDATE pg_temp.app_platform_delivery SET configuration=configuration #- '{definition,apps,0,enabled}'`
        )
        await runner.query(
            `UPDATE pg_temp.app_platform_delivery SET configuration=jsonb_set(configuration,'{definition,apps,0,entries}','[]')`
        )
        expect(await visible()).toEqual([])
        await runner.query(
            `UPDATE pg_temp.app_platform_delivery SET configuration=configuration #- '{definition,apps,0,entries}'`
        )
    })
    it('rechecks disabled accounts and revoked chat grants for catalog and delegated access', async () => {
        await runner.query('UPDATE pg_temp."user" SET "isActive"=false')
        expect(await visible()).toEqual([])
        expect(await visible(org, entry)).toEqual([])
        await runner.query('UPDATE pg_temp."user" SET "isActive"=true')
        await runner.query('UPDATE pg_temp.role_permission SET enabled=false')
        expect(await visible()).toEqual([])
        expect(await visible(org, entry)).toEqual([])
        await runner.query('UPDATE pg_temp.role_permission SET enabled=true')
        expect(await visible()).toEqual(suiteIds)
    })
    it('keeps delegated reads inside the assigned installation', async () => {
        expect(await visible(org, entry)).toEqual(suiteIds)
        expect(await visible(org, standalone)).toEqual(suiteIds)
        expect(await visible(org, unrelated)).toEqual([])
    })
    it('rejects another organization even for the same user and tenant', async () => {
        expect(await visible(randomUUID())).toEqual([])
    })
    it('does not admit a partially prepared platform', async () => {
        await runner.query('UPDATE pg_temp.app_platform_delivery SET "readyAt"=NULL')
        expect(await visible()).toEqual([])
        await runner.query('UPDATE pg_temp.app_platform_delivery SET "readyAt"=now()')
    })
    it('retains published data access during failed upgrades but never grants failed first installations', async () => {
        await runner.query(`UPDATE pg_temp.app_platform_delivery SET apps=jsonb_set(apps,'{0,status}','"failed"')`)
        expect(await visible()).toEqual([])
        await runner.query(
            `UPDATE pg_temp.app_platform_delivery SET apps=jsonb_set(apps,'{0,appliedDigest}',to_jsonb($1::text))`,
            ['a'.repeat(64)]
        )
        expect(await visible()).toEqual(suiteIds)
        await runner.query(`UPDATE pg_temp.app_platform_delivery SET apps=jsonb_set(apps,'{0,status}','"disabled"')`)
        expect(await visible()).toEqual([])
        await runner.query(`UPDATE pg_temp.app_platform_delivery SET apps=jsonb_set(apps,'{0,status}','"ready"')`)
    })
    it('revokes access when the assigned application is disabled without deleting its resources', async () => {
        await runner.query(`UPDATE pg_temp.app_platform_delivery SET apps=jsonb_set(apps,'{0,status}','"disabled"')`)
        expect(await visible()).toEqual([])
        await runner.query(`UPDATE pg_temp.app_platform_delivery SET apps=jsonb_set(apps,'{0,status}','"ready"')`)
        expect(await visible()).toEqual(suiteIds)
    })
    it('grants only the ready application library without granting workspace authoring access', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: user,
            tenantId: tenant,
            role: { name: RolesEnum.APP_USER }
        })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(user)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenant)
        const organization = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(org)
        try {
            expect(await appPlatformKnowledgeIds(runner.manager, workspace)).toEqual([library])
            await runner.query('UPDATE pg_temp.role_permission SET enabled=false')
            expect(await appPlatformKnowledgeIds(runner.manager, workspace)).toEqual([])
            await runner.query('UPDATE pg_temp.role_permission SET enabled=true')
            await runner.query('UPDATE pg_temp."user" SET "isActive"=false')
            expect(await appPlatformKnowledgeIds(runner.manager, workspace)).toEqual([])
            await runner.query('UPDATE pg_temp."user" SET "isActive"=true')
            expect(await appPlatformKnowledgeIds(runner.manager, randomUUID())).toEqual([])
            organization.mockReturnValue(randomUUID())
            expect(await appPlatformKnowledgeIds(runner.manager, workspace)).toEqual([])
            organization.mockReturnValue(org)
            await runner.query('UPDATE pg_temp.knowledgebase SET "deletedAt"=now() WHERE id=$1', [library])
            expect(await appPlatformKnowledgeIds(runner.manager, workspace)).toEqual([])
        } finally {
            jest.restoreAllMocks()
        }
    })
})
