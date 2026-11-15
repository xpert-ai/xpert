import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    AnalyticsRuntimeService,
    createExecutionIdentity,
    ResolveExecutionIdentityCommand
} from '@xpert-ai/server-core'
import type { AnalyticsBinding } from '@xpert-ai/contracts'
import { ArtifactContentAccess } from '../artifact-content-access'
import { Artifact } from '../entities'
import { ArtifactUseGrant } from '../use-grants/artifact-use-grant.entity'
import { DelegatedResourceAnalysisService } from './delegated-resource-analysis.service'
import { assertDelegatedAnalysisControls } from './delegated-analysis-controls'

jest.mock('i18next', () => ({ t: (key: string) => key }))
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'issuer' }
const binding: AnalyticsBinding = {
    id: 'sales',
    source: { kind: 'definition', definitionId: 'definition', versionId: 'version' },
    providerId: 'test',
    operation: 'query',
    contractVersion: 1,
    payload: {},
    parameters: [{ name: 'region', controlId: 'region', type: 'string', required: true, defaultValue: 'east' }],
    output: { datasetId: 'sales', fields: [], grain: [] }
}
const scope = { key: 'sales', fields: ['value'], filters: [] }

describe('delegated analysis boundaries', () => {
    it('pins defaults and permits only explicitly enumerated control values', () => {
        expect(() => assertDelegatedAnalysisControls(scope, {}, {}, binding)).not.toThrow()
        expect(() => assertDelegatedAnalysisControls(scope, { region: 'west' }, {}, binding)).toThrow()
        const bounded = { ...scope, controlValues: { region: ['east', 'west'] } }
        expect(() => assertDelegatedAnalysisControls(bounded, { region: 'west' }, {}, binding)).not.toThrow()
        expect(() => assertDelegatedAnalysisControls(bounded, { region: 'secret' }, {}, binding)).toThrow()
        expect(() => assertDelegatedAnalysisControls(bounded, { region: 1 }, {}, binding)).toThrow()
        expect(() => assertDelegatedAnalysisControls(bounded, { sql: 'select' }, {}, binding)).toThrow()
    })

    async function fixture() {
        const resolve = jest.fn(async (_command: ResolveExecutionIdentityCommand) =>
            createExecutionIdentity(
                { id: actor.userId, tenantId: actor.tenantId, isActive: true },
                { ...actor, kind: 'user' }
            )
        )
        const access = jest.fn(async () => undefined),
            authorize = jest.fn(async () => undefined)
        const module = await Test.createTestingModule({
            providers: [
                DelegatedResourceAnalysisService,
                { provide: CommandBus, useValue: { execute: resolve } },
                { provide: ArtifactContentAccess, useValue: { assert: access } },
                { provide: AnalyticsRuntimeService, useValue: { authorizeGroupSharing: authorize } }
            ]
        }).compile()
        const artifact = Object.assign(new Artifact(), { id: 'artifact', ...actor, projectId: 'source' })
        const grant = Object.assign(new ArtifactUseGrant(), {
            ...actor,
            id: 'grant',
            artifactId: artifact.id,
            ownerProjectId: artifact.projectId,
            issuedById: actor.userId,
            status: 'active',
            expiresAt: new Date(Date.now() + 60_000),
            analysis: {
                execution: 'delegated_results' as const,
                mode: 'bindings' as const,
                datasets: [scope],
                allowDetails: true,
                maxRows: 20
            }
        })
        return {
            module,
            service: module.get(DelegatedResourceAnalysisService),
            grant,
            artifact,
            resolve,
            access,
            authorize
        }
    }

    it('restores only the persisted issuer and rechecks current source authority after the query', async () => {
        const f = await fixture()
        try {
            const result = await f.service.execute(f.grant, f.artifact, binding, async (executionActor) => {
                expect(executionActor).toEqual(actor)
                expect(RequestContext.currentUserId()).toBe(actor.userId)
                return 'bounded results'
            })
            expect(result).toBe('bounded results')
            expect(f.resolve).toHaveBeenCalledTimes(2)
            expect(f.resolve.mock.calls[0][0]).toMatchObject({ actor: { ...actor, kind: 'user' } })
            expect(f.access).toHaveBeenCalledTimes(2)
            expect(f.authorize).toHaveBeenCalledTimes(2)
        } finally {
            await f.module.close()
        }
    })

    it.each(['identity', 'source'])('withholds results when %s authority is revoked during execution', async (kind) => {
        const f = await fixture()
        try {
            await expect(
                f.service.execute(f.grant, f.artifact, binding, async () => {
                    if (kind === 'identity') f.resolve.mockRejectedValue(new Error('revoked'))
                    else f.authorize.mockRejectedValue(new Error('revoked'))
                    return 'never delivered'
                })
            ).rejects.toThrow('revoked')
        } finally {
            await f.module.close()
        }
    })

    it.each(['expired', 'revoked', 'tenant', 'project', 'legacy'])(
        'rejects an invalid %s grant before restoring identity',
        async (kind) => {
            const f = await fixture()
            try {
                if (kind === 'expired') f.grant.expiresAt = new Date(0)
                if (kind === 'revoked') f.grant.status = 'revoked'
                if (kind === 'tenant') f.grant.tenantId = 'other'
                if (kind === 'project') f.grant.ownerProjectId = 'other'
                if (kind === 'legacy') delete f.grant.analysis.execution
                const query = jest.fn()
                await expect(f.service.execute(f.grant, f.artifact, binding, query)).rejects.toThrow()
                expect(f.resolve).not.toHaveBeenCalled()
                expect(query).not.toHaveBeenCalled()
            } finally {
                await f.module.close()
            }
        }
    )
})
