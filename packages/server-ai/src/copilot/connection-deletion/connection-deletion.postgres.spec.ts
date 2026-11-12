import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConnectionReferenceKind } from '@xpert-ai/contracts'
import { ConnectionDeletionService } from './connection-deletion.service'

// Runs against a disposable database only; never reads local application database credentials.
const describePostgres = process.env.XPERT_TEST_POSTGRES === '1' ? describe : describe.skip
describePostgres('safe connection deletion (PostgreSQL)', () => {
    jest.setTimeout(60000)
    const container = `xpert-connection-delete-${randomUUID().slice(0, 8)}`
    const tenant = randomUUID(),
        organization = randomUUID(),
        connection = randomUUID(),
        provider = randomUUID()
    let database: DataSource
    let service: ConnectionDeletionService
    let started = false
    const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
    const common = `id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid, "organizationId" uuid DEFAULT '${organization}'`
    const tables = [
        'copilot_provider_model',
        'copilot_provider',
        'copilot_usage_test',
        'copilot',
        'copilot_model',
        'copilot_role_default',
        'xpert_agent',
        'xpert',
        'knowledgebase',
        'xpert_project',
        'model_gateway_publication',
        'membership_plan',
        'user_model_grant',
        'model_access_request',
        'model_execution_grant',
        'realtime_voice_session'
    ]

    beforeAll(async () => {
        docker(
            'run',
            '--rm',
            '-d',
            '--name',
            container,
            '-p',
            '127.0.0.1::5432',
            '-e',
            'POSTGRES_HOST_AUTH_METHOD=trust',
            '--tmpfs',
            '/var/lib/postgresql/data',
            'pgvector/pgvector:pg15'
        )
        started = true
        const port = Number(docker('port', container, '5432/tcp').split(':').pop())
        for (let attempt = 0; attempt < 80; attempt++) {
            try {
                docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres')
                break
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }
        database = await new DataSource({
            type: 'postgres',
            host: '127.0.0.1',
            port,
            username: 'postgres',
            database: 'postgres'
        }).initialize()
        await database.query(`
            CREATE TABLE copilot (${common}, enabled boolean NOT NULL DEFAULT false,
                "copilotModelId" uuid, "deletedAt" timestamptz, "updatedAt" timestamptz, "updatedById" uuid);
            CREATE TABLE copilot_provider (${common}, "copilotId" uuid REFERENCES copilot(id) ON DELETE CASCADE, credentials json, "providerName" varchar DEFAULT 'synthetic');
            CREATE TABLE copilot_provider_model (${common}, "providerId" uuid REFERENCES copilot_provider(id) ON DELETE CASCADE);
            CREATE TABLE copilot_usage_test (${common}, "copilotId" uuid REFERENCES copilot(id) ON DELETE CASCADE, tokens int);
            CREATE TABLE copilot_model (${common}, "copilotId" uuid REFERENCES copilot(id) ON DELETE SET NULL,
                "referencedId" uuid REFERENCES copilot_model(id));
            CREATE TABLE copilot_role_default (${common}, mode varchar, binding json);
            CREATE TABLE xpert (${common}, latest boolean, "deletedAt" timestamptz, "copilotModelId" uuid,
                draft json, graph json, options json, "agentConfig" json);
            CREATE TABLE xpert_agent (${common}, "teamId" uuid, "xpertId" uuid, "copilotModelId" uuid, options json);
            CREATE TABLE knowledgebase (${common}, "deletedAt" timestamptz, "copilotModelId" uuid, "chatModelId" uuid,
                "wikiModelId" uuid, "pendingCopilotModelId" uuid, "rerankModelId" uuid, "visionModelId" uuid);
            CREATE TABLE xpert_project (${common}, "copilotModelId" uuid);
            CREATE TABLE model_gateway_publication (${common}, "copilotId" uuid);
            CREATE TABLE membership_plan (${common}, "allowedModels" json);
            CREATE TABLE user_model_grant (${common}, "copilotId" uuid, status varchar, "validUntil" timestamptz);
            CREATE TABLE model_access_request (${common}, "copilotId" uuid, status varchar);
            CREATE TABLE model_execution_grant (${common}, models jsonb, status varchar,
                "expiresAt" timestamptz, "absoluteExpiresAt" timestamptz);
            CREATE TABLE realtime_voice_session (${common}, "modelSnapshot" jsonb, status varchar, "expiresAt" timestamptz);
        `)
        service = new ConnectionDeletionService(database)
    })
    afterAll(async () => {
        await database?.destroy()
        if (started) docker('rm', '-f', container)
    })
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenant)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organization)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(randomUUID())
        await database.query(`TRUNCATE ${tables.join(', ')} CASCADE`)
        await database.query('INSERT INTO copilot (id, "tenantId", "organizationId") VALUES ($1,$2,$3)', [
            connection,
            tenant,
            organization
        ])
        await database.query(
            'INSERT INTO copilot_provider (id, "tenantId", "organizationId", "copilotId", credentials) VALUES ($1,$2,$3,$4,$5)',
            [provider, tenant, organization, connection, { api_key: 'synthetic' }]
        )
        await database.query('INSERT INTO copilot_provider_model ("tenantId", "providerId") VALUES ($1,$2)', [
            tenant,
            provider
        ])
    })
    afterEach(() => jest.restoreAllMocks())

    async function bindModel() {
        const id = randomUUID()
        await database.query('INSERT INTO copilot_model (id, "tenantId", "copilotId") VALUES ($1,$2,$3)', [
            id,
            tenant,
            connection
        ])
        return id
    }
    async function remains() {
        expect(
            await database.query('SELECT id FROM copilot WHERE id=$1 AND "deletedAt" IS NULL', [connection])
        ).toHaveLength(1)
        expect(await database.query('SELECT id FROM copilot_provider WHERE id=$1', [provider])).toHaveLength(1)
    }

    it('purges only the selected credentials/custom models and preserves history and other connections', async () => {
        const other = randomUUID(),
            otherProvider = randomUUID(),
            otherModel = randomUUID(),
            model = await bindModel()
        await database.query('INSERT INTO copilot (id,"tenantId","organizationId",enabled) VALUES ($1,$2,$3,true)', [
            other,
            tenant,
            organization
        ])
        await database.query(
            'INSERT INTO copilot_provider (id,"tenantId","organizationId","copilotId",credentials) VALUES ($1,$2,$3,$4,$5)',
            [otherProvider, tenant, organization, other, { api_key: 'other' }]
        )
        await database.query('INSERT INTO copilot_provider_model (id,"tenantId","providerId") VALUES ($1,$2,$3)', [
            otherModel,
            tenant,
            otherProvider
        ])
        await database.query('UPDATE copilot SET "copilotModelId"=$1 WHERE id=$2', [model, connection])
        const otherBefore = await database.query('SELECT * FROM copilot_provider WHERE id=$1', [otherProvider])
        await database.query('INSERT INTO copilot_usage_test ("tenantId","copilotId",tokens) VALUES ($1,$2,123)', [
            tenant,
            connection
        ])
        await database.query('INSERT INTO xpert ("tenantId",latest,"copilotModelId",graph) VALUES ($1,false,$2,$3)', [
            tenant,
            model,
            { nodes: [{ copilotId: connection }] }
        ])
        expect((await service.inspect(connection)).canDelete).toBe(true)
        await service.delete(connection)
        expect(await database.query('SELECT id FROM copilot WHERE "deletedAt" IS NULL')).toEqual([{ id: other }])
        expect(await database.query('SELECT id FROM copilot_provider')).toEqual([{ id: otherProvider }])
        expect(await database.query('SELECT id FROM copilot_provider_model')).toEqual([{ id: otherModel }])
        expect(await database.query('SELECT * FROM copilot_provider WHERE id=$1', [otherProvider])).toEqual(otherBefore)
        expect(await database.query('SELECT "updatedById" FROM copilot WHERE id=$1', [connection])).toEqual([
            { updatedById: RequestContext.currentUserId() }
        ])
        expect(await database.query('SELECT tokens FROM copilot_usage_test')).toEqual([{ tokens: 123 }])
        expect(await database.query('SELECT "copilotId" FROM copilot_model WHERE id=$1', [model])).toEqual([
            { copilotId: connection }
        ])
        expect(await database.query('SELECT latest FROM xpert')).toEqual([{ latest: false }])
        await expect(service.inspect(connection)).rejects.toBeInstanceOf(NotFoundException)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(NotFoundException)
        expect(() => service.rejectRestore()).toThrow(ConflictException)
    })

    it('enforces management permission and exact tenant/organization ownership before exposing counts', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        await expect(service.inspect(connection)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ForbiddenException)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        for (const [selectedTenant, selectedOrganization] of [
            [randomUUID(), organization],
            [tenant, randomUUID()],
            [tenant, null]
        ]) {
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(selectedTenant)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(selectedOrganization)
            await expect(service.inspect(connection)).rejects.toBeInstanceOf(NotFoundException)
            await expect(service.delete(provider, 'provider')).rejects.toBeInstanceOf(NotFoundException)
        }
        await remains()
    })

    it('rechecks a re-enabled connection after preview and protects the legacy provider delete endpoint', async () => {
        expect((await service.inspect(connection)).canDelete).toBe(true)
        await database.query('UPDATE copilot SET enabled=true WHERE id=$1', [connection])
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
        await expect(service.delete(provider, 'provider')).rejects.toBeInstanceOf(ConflictException)
        await remains()
    })

    const jsonCases: [ConnectionReferenceKind, string][] = [
        ['defaults', `INSERT INTO copilot_role_default ("tenantId",mode,binding) VALUES ($1,'fixed',$2)`],
        ['assistants', `INSERT INTO xpert ("tenantId",latest,draft) VALUES ($1,true,$2)`],
        ['assistants', `INSERT INTO xpert ("tenantId",latest,graph) VALUES ($1,true,$2)`],
        ['assistants', `INSERT INTO xpert ("tenantId",latest,options) VALUES ($1,true,$2)`],
        ['assistants', `INSERT INTO xpert ("tenantId",latest,"agentConfig") VALUES ($1,true,$2)`],
        [
            'membershipPlans',
            `INSERT INTO membership_plan ("tenantId","allowedModels") VALUES ($1,jsonb_build_array($2::jsonb))`
        ],
        [
            'executions',
            `INSERT INTO model_execution_grant ("tenantId",models,status,"expiresAt","absoluteExpiresAt") VALUES ($1,jsonb_build_array($2::jsonb),'active',now()+interval '1 hour',now()+interval '2 hours')`
        ],
        [
            'voiceSessions',
            `INSERT INTO realtime_voice_session ("tenantId","modelSnapshot",status,"expiresAt") VALUES ($1,$2,'active',now()+interval '1 hour')`
        ]
    ]
    it.each(jsonCases)('blocks %s JSON references, including references created after preview', async (kind, sql) => {
        expect((await service.inspect(connection)).canDelete).toBe(true)
        await database.query(sql, [tenant, { copilotId: connection }])
        expect((await service.inspect(connection)).references[kind]).toBe(1)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
        await remains()
    })

    it.each([
        'copilotModelId',
        'chatModelId',
        'wikiModelId',
        'pendingCopilotModelId',
        'rerankModelId',
        'visionModelId'
    ])('blocks knowledgebase %s, including indirect model references', async (field) => {
        const model = await bindModel(),
            reference = randomUUID()
        await database.query('INSERT INTO copilot_model (id,"tenantId","referencedId") VALUES ($1,$2,$3)', [
            reference,
            tenant,
            model
        ])
        await database.query(`INSERT INTO knowledgebase ("tenantId","${field}") VALUES ($1,$2)`, [tenant, reference])
        expect((await service.inspect(connection)).references.knowledgebases).toBe(1)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
        await remains()
    })

    it.each([
        ['projects', 'xpert_project', ''],
        ['assistants', 'xpert', ',latest'],
        ['connections', 'copilot', '']
    ] as const)('blocks current %s model bindings', async (kind, table, extra) => {
        const model = await bindModel()
        await database.query(
            `INSERT INTO ${table} ("tenantId","copilotModelId"${extra}) VALUES ($1,$2${extra ? ',true' : ''})`,
            [tenant, model]
        )
        expect((await service.inspect(connection)).references[kind]).toBe(1)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
    })

    it('checks main and team Agent bindings in the current published Assistant', async () => {
        const assistant = randomUUID(),
            model = await bindModel()
        await database.query('INSERT INTO xpert (id,"tenantId",latest) VALUES ($1,$2,true)', [assistant, tenant])
        for (const field of ['teamId', 'xpertId']) {
            await database.query(`INSERT INTO xpert_agent ("tenantId","${field}","copilotModelId") VALUES ($1,$2,$3)`, [
                tenant,
                assistant,
                model
            ])
            expect((await service.inspect(connection)).references.assistants).toBe(1)
            await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
        }
    })

    it('blocks JSON model identities stored as relations or references', async () => {
        const model = await bindModel()
        const assistant = randomUUID()
        await database.query('INSERT INTO xpert (id,"tenantId",latest) VALUES ($1,$2,true)', [assistant, tenant])
        for (const binding of [
            { copilotModel: { copilot: { id: connection } } },
            { copilotModel: { referencedId: model } },
            { copilotModelId: model },
            { copilotModel: { id: model } }
        ]) {
            await database.query('UPDATE xpert SET graph=$1 WHERE id=$2', [{ nodes: [{ entity: binding }] }, assistant])
            expect((await service.inspect(connection)).references.assistants).toBe(1)
            await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
        }
    })

    it.each([
        ['gateways', `INSERT INTO model_gateway_publication ("tenantId","copilotId") VALUES ($1,$2)`],
        ['accessGrants', `INSERT INTO user_model_grant ("tenantId","copilotId",status) VALUES ($1,$2,'active')`],
        [
            'accessRequests',
            `INSERT INTO model_access_request ("tenantId","copilotId",status) VALUES ($1,$2,'requested')`
        ]
    ] as const)('blocks %s until cleared', async (kind, sql) => {
        await database.query(sql, [tenant, connection])
        expect((await service.inspect(connection)).references[kind]).toBe(1)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
    })

    it('ignores expired/revoked access and ended sessions without deleting their history', async () => {
        await database.query(
            `INSERT INTO user_model_grant ("tenantId","copilotId",status,"validUntil") VALUES ($1,$2,'active',now()-interval '1 hour'),($1,$2,'revoked',null)`,
            [tenant, connection]
        )
        await database.query(
            `INSERT INTO model_access_request ("tenantId","copilotId",status) VALUES ($1,$2,'closed')`,
            [tenant, connection]
        )
        await database.query(
            `INSERT INTO realtime_voice_session ("tenantId","modelSnapshot",status,"expiresAt") VALUES ($1,$2,'ended',now()+interval '1 hour')`,
            [tenant, { copilotId: connection }]
        )
        await service.delete(provider, 'provider')
        expect(await database.query('SELECT id FROM user_model_grant')).toHaveLength(2)
        expect(await database.query('SELECT id FROM model_access_request')).toHaveLength(1)
        expect(await database.query('SELECT id FROM realtime_voice_session')).toHaveLength(1)
    })

    it('checks organization references to a tenant connection but excludes another tenant', async () => {
        await database.query('UPDATE copilot SET "organizationId"=NULL WHERE id=$1', [connection])
        await database.query('UPDATE copilot_provider SET "organizationId"=NULL WHERE id=$1', [provider])
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        await database.query(
            `INSERT INTO copilot_role_default ("tenantId","organizationId",mode,binding) VALUES ($1,$2,'fixed',$3)`,
            [randomUUID(), organization, { copilotId: connection }]
        )
        expect((await service.inspect(connection)).canDelete).toBe(true)
        await database.query(
            `INSERT INTO copilot_role_default ("tenantId","organizationId",mode,binding) VALUES ($1,$2,'fixed',$3)`,
            [tenant, organization, { copilotId: connection }]
        )
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
    })

    const scopedReferences: [ConnectionReferenceKind, string, string, string][] = [
        ['defaults', 'copilot_role_default', 'mode,binding', `'fixed',jsonb_build_object('copilotId',c::text)`],
        ['assistants', 'xpert', 'latest,graph', `true,jsonb_build_object('copilotId',c::text)`],
        ['knowledgebases', 'knowledgebase', '"chatModelId"', 'm'],
        ['projects', 'xpert_project', '"copilotModelId"', 'm'],
        ['connections', 'copilot', '"copilotModelId"', 'm'],
        ['gateways', 'model_gateway_publication', '"copilotId"', 'c'],
        [
            'membershipPlans',
            'membership_plan',
            '"allowedModels"',
            `jsonb_build_array(jsonb_build_object('copilotId',c::text))`
        ],
        ['accessGrants', 'user_model_grant', '"copilotId",status', `c,'active'`],
        ['accessRequests', 'model_access_request', '"copilotId",status', `c,'requested'`],
        [
            'executions',
            'model_execution_grant',
            'models,status,"expiresAt","absoluteExpiresAt"',
            `jsonb_build_array(jsonb_build_object('copilotId',c::text)),'active',now()+interval '1 hour',now()+interval '2 hours'`
        ],
        [
            'voiceSessions',
            'realtime_voice_session',
            '"modelSnapshot",status,"expiresAt"',
            `jsonb_build_object('copilotId',c::text),'active',now()+interval '1 hour'`
        ]
    ]

    it.each(scopedReferences)(
        'checks only owning-organization %s references for an organization connection',
        async (kind, table, columns, values) => {
            const model = await bindModel()
            const insert = `WITH input(t,o,c,m) AS (VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid))
                INSERT INTO ${table} ("tenantId","organizationId",${columns}) SELECT t,o,${values} FROM input`
            for (const otherOrganization of [null, randomUUID()]) {
                await database.query(insert, [tenant, otherOrganization, connection, model])
            }
            const impact = await service.inspect(connection)
            expect(impact.canDelete).toBe(true)
            expect(impact.references[kind]).toBe(0)
            await database.query(insert, [tenant, organization, connection, model])
            expect((await service.inspect(connection)).references[kind]).toBe(1)
            await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
            await remains()
        }
    )

    it.each(scopedReferences)(
        'retains cross-organization %s protection for a tenant connection',
        async (kind, table, columns, values) => {
            await database.query('UPDATE copilot SET "organizationId"=NULL WHERE id=$1', [connection])
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
            const model = await bindModel()
            await database.query(
                `WITH input(t,o,c,m) AS (VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid))
                INSERT INTO ${table} ("tenantId","organizationId",${columns}) SELECT t,o,${values} FROM input`,
                [tenant, randomUUID(), connection, model]
            )
            expect((await service.inspect(connection)).references[kind]).toBe(1)
            await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
            await remains()
        }
    )

    it('keeps Agent documents and the recursive model set within the owning organization', async () => {
        const model = await bindModel(),
            foreignModel = randomUUID(),
            foreignReference = randomUUID(),
            otherOrganization = randomUUID(),
            assistant = randomUUID(),
            agent = randomUUID()
        await database.query(
            'INSERT INTO copilot_model (id,"tenantId","organizationId","copilotId","referencedId") VALUES ($1,$2,$3,$4,NULL),($5,$2,$3,NULL,$6)',
            [foreignModel, tenant, otherOrganization, connection, foreignReference, model]
        )
        await database.query('INSERT INTO xpert (id,"tenantId",latest,graph) VALUES ($1,$2,true,$3)', [
            assistant,
            tenant,
            { nodes: [{ copilotModelId: foreignModel }, { referencedId: foreignReference }] }
        ])
        await database.query(
            'INSERT INTO xpert_agent (id,"tenantId","organizationId","teamId",options) VALUES ($1,$2,$3,$4,$5)',
            [agent, tenant, otherOrganization, assistant, { copilotId: connection }]
        )
        expect((await service.inspect(connection)).canDelete).toBe(true)
        await database.query('UPDATE xpert_agent SET "organizationId"=$1 WHERE id=$2', [organization, agent])
        expect((await service.inspect(connection)).references.assistants).toBe(1)
    })

    it('retains indirect organization model references in Agents for tenant connections', async () => {
        await database.query('UPDATE copilot SET "organizationId"=NULL WHERE id=$1', [connection])
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const model = await bindModel(),
            indirect = randomUUID(),
            otherOrganization = randomUUID(),
            assistant = randomUUID()
        await database.query(
            'INSERT INTO copilot_model (id,"tenantId","organizationId","referencedId") VALUES ($1,$2,$3,$4)',
            [indirect, tenant, otherOrganization, model]
        )
        await database.query('INSERT INTO xpert (id,"tenantId","organizationId",latest) VALUES ($1,$2,$3,true)', [
            assistant,
            tenant,
            otherOrganization
        ])
        await database.query(
            'INSERT INTO xpert_agent ("tenantId","organizationId","teamId",options) VALUES ($1,$2,$3,$4)',
            [tenant, otherOrganization, assistant, { nested: [{ copilotModel: { id: indirect } }] }]
        )
        expect((await service.inspect(connection)).references.assistants).toBe(1)
        await expect(service.delete(connection)).rejects.toBeInstanceOf(ConflictException)
    })

    it('preserves supported JSON reference shapes and ignores unrelated scalar values', async () => {
        const model = await bindModel(),
            assistant = randomUUID()
        await database.query('INSERT INTO xpert (id,"tenantId",latest) VALUES ($1,$2,true)', [assistant, tenant])
        for (const binding of [
            { copilotId: connection },
            { copilot: { id: connection } },
            { referencedId: model },
            { copilotModelId: model },
            { copilotModel: { id: model } },
            { copilotId: [randomUUID(), connection] },
            { copilot: [{ id: connection }] },
            { copilotModelId: [randomUUID(), model] }
        ]) {
            await database.query('UPDATE xpert SET graph=$1 WHERE id=$2', [
                { nodes: [{ nested: [null, 42, binding] }] },
                assistant
            ])
            expect((await service.inspect(connection)).references.assistants).toBe(1)
        }
        await database.query('UPDATE xpert SET graph=$1 WHERE id=$2', [
            {
                nodes: [
                    null,
                    model,
                    connection,
                    { id: model, text: connection, copilotId: model, copilotModelId: connection }
                ]
            },
            assistant
        ])
        expect((await service.inspect(connection)).canDelete).toBe(true)
    })

    it('checks 1512 Assistant documents and 13 bindings within the existing deletion timeout', async () => {
        await database.query('UPDATE copilot SET "organizationId"=NULL WHERE id=$1', [connection])
        await database.query('UPDATE copilot_provider SET "organizationId"=NULL WHERE id=$1', [provider])
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const models = await Promise.all(Array.from({ length: 13 }, () => bindModel()))
        const graph = {
            nodes: Array.from({ length: 64 }, () => ({
                key: randomUUID(),
                entity: {
                    copilotModel: { id: randomUUID(), copilotId: randomUUID(), model: 'synthetic' },
                    options: { fallback: { referencedId: randomUUID() }, text: 'unrelated configuration' }
                }
            }))
        }
        await database.query(
            'INSERT INTO xpert ("tenantId",latest,graph) SELECT $1,true,$2::json FROM generate_series(1,1512)',
            [tenant, graph]
        )
        await database.query(
            'INSERT INTO xpert_agent ("tenantId","teamId",options) SELECT "tenantId",id,$1::json FROM xpert',
            [{ nested: { copilotModelId: randomUUID() } }]
        )
        // Exercise a no-match full scan under the real five-second deletion statement limit.
        await expect(service.delete(connection)).resolves.toMatchObject({ affected: 1 })
        expect(await database.query('SELECT id FROM copilot_model WHERE "copilotId"=$1', [connection])).toHaveLength(
            models.length
        )
    })

    it('rolls credential removal back if final connection removal fails', async () => {
        await database.query(`CREATE FUNCTION fail_connection_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
            CREATE TRIGGER fail_connection_delete BEFORE UPDATE ON copilot FOR EACH ROW EXECUTE FUNCTION fail_connection_delete();`)
        try {
            await expect(service.delete(connection)).rejects.toThrow('synthetic failure')
            await remains()
        } finally {
            await database.query(
                'DROP TRIGGER fail_connection_delete ON copilot; DROP FUNCTION fail_connection_delete()'
            )
        }
    })
    it('waits for concurrent reference writes and rechecks their committed result', async () => {
        const writer = database.createQueryRunner()
        await writer.connect()
        await writer.startTransaction()
        try {
            await writer.query(`INSERT INTO copilot_role_default ("tenantId",mode,binding) VALUES ($1,'fixed',$2)`, [
                tenant,
                { copilotId: connection }
            ])
            const deletion = service.delete(connection).catch((error: unknown) => error)
            let waiting = false
            for (let attempt = 0; attempt < 100; attempt++) {
                const locks: { waiting: boolean }[] = await database.query(`SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'LOCK TABLE%'
                ) AS waiting`)
                if (locks[0].waiting) {
                    waiting = true
                    break
                }
                await new Promise((resolve) => setTimeout(resolve, 10))
            }
            expect(waiting).toBe(true)
            await writer.commitTransaction()
            expect(await deletion).toBeInstanceOf(ConflictException)
            await remains()
        } finally {
            if (writer.isTransactionActive) await writer.rollbackTransaction()
            await writer.release()
        }
    })
})
