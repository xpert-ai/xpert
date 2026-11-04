import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConnectionReferencesService } from '../connection-references.service'

// Real SQL against a disposable database; never use the application's data or credentials.
const describePostgres = process.env.XPERT_TEST_POSTGRES === '1' ? describe : describe.skip
describePostgres('connection disable inventory (PostgreSQL)', () => {
    jest.setTimeout(60000)
    const container = `xpert-impact-${randomUUID().slice(0, 8)}`
    const tenant = randomUUID(),
        organization = randomUUID(),
        connection = randomUUID()
    let database: DataSource
    let service: ConnectionReferencesService
    let started = false
    const docker = (...args: string[]) =>
        execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const common = 'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid, "organizationId" uuid'
    const tables = [
        'copilot',
        'copilot_model',
        'copilot_role_default',
        'xpert',
        'xpert_agent',
        'knowledgebase',
        'xpert_project'
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
            CREATE TABLE copilot (${common}, name text, "copilotModelId" uuid, "deletedAt" timestamptz);
            CREATE TABLE copilot_model (${common}, "copilotId" uuid, "referencedId" uuid, model text, "modelType" text);
            CREATE TABLE copilot_role_default (${common}, role text, mode text, binding json);
            CREATE TABLE xpert (${common}, name text, version text, latest boolean, "publishAt" timestamptz,
                "deletedAt" timestamptz, "copilotModelId" uuid, draft json, graph json, options json,
                "agentConfig" json, memory json, summarize json, features json, "exportedTemplate" json);
            CREATE TABLE xpert_agent (${common}, "teamId" uuid, "xpertId" uuid, "copilotModelId" uuid, options json);
            CREATE TABLE knowledgebase (${common}, name text, "deletedAt" timestamptz, "copilotModelId" uuid,
                "chatModelId" uuid, "wikiModelId" uuid, "pendingCopilotModelId" uuid, "rerankModelId" uuid, "visionModelId" uuid);
            CREATE TABLE xpert_project (${common}, name text, "copilotModelId" uuid);
        `)
        service = new ConnectionReferencesService(database)
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
        await database.query(`TRUNCATE ${tables.join(', ')}`)
        await database.query('INSERT INTO copilot (id,"tenantId","organizationId",name) VALUES ($1,$2,$3,$4)', [
            connection,
            tenant,
            organization,
            'Embedding-named connection'
        ])
    })
    afterEach(() => jest.restoreAllMocks())
    async function binding(model = 'llm', modelType = 'llm') {
        const id = randomUUID()
        await database.query(
            'INSERT INTO copilot_model (id,"tenantId","organizationId","copilotId",model,"modelType") VALUES ($1,$2,$3,$4,$5,$6)',
            [id, tenant, organization, connection, model, modelType]
        )
        return id
    }
    async function assistant(model: string | null, latest = true, draft: unknown = null) {
        const id = randomUUID()
        await database.query(
            'INSERT INTO xpert (id,"tenantId","organizationId",name,version,latest,"publishAt","copilotModelId",draft) VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8)',
            [id, tenant, organization, 'Test assistant', latest ? '2' : '1', latest, model, draft]
        )
        return id
    }
    it('splits bindings without counting models, repeated fields or historical versions as current resources', async () => {
        const current = await binding(),
            historical = await binding(),
            unresolved = await binding('reranker', 'rerank')
        const owner = await assistant(current)
        await assistant(current, false)
        await assistant(historical, false)
        await database.query('INSERT INTO xpert_agent ("tenantId","teamId","copilotModelId") VALUES ($1,$2,$3)', [
            tenant,
            owner,
            current
        ])
        const result = await service.inspect(connection)
        expect(result).toMatchObject({
            bindings: 3,
            currentResources: 1,
            historicalResources: 2,
            bindingUsage: { current: 1, historicalOnly: 1, unresolved: 1 }
        })
        expect(result.references.filter((r) => r.resourceId === owner)).toHaveLength(2)
        expect(result.references.find((r) => r.bindingId === unresolved)).toMatchObject({
            evidence: 'saved',
            modelType: 'rerank',
            organizationId: organization
        })
    })
    it('keeps nested draft snapshots, published graphs and historical JSON explicitly unresolved', async () => {
        const model = await binding()
        const owner = await assistant(null, true, {
            team: {
                graph: {
                    nodes: [
                        { copilotModel: { id: model } },
                        { copilotModel: { referencedId: model } },
                        {
                            copilotModel: {
                                copilotId: connection,
                                model: 'other',
                                modelType: 'rerank',
                                options: { api_key: 'not-for-client' }
                            }
                        }
                    ]
                }
            }
        })
        await database.query('UPDATE xpert SET graph=$1 WHERE id=$2', [
            { nodes: [{ copilotModel: { copilot: { id: connection, credentials: 'secret' }, model: 'published' } }] },
            owner
        ])
        await assistant(null, false, { team: { copilotModel: { copilotId: connection, model: 'old' } } })
        const result = await service.inspect(connection)
        expect(result).toMatchObject({
            drafts: 1,
            currentResources: 0,
            historicalResources: 0,
            jsonMatches: 5,
            bindingUsage: { current: 0, historicalOnly: 0, unresolved: 1 }
        })
        expect(
            result.references
                .filter((r) => r.evidence === 'json')
                .map((r) => r.status)
                .sort()
        ).toEqual(['draft', 'draft', 'draft', 'historical', 'published'])
        expect(result.references.some((r) => r.field.includes('["graph"]["nodes"][0]["copilotModel"]'))).toBe(true)
        expect(JSON.stringify(result)).not.toMatch(/not-for-client|secret|credentials|api_key/)
    })
    it('follows referenced bindings and deduplicates current resource identities', async () => {
        const root = await binding(),
            child = randomUUID()
        await database.query('INSERT INTO copilot_model (id,"tenantId","referencedId") VALUES ($1,$2,$3)', [
            child,
            tenant,
            root
        ])
        await assistant(child)
        await database.query('UPDATE copilot_model SET "referencedId"=$1 WHERE id=$2', [child, root])
        const result = await service.inspect(connection)
        expect(result).toMatchObject({
            bindings: 1,
            currentResources: 1,
            bindingUsage: { current: 1, historicalOnly: 0, unresolved: 0 }
        })
    })
    it('identifies defaults across the tenant and excludes inherited or disabled rows', async () => {
        await database.query(
            `INSERT INTO copilot_role_default ("tenantId","organizationId",role,mode,binding) VALUES
            ($1,NULL,'primary','fixed',$3),($1,$2,'embedding','fixed',$4),($1,$2,'secondary','inherit',$3),($1,$2,'reasoning','disabled',$3)`,
            [
                tenant,
                organization,
                { copilotId: connection, model: 'llm', modelType: 'llm' },
                { copilotId: connection, model: 'embed', modelType: 'text-embedding' }
            ]
        )
        const result = await service.inspect(connection)
        expect(result.defaults).toBe(2)
        expect(result.references.map((r) => [r.field, r.model, r.organizationId])).toEqual(
            expect.arrayContaining([
                ['role-defaults.primary', 'llm', null],
                ['role-defaults.embedding', 'embed', organization]
            ])
        )
    })
    it('covers every knowledgebase model field, projects and legacy connection bindings', async () => {
        const model = await binding()
        await database.query(
            `INSERT INTO knowledgebase ("tenantId",name,"copilotModelId","chatModelId","wikiModelId","pendingCopilotModelId","rerankModelId","visionModelId")
            VALUES ($1,'KB',$2,$2,$2,$2,$2,$2)`,
            [tenant, model]
        )
        await database.query('INSERT INTO xpert_project ("tenantId",name,"copilotModelId") VALUES ($1,$2,$3)', [
            tenant,
            'Project',
            model
        ])
        await database.query('UPDATE copilot SET "copilotModelId"=$1 WHERE id=$2', [model, connection])
        const result = await service.inspect(connection)
        expect(result.currentResources).toBe(3)
        expect(result.references.filter((r) => r.evidence === 'relation')).toHaveLength(8)
    })
    it('does not read another tenant or mismatched connection ownership', async () => {
        const model = await binding(),
            other = randomUUID()
        await database.query(
            'INSERT INTO xpert ("tenantId",name,latest,"copilotModelId",draft) VALUES ($1,$2,true,$3,$4)',
            [other, 'Other tenant', model, { team: { copilotModel: { copilotId: connection } } }]
        )
        expect((await service.inspect(connection)).references.map((r) => r.resourceName)).not.toContain('Other tenant')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(other)
        await expect(service.inspect(connection)).rejects.toBeInstanceOf(NotFoundException)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenant)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(other)
        await expect(service.inspect(connection)).rejects.toBeInstanceOf(NotFoundException)
    })
    it('requires management permission and never changes stored bindings or snapshots', async () => {
        await binding()
        await assistant(null, true, { team: { copilotModel: { copilotId: connection, model: 'llm' } } })
        const before = await database.query('SELECT row_to_json(x) AS row FROM xpert x')
        await service.inspect(connection)
        await service.inspect(connection)
        expect(await database.query('SELECT row_to_json(x) AS row FROM xpert x')).toEqual(before)
        expect(await database.query('SELECT id FROM copilot_model')).toHaveLength(1)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        await expect(service.inspect(connection)).rejects.toBeInstanceOf(ForbiddenException)
    })
})
