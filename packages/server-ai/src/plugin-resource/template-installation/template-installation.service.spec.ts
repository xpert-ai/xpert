jest.mock('./template-readiness.service', () => ({ TemplateReadinessService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    ResolveUserOrganizationAccessCommand: class {
        constructor(public input: unknown) {}
    }
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant'),
        getOrganizationId: jest.fn(() => 'org'),
        currentUserId: jest.fn(() => 'user'),
        currentApiPrincipal: jest.fn(() => null),
        getLanguageCode: () => 'en-US'
    }
}))
jest.mock('../../shared/request-context', () => ({
    captureRequestContext: (input: unknown) => input,
    runWithCapturedRequestContext: async (_input: unknown, task: () => Promise<void>) => task()
}))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../../xpert-template/xpert-template.service', () => ({ XpertTemplateService: class {} }))
jest.mock('./template-installation.entity', () => ({ TemplateInstallationEntity: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { TemplateInstallationService } from './template-installation.service'
import { TemplateInstallationEntity } from './template-installation.entity'
import { TemplateInstallationLocks } from './template-installation-locks'
import { PluginTemplateInstallCommand } from '../commands/install-template.command'
import { PluginResourceInstallResult } from '../plugin-resource-installer.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { InstallationInput } from './template-installation.schema'
import { InstallationSourceChangedError } from './template-installation-source'
import { FindXpertQuery } from '../../xpert/queries/get-one.query'

const input: InstallationInput = {
    templateId: 'template',
    workspaceId: 'workspace',
    idempotencyKey: 'request-001',
    publish: true,
    capabilities: []
}

function harness() {
    const rows = new Map<string, TemplateInstallationEntity>()
    const locks = new Set<string>()
    const match = (row: TemplateInstallationEntity, where: object) =>
        Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)
    const copy = <T>(value: T): T => structuredClone(value)
    const repository = {
        create: (value: TemplateInstallationEntity) => ({ ...value, createdAt: new Date(), updatedAt: new Date() }),
        findOneBy: jest.fn(async (where: object) => copy([...rows.values()].find((row) => match(row, where)) ?? null)),
        findOneByOrFail: async (where: object) => {
            const row = await repository.findOneBy(where)
            if (!row) throw Error('missing')
            return row
        },
        save: async (row: TemplateInstallationEntity) => {
            row.updatedAt = new Date()
            rows.set(row.id, copy(row))
            return row
        },
        update: async (id: string, change: Partial<TemplateInstallationEntity>) => {
            rows.set(id, { ...rows.get(id), ...copy(change), updatedAt: new Date() })
        },
        findAndCount: async ({ where, skip, take }: { where: object; skip: number; take: number }) => {
            const matches = [...rows.values()].filter((row) => match(row, where))
            return [copy(matches.slice(skip, skip + take)), matches.length]
        },
        createQueryBuilder: () => {
            let row: TemplateInstallationEntity
            const builder = {
                insert: () => builder,
                values: (value: TemplateInstallationEntity) => {
                    row = value
                    return builder
                },
                orIgnore: () => builder,
                execute: async () => {
                    if (
                        ![...rows.values()].some((item) =>
                            match(item, {
                                tenantId: row.tenantId,
                                organizationId: row.organizationId,
                                userId: row.userId,
                                idempotencyKey: row.idempotencyKey
                            })
                        )
                    )
                        rows.set(row.id, copy(row))
                }
            }
            return builder
        }
    }
    const database = {
        getRepository: () => repository,
        createQueryRunner: () => ({
            manager: { getRepository: () => repository },
            connect: async () => undefined,
            release: async () => undefined,
            query: async (sql: string, parameters?: string[]) => {
                const id = parameters?.[1]
                if (sql.includes('pg_try_advisory_lock')) {
                    const locked = !locks.has(id)
                    if (locked) locks.add(id)
                    return [{ locked }]
                }
                if (sql.includes('pg_advisory_unlock')) locks.delete(id)
                return []
            }
        })
    } as unknown as DataSource
    const install = jest.fn<Promise<PluginResourceInstallResult>, [PluginTemplateInstallCommand]>(async (command) => {
        await command.bootstrap.onImported({ id: command.bootstrap.newXpertId ?? command.bootstrap.resumeXpertId })
        return {
            xpert: {
                id: command.bootstrap.newXpertId ?? command.bootstrap.resumeXpertId,
                name: 'test',
                slug: 'test',
                type: XpertTypeEnum.Agent
            },
            installations: [],
            pendingAuth: []
        }
    })
    const commands = {
        execute: jest.fn(async (command: object) =>
            command instanceof PluginTemplateInstallCommand ? install(command) : { id: 'user', tenantId: 'tenant' }
        )
    } as unknown as CommandBus
    const workspaces = { assertCanAuthor: jest.fn(async () => ({})) }
    const templates = {
        getTemplateDetail: jest.fn(async () => ({ id: 'template', export_data: 'test', dependencies: {} }))
    }
    const queries = { execute: jest.fn(async (query: FindXpertQuery) => ({ id: query.conditions.id })) }
    const service = new TemplateInstallationService(
        database,
        commands,
        workspaces as unknown as XpertWorkspaceAccessService,
        templates as unknown as XpertTemplateService,
        { databaseForExecution: async () => database } as TemplateInstallationLocks,
        {
            prepare: jest.fn(async () => ({
                manifest: undefined,
                readiness: { legacy: true, canInstall: true, checks: [], dependencies: [] },
                components: []
            }))
        },
        queries as unknown as QueryBus
    )
    const settle = async (id: string) => {
        for (let i = 0; i < 100 && locks.has(id); i++) await new Promise<void>((resolve) => setImmediate(resolve))
        expect(locks.has(id)).toBe(false)
        return service.get(id)
    }
    return { service, rows, locks, install, workspaces, templates, queries, settle }
}

describe('durable template installation orchestration', () => {
    beforeEach(() => {
        jest.mocked(RequestContext.currentTenantId).mockReturnValue('tenant')
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org')
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user')
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue(null)
    })
    it('concurrent duplicate requests share one operation and one installation', async () => {
        const h = harness()
        const requests = await Promise.all(Array.from({ length: 12 }, () => h.service.create(input)))
        expect(new Set(requests.map((item) => item.id)).size).toBe(1)
        const done = await h.settle(requests[0].id)
        expect(done.status).toBe('succeeded')
        expect(done.attempt).toBe(1)
        expect(h.install).toHaveBeenCalledTimes(1)
        expect((await h.service.retry(done.id)).assistantId).toBe(done.assistantId)
        expect((await h.service.create(input)).id).toBe(done.id)
        expect(h.install).toHaveBeenCalledTimes(1)
    })
    it('rejects changed input with the same key; a new key intentionally creates another Assistant', async () => {
        const h = harness()
        const first = await h.service.create(input)
        await h.settle(first.id)
        await expect(h.service.create({ ...input, publish: false })).rejects.toThrow()
        const second = await h.service.create({ ...input, idempotencyKey: 'request-002' })
        await h.settle(second.id)
        expect(h.rows.get(first.id).assistantId).not.toBe(h.rows.get(second.id).assistantId)
    })
    it('resumes the imported identity after a dependency failure; keeps pending authorization in the receipt', async () => {
        const h = harness()
        h.install.mockImplementationOnce(async (command) => {
            await command.bootstrap.onImported({ id: command.bootstrap.newXpertId })
            await command.bootstrap.onStage('dependencies')
            throw new Error('provider secret must never escape')
        })
        const first = await h.service.create(input)
        const failed = await h.settle(first.id)
        expect(failed).toMatchObject({ status: 'failed', stage: 'dependencies', retryable: true })
        expect(JSON.stringify(failed)).not.toContain('provider secret')
        expect((await h.service.create(input)).attempt).toBe(1)
        h.install.mockImplementationOnce(async (command) => {
            expect(command.bootstrap.resumeXpertId).toBe(failed.assistantId)
            expect(command.bootstrap.newXpertId).toBeUndefined()
            const resources = {
                xpert: { id: failed.assistantId },
                installations: [{ id: 'resource' }],
                pendingAuth: [{ id: 'resource' }]
            }
            await command.bootstrap.onDependenciesInstalled(resources as PluginResourceInstallResult)
            return resources as PluginResourceInstallResult
        })
        await Promise.all(Array.from({ length: 8 }, () => h.service.retry(first.id)))
        const done = await h.settle(first.id)
        expect(done).toMatchObject({
            status: 'succeeded',
            attempt: 2,
            assistantId: failed.assistantId,
            pendingAuthInstallationIds: ['resource']
        })
        expect(h.install).toHaveBeenCalledTimes(2)
    })
    it('reports an unlocked unfinished operation as interrupted and reuses its reserved identity', async () => {
        const h = harness()
        h.install.mockRejectedValueOnce(new Error('before import'))
        const first = await h.service.create(input)
        await h.settle(first.id)
        const row = h.rows.get(first.id)
        row.status = 'running'
        const interrupted = await h.service.get(first.id)
        expect(interrupted).toMatchObject({ status: 'interrupted', retryable: true, assistantId: null })
        const reserved = row.assistantId
        await h.service.retry(first.id)
        const done = await h.settle(first.id)
        expect(done.assistantId).toBe(reserved)
    })
    it('refuses to blend changed template content into an interrupted installation', async () => {
        const h = harness()
        h.install.mockRejectedValueOnce(new InstallationSourceChangedError())
        const first = await h.service.create(input)
        const failed = await h.settle(first.id)
        expect(failed).toMatchObject({ status: 'failed', retryable: false, error: { code: 'SOURCE_CHANGED' } })
        await h.service.retry(first.id)
        expect(h.install).toHaveBeenCalledTimes(1)
    })
    it.each(['user', 'organization', 'tenant'])('hides receipts across %s boundaries', async (scope) => {
        const h = harness()
        const first = await h.service.create(input)
        await h.settle(first.id)
        if (scope === 'user') jest.mocked(RequestContext.currentUserId).mockReturnValue('other')
        if (scope === 'organization') jest.mocked(RequestContext.getOrganizationId).mockReturnValue('other')
        if (scope === 'tenant') jest.mocked(RequestContext.currentTenantId).mockReturnValue('other')
        await expect(h.service.get(first.id)).rejects.toThrow()
        await expect(h.service.retry(first.id)).rejects.toThrow()
        expect((await h.service.list({ workspaceId: input.workspaceId, take: 20, skip: 0 })).total).toBe(0)
    })
    it('requires current workspace author access for reads and retries', async () => {
        const h = harness()
        const first = await h.service.create(input)
        await h.settle(first.id)
        h.workspaces.assertCanAuthor.mockRejectedValue(new Error('revoked'))
        await expect(h.service.get(first.id)).rejects.toThrow('revoked')
        await expect(h.service.retry(first.id)).rejects.toThrow('revoked')
        expect(h.install).toHaveBeenCalledTimes(1)
    })
    it.each([new NotFoundException(), new ForbiddenException()])(
        'preserves successful history when its Assistant is deleted or inaccessible (%s)',
        async (error) => {
            const h = harness()
            const first = await h.service.create(input)
            const done = await h.settle(first.id)
            expect(done.assistantAvailability).toBe('available')
            expect(h.queries.execute).toHaveBeenCalledWith(
                new FindXpertQuery({ id: done.assistantId, tenantId: 'tenant', organizationId: 'org' })
            )
            h.queries.execute.mockRejectedValue(error)
            const expected = {
                id: done.id,
                assistantId: done.assistantId,
                status: 'succeeded',
                attempt: 1,
                assistantAvailability: 'unavailable',
                retryable: false,
                error: null
            }
            expect(await h.service.get(done.id)).toMatchObject(expected)
            expect((await h.service.list({ workspaceId: 'workspace', skip: 0, take: 20 })).items[0]).toMatchObject(
                expected
            )
            expect(await h.service.retry(done.id)).toMatchObject(expected)
            expect(await h.service.create(input)).toMatchObject(expected)
            expect(h.install).toHaveBeenCalledTimes(1)
            expect(h.rows.get(done.id).status).toBe('succeeded')
            h.queries.execute.mockImplementation(async (query) => ({ id: query.conditions.id }))
            const next = await h.service.create({ ...input, idempotencyKey: 'new-intent' })
            const nextDone = await h.settle(next.id)
            expect(nextDone.id).not.toBe(done.id)
            expect(nextDone.assistantId).not.toBe(done.assistantId)
            expect(nextDone.assistantAvailability).toBe('available')
        }
    )
    it('does not check a reserved identity before import or turn storage failures into an unavailable target', async () => {
        const h = harness()
        const first = await h.service.create(input)
        expect(first.assistantAvailability).toBeUndefined()
        expect(h.queries.execute).not.toHaveBeenCalled()
        const done = await h.settle(first.id)
        h.queries.execute.mockRejectedValue(new Error('database offline'))
        await expect(h.service.get(done.id)).rejects.toThrow('database offline')
        expect(h.rows.get(done.id).status).toBe('succeeded')
    })
    it('rejects missing organization context and scoped credentials', async () => {
        const h = harness()
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        await expect(h.service.create(input)).rejects.toThrow()
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org')
        jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({ principalType: 'api_key' })
        await expect(h.service.create(input)).rejects.toThrow()
        expect(h.rows.size).toBe(0)
    })
    it('returns a public projection without stored input, hash, reserved ID or scope identifiers', async () => {
        const h = harness()
        const first = await h.service.create(input)
        for (const field of [
            'input',
            'sourceHash',
            'requestHash',
            'userId',
            'tenantId',
            'organizationId',
            'idempotencyKey'
        ])
            expect(first).not.toHaveProperty(field)
        await h.settle(first.id)
    })
})
