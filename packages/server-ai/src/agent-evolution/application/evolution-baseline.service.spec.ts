import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import type { CapabilityVersion, EvolutionAuditEvent } from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AgentEvolutionStore } from './agent-evolution.store'
import { EvolutionBaselineService } from './evolution-baseline.service'
import {
    ActiveCapabilityPointerEntity,
    CapabilityVersionEntity,
    EvolutionAuditEventEntity,
    EvolutionTargetEntity
} from '../entities'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        getOrganizationId: jest.fn(() => 'org-1'),
        currentUserId: jest.fn(() => 'admin-1'),
        currentRoleId: jest.fn(() => 'admin'),
        hasPermission: jest.fn(() => true)
    }
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    EvolutionBaselineRuntimeCapability: 'baselines',
    EvolutionTargetProviderRegistry: class {}
}))
jest.mock('../../shared/runtime', () => ({ RuntimeCapabilityProvider: () => () => undefined }))
jest.mock('./agent-evolution.store', () => ({ AgentEvolutionStore: class {} }))
jest.mock('../entities', () => ({
    ActiveCapabilityPointerEntity: class {},
    CapabilityVersionEntity: class {},
    EvolutionAuditEventEntity: class {},
    EvolutionTargetEntity: class {}
}))

const identity = { tenantId: 'tenant-1', organizationId: 'org-1', targetId: 'automotive.rules' }
const hash = 'a'.repeat(64)
const command = {
    ...identity,
    mode: 'initialize' as const,
    expectedRevision: 0,
    expectedHash: hash,
    reason: 'Initialize automotive rules'
}

describe('EvolutionBaselineService', () => {
    beforeEach(() => jest.mocked(RequestContext.hasPermission).mockReturnValue(true))
    async function setup() {
        let pointer: ActiveCapabilityPointerEntity | null = null
        const versions: CapabilityVersionEntity[] = []
        const audits: EvolutionAuditEvent[] = []
        const preview = { ready: true, hash, contentJson: '{"unit":"kW"}', issues: [] as string[] }
        const exported = {
            artifact: { hash, uri: 'rules:v1', schemaVersion: '1', mediaType: 'application/json' as const },
            semanticVersion: '1.0.0',
            dependencyVersionIds: []
        }
        const provider = {
            descriptor: { targetId: identity.targetId, providerKey: 'automotive', providerVersion: '1' },
            baselineExporter: {
                previewBaseline: jest.fn(async () => preview),
                exportBaseline: jest.fn(async () => structuredClone(exported)),
                readBaseline: jest.fn(async () => preview.contentJson)
            }
        }
        const pointerRepo = {
            findOne: jest.fn(async () => pointer),
            create: (value: Partial<ActiveCapabilityPointerEntity>) =>
                Object.assign(new ActiveCapabilityPointerEntity(), value),
            save: jest.fn(async (value: ActiveCapabilityPointerEntity) => {
                pointer = value
                return value
            })
        }
        const versionRepo = {
            findOne: jest.fn(async () => versions.at(-1) ?? null),
            findOneBy: jest.fn(
                async (value: { versionId: string }) =>
                    versions.find((item) => item.versionId === value.versionId) ?? null
            ),
            create: (value: Partial<CapabilityVersionEntity>) => Object.assign(new CapabilityVersionEntity(), value),
            save: jest.fn(async (value: CapabilityVersionEntity) => {
                versions.push(value)
                return value
            })
        }
        const auditRepo = {
            create: (value: { value: EvolutionAuditEvent }) => value,
            save: jest.fn(async (value: { value: EvolutionAuditEvent }) => {
                audits.push(value.value)
                return value
            })
        }
        const manager = {
            query: jest.fn(async () => []),
            getRepository: (entity: Function) => {
                if (entity === ActiveCapabilityPointerEntity) return pointerRepo
                if (entity === CapabilityVersionEntity) return versionRepo
                if (entity === EvolutionAuditEventEntity) return auditRepo
                if (entity === EvolutionTargetEntity) return { upsert: jest.fn(async () => undefined) }
                throw new Error('Unexpected repository')
            }
        }
        const dataSource = {
            transaction: jest.fn(async (work: (input: typeof manager) => Promise<unknown>) => work(manager))
        }
        const store = {
            findPointer: jest.fn(async () => pointer),
            findVersion: jest.fn(
                async (_scope: object, versionId: string) =>
                    versions.find((item) => item.versionId === versionId) ?? null
            ),
            upsertTarget: jest.fn(async () => undefined)
        }
        const module = await Test.createTestingModule({
            providers: [
                EvolutionBaselineService,
                { provide: AgentEvolutionStore, useValue: store },
                { provide: EvolutionTargetProviderRegistry, useValue: { get: () => provider } },
                { provide: getDataSourceToken(), useValue: dataSource }
            ]
        }).compile()
        return {
            service: module.get(EvolutionBaselineService),
            preview,
            exported,
            provider,
            versions,
            audits,
            pointerRepo,
            dataSource,
            store
        }
    }

    it('checks sources without exporting or writing, then initializes exactly once with an audit', async () => {
        const f = await setup()
        expect(await f.service.inspect(identity)).toMatchObject({ status: 'missing', current: null, canManage: true })
        expect(f.provider.baselineExporter.exportBaseline).not.toHaveBeenCalled()
        expect(f.dataSource.transaction).not.toHaveBeenCalled()
        const pointer = await f.service.publish(command)
        expect(pointer).toMatchObject({ revision: 1, scope: { type: 'organization', key: 'org-1' } })
        expect(await f.service.publish(command)).toEqual(pointer)
        expect(f.versions).toHaveLength(1)
        expect(f.audits).toHaveLength(1)
        expect(f.audits[0]).toMatchObject({ actorId: 'admin-1', action: 'baseline_initialize' })
    })

    it('publishes a checked source update without changing the old immutable version', async () => {
        const f = await setup()
        const before = await f.service.publish(command)
        const oldVersion: CapabilityVersion = structuredClone(f.versions[0].value)
        f.preview.hash = 'b'.repeat(64)
        f.exported.artifact.hash = f.preview.hash
        expect(await f.service.inspect(identity)).toMatchObject({ status: 'update_available' })
        const after = await f.service.publish({
            ...command,
            mode: 'update',
            expectedRevision: 1,
            expectedHash: f.preview.hash
        })
        expect(after).toMatchObject({ revision: 2, rollbackVersionId: before.activeVersionId })
        expect(f.versions[0].value).toEqual(oldVersion)
        expect(f.versions[1].sequence).toBe(2)
    })

    it('allows read-only inspection but refuses publishing without administrator permission', async () => {
        const f = await setup()
        jest.mocked(RequestContext.hasPermission).mockImplementation(
            (permission) => permission === AIPermissionsEnum.EVOLUTION_VIEW
        )
        expect(await f.service.inspect(identity)).toMatchObject({ canManage: false })
        await expect(f.service.publish(command)).rejects.toMatchObject({ status: 403 })
        expect(f.dataSource.transaction).not.toHaveBeenCalled()
    })

    it('refuses cross-organization and anonymous-scope requests before reading source data', async () => {
        const f = await setup()
        await expect(f.service.inspect({ ...identity, organizationId: 'org-2' })).rejects.toMatchObject({ status: 403 })
        await expect(f.service.publish({ ...command, tenantId: 'tenant-2' })).rejects.toMatchObject({ status: 403 })
        expect(f.provider.baselineExporter.previewBaseline).not.toHaveBeenCalled()
    })

    it('refuses initialization without published source data', async () => {
        const f = await setup()
        f.preview.ready = false
        f.preview.issues = ['published_super_bom_required']
        expect(await f.service.inspect(identity)).toMatchObject({ status: 'blocked' })
        await expect(f.service.publish(command)).rejects.toMatchObject({ status: 409 })
        expect(f.provider.baselineExporter.exportBaseline).not.toHaveBeenCalled()
    })

    it('refuses a changed source snapshot both before and during export', async () => {
        const f = await setup()
        await expect(f.service.publish({ ...command, expectedHash: 'b'.repeat(64) })).rejects.toMatchObject({
            status: 409
        })
        f.exported.artifact.hash = 'c'.repeat(64)
        await expect(f.service.publish(command)).rejects.toMatchObject({ status: 409 })
        expect(f.versions).toHaveLength(0)
    })

    it('refuses stale revisions and initialization over a different active version', async () => {
        const f = await setup()
        await f.service.publish(command)
        f.preview.hash = 'b'.repeat(64)
        f.exported.artifact.hash = f.preview.hash
        await expect(
            f.service.publish({ ...command, mode: 'update', expectedHash: f.preview.hash })
        ).rejects.toMatchObject({ status: 409 })
        await expect(
            f.service.publish({ ...command, expectedRevision: 1, expectedHash: f.preview.hash })
        ).rejects.toMatchObject({ status: 409 })
        expect(f.versions).toHaveLength(1)
    })

    it('does not replace a version published through candidate governance', async () => {
        const f = await setup()
        await f.service.publish(command)
        f.versions[0].value.sourceCandidateId = 'candidate-1'
        expect(await f.service.inspect(identity)).toMatchObject({ status: 'managed_release' })
        await expect(f.service.publish({ ...command, mode: 'update', expectedRevision: 1 })).rejects.toMatchObject({
            status: 409
        })
        expect(f.versions).toHaveLength(1)
    })
})
