import type { ResourceAnalysisPolicy } from '@xpert-ai/contracts'
import { Artifact, ArtifactVersion } from '../entities'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { ArtifactUseGrant, ArtifactUseGrantAudit } from './artifact-use-grant.entity'
import { ArtifactUseGrantService } from './artifact-use-grant.service'
import { resourceAnalysisPolicySchema } from '@xpert-ai/plugin-sdk/analytics'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'recipient' }
const policy: ResourceAnalysisPolicy = {
    execution: 'delegated_results',
    mode: 'bindings',
    datasets: [{ key: 'sales', fields: ['region'], filters: [] }],
    allowDetails: true,
    maxRows: 20
}

// Exercise the actual acceptance method; repositories stand in for the caller-owned transaction.
it.each([
    [undefined, true, undefined, true],
    ['viewer_permissions', true, false, true],
    ['delegated_results', true, undefined, false],
    ['delegated_results', true, false, false],
    ['delegated_results', true, true, true],
    ['delegated_results', false, true, false],
    ['delegated_results', undefined, true, false]
] as const)(
    'acceptance: execution=%s analysis=%s delegated=%s retains=%s',
    async (execution, acceptAnalysis, acceptDelegatedResults, retained) => {
        const proposed = { ...policy, execution }
        const grant = Object.assign(new ArtifactUseGrant(), {
            ...actor,
            id: 'grant',
            artifactId: 'artifact',
            versionId: 'version',
            ownerProjectId: 'source',
            targetGroupId: 'group',
            targetProjectId: 'target',
            status: 'offered',
            revision: 1,
            issuedById: 'issuer',
            expiresAt: new Date(Date.now() + 60_000),
            analysis: proposed
        })
        const artifact = Object.assign(new Artifact(), { ...actor, id: 'artifact', projectId: 'source', userId: null })
        const save = jest.fn(async () => grant),
            audit = jest.fn()
        const repositories = new Map<Function, object>([
            [ArtifactUseGrant, { findOne: async () => grant, save }],
            [Artifact, { findOneBy: async () => artifact }],
            [ArtifactVersion, { findOneBy: async () => ({ id: 'version' }) }],
            [XpertProject, { findOneBy: async () => ({ id: 'source', status: 'active' }) }],
            [ArtifactUseGrantAudit, { insert: audit }]
        ])
        const manager = { getRepository: (entity: Function) => repositories.get(entity) }
        const service = new ArtifactUseGrantService(
            {} as never,
            { execute: async () => ({ projectId: 'target' }) } as never,
            {} as never,
            { assertGroupUseGrant: () => undefined, assertUseGrant: async () => undefined } as never,
            {} as never
        )
        const result = await service.acceptInTransaction(
            actor,
            {
                grantId: 'grant',
                expectedRevision: 1,
                acceptAnalysis,
                acceptDelegatedResults
            },
            manager as never
        )
        expect(result.analysis).toEqual(retained ? proposed : null)
        expect(result).toMatchObject({
            status: 'active',
            revision: 2,
            acceptedById: actor.userId,
            issuedById: 'issuer'
        })
        expect(save).toHaveBeenCalledWith(result)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'accepted', revision: 2 }))
    }
)

it('restricts bounded control allowlists to explicit delegated policies', () => {
    const scoped = { ...policy, datasets: [{ ...policy.datasets[0], controlValues: { region: ['east', 'west'] } }] }
    expect(resourceAnalysisPolicySchema.safeParse(scoped).success).toBe(true)
    for (const execution of [undefined, 'viewer_permissions', 'unknown'])
        expect(resourceAnalysisPolicySchema.safeParse({ ...scoped, execution }).success).toBe(false)
    for (const values of [[], Array.from({ length: 51 }, () => 'east'), [Infinity]])
        expect(
            resourceAnalysisPolicySchema.safeParse({
                ...policy,
                datasets: [{ ...policy.datasets[0], controlValues: { region: values } }]
            }).success
        ).toBe(false)
})
