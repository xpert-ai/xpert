// Opt-in, disposable PostgreSQL fixture; no platform database or account is used.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntitySchema } from 'typeorm'
import { AnalyticsProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { UserOrganizationService } from '@xpert-ai/server-core'
import { AnalyticsDefinition, AnalyticsDefinitionVersion } from './analytics-definition.entity'
import { AnalyticsDefinitionService } from './analytics-definition.service'

const databaseTests = process.env.RUN_ANALYTICS_DATABASE_TESTS === '1' ? describe : describe.skip
databaseTests('Analytics Definition on PostgreSQL', () => {
    let db: DataSource,
        service: AnalyticsDefinitionService,
        started = false
    const container = `analytics-definition-test-${randomUUID()}`,
        password = randomUUID()
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const docker = (...args: string[]) =>
        execFileSync('docker', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, POSTGRES_PASSWORD: password }
        }).trim()
    const common = {
        id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
        tenantId: { type: 'uuid' as const },
        organizationId: { type: 'uuid' as const }
    }
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
            'POSTGRES_PASSWORD',
            '--tmpfs',
            '/var/lib/postgresql/data',
            'pgvector/pgvector:pg15'
        )
        started = true
        const port = Number(docker('port', container, '5432/tcp').split(':').at(-1))
        db = new DataSource({
            type: 'postgres',
            host: '127.0.0.1',
            port,
            username: 'postgres',
            password,
            database: 'postgres',
            synchronize: false,
            logging: false,
            entities: [
                new EntitySchema({
                    name: 'AnalyticsDefinition',
                    target: AnalyticsDefinition,
                    tableName: 'analytics_definition',
                    columns: {
                        ...common,
                        userId: { type: 'uuid' },
                        name: { type: String },
                        providerId: { type: String },
                        visibility: { type: String },
                        status: { type: String },
                        currentVersionId: { type: 'uuid', nullable: true }
                    }
                }),
                new EntitySchema({
                    name: 'AnalyticsDefinitionVersion',
                    target: AnalyticsDefinitionVersion,
                    tableName: 'analytics_definition_version',
                    columns: {
                        ...common,
                        definitionId: { type: 'uuid' },
                        versionNumber: { type: Number },
                        options: { type: 'json' },
                        sha256: { type: String }
                    }
                })
            ]
        })
        for (let attempt = 0; attempt < 60; attempt++) {
            try {
                await db.initialize()
                break
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
        }
        expect(db.isInitialized).toBe(true)
        await db.query(
            'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE "user"(id uuid PRIMARY KEY); CREATE TABLE tenant(id uuid PRIMARY KEY); CREATE TABLE organization(id uuid PRIMARY KEY)'
        )
        await db.query('INSERT INTO tenant(id) VALUES($1)', [actor.tenantId])
        await db.query('INSERT INTO organization(id) VALUES($1)', [actor.organizationId])
        const sql = readFileSync(join(__dirname, 'migrations/20261021090000-analytics-definitions.sql'), 'utf8')
        await db.query(sql)
        await db.query(sql)
        expect(
            await db.query(
                readFileSync(join(__dirname, 'migrations/checks/20261021090000-analytics-definitions.sql'), 'utf8')
            )
        ).toEqual([])
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        const module = await Test.createTestingModule({
            providers: [
                AnalyticsDefinitionService,
                { provide: getRepositoryToken(AnalyticsDefinition), useValue: db.getRepository(AnalyticsDefinition) },
                {
                    provide: getRepositoryToken(AnalyticsDefinitionVersion),
                    useValue: db.getRepository(AnalyticsDefinitionVersion)
                },
                { provide: DataSource, useValue: db },
                {
                    provide: UserOrganizationService,
                    useValue: { findMembershipByUserAndOrganization: async () => ({ isActive: true }) }
                },
                {
                    provide: AnalyticsProviderRegistry,
                    useValue: {
                        list: () => [
                            {
                                descriptor: { id: 'file.table', sourceKinds: ['definition'] },
                                configuration: { kind: 'definition' },
                                validateConfiguration: (options) => options
                            }
                        ]
                    }
                }
            ]
        }).compile()
        service = module.get(AnalyticsDefinitionService)
    }, 60000)
    afterAll(async () => {
        if (db?.isInitialized) await db.destroy()
        if (started) docker('stop', container)
        jest.restoreAllMocks()
    }, 30000)
    it('deduplicates concurrent Agent retries and rejects changed intent without rewriting versions', async () => {
        const input = {
            name: 'Generated sales',
            providerId: 'file.table',
            visibility: 'private' as const,
            options: { columns: ['sales'] }
        }
        const results = await Promise.all(Array.from({ length: 5 }, () => service.create(input, 'request-sales')))
        expect(new Set(results.map((item) => item.definition.id)).size).toBe(1)
        expect(new Set(results.map((item) => item.version.id)).size).toBe(1)
        const first = results[0]
        await expect(
            service.create({ ...input, options: { columns: ['profit'] } }, 'request-sales')
        ).rejects.toMatchObject({ status: 409 })
        const published = await service.publish(first.definition.id, {
            expectedCurrentVersionId: first.version.id,
            options: { columns: ['profit'] }
        })
        const retry = await service.create(input, 'request-sales')
        expect(retry.version.id).toBe(first.version.id)
        expect(retry.definition.currentVersionId).toBe(published.version.id)
        expect((await service.version(first.definition.id, first.version.id)).version.options).toEqual(input.options)
        expect((await service.create(input, 'another-request')).definition.id).not.toBe(first.definition.id)
    })
    it('applies the schema and serializes concurrent publication with immutable pinned reads', async () => {
        const original = await service.create({
            name: 'Sales',
            providerId: 'file.table',
            visibility: 'private',
            options: { revision: 'original' }
        })
        const source = {
            kind: 'definition' as const,
            definitionId: original.definition.id,
            versionId: original.version.id
        }
        const pinned = await service.resolve(actor, source)
        const results = await Promise.allSettled(
            ['first', 'second'].map((revision) =>
                service.publish(source.definitionId, {
                    expectedCurrentVersionId: source.versionId,
                    options: { revision }
                })
            )
        )
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const rejected = results.find((result) => result.status === 'rejected')
        expect(rejected?.status === 'rejected' && rejected.reason.getStatus()).toBe(409)
        const versions = await db
            .getRepository(AnalyticsDefinitionVersion)
            .find({ where: { definitionId: source.definitionId }, order: { versionNumber: 'ASC' } })
        expect(versions.map((version) => version.versionNumber)).toEqual([1, 2])
        expect(versions[0].options).toEqual({ revision: 'original' })
        expect((await service.get(source.definitionId)).currentVersionId).toBe(versions[1].id)
        await pinned.revalidate()
        await service.status(source.definitionId, 'archived')
        await expect(pinned.revalidate()).rejects.toThrow()
    })
})
