import { ConflictException } from '@nestjs/common'
import { CheckedProposalService } from './checked-proposal.service'

describe('checked learning proposal', () => {
    const check = { snapshot: 'reviewed', baseVersionId: 'v1', eventIds: ['a', 'b', 'c'] }
    const ctx = { tenantId: 'tenant', organizationId: 'org', actorId: 'user', actorRole: 'reviewer' }
    const request = { snapshot: 'reviewed', title: 'Title', changeHypothesis: 'Hypothesis' }
    const checkProposal = jest.fn(),
        diagnose = jest.fn(),
        createProposal = jest.fn(),
        findLearningEvents = jest.fn()
    const findOneBy = jest.fn()
    const service = new CheckedProposalService(
        { checkProposal, diagnose } as never,
        { createProposal } as never,
        { findLearningEvents } as never,
        { get: () => ({ descriptor: { riskLevel: 'R2' } }) } as never,
        { findOneBy } as never
    )
    beforeEach(() => {
        jest.resetAllMocks()
        checkProposal.mockResolvedValue(check)
        diagnose.mockResolvedValue({
            clusters: [{ status: 'proposal_ready', eventIds: ['c', 'old', 'b', 'a'] }],
            diagnoses: [{ eventIds: ['b', 'a', 'c'], rootCause: 'correction' }]
        })
        findLearningEvents.mockResolvedValue([
            {
                targetId: 'target',
                value: { scope: { type: 'organization', key: 'org' }, predictionSummary: 'original' }
            }
        ])
    })
    it('creates from current eligible members even if a historical cluster has expired members in a different order', async () => {
        await service.create(ctx, 'a', request)
        expect(createProposal).toHaveBeenCalledWith(ctx, expect.objectContaining({ eventIds: ['a', 'b', 'c'] }), {
            seedId: 'a',
            snapshot: 'reviewed',
            baseVersionId: 'v1'
        })
    })
    it('returns the existing checked revision on retry without writing a second diagnosis', async () => {
        const value = { sourceKind: 'learning_events', status: 'ready', proposalId: 'existing' }
        findOneBy.mockResolvedValue({ status: 'ready', value })
        expect(await service.create(ctx, 'a', request)).toBe(value)
        expect(diagnose).not.toHaveBeenCalled()
        expect(createProposal).not.toHaveBeenCalled()
    })
    it('requires another review when the baseline or eligible evidence changes', async () => {
        checkProposal.mockResolvedValue({ ...check, snapshot: 'different' })
        await expect(service.create(ctx, 'a', request)).rejects.toThrow(ConflictException)
        expect(diagnose).not.toHaveBeenCalled()
        checkProposal.mockResolvedValue(check)
        diagnose.mockResolvedValue({
            clusters: [{ status: 'proposal_ready' }],
            diagnoses: [{ eventIds: ['a', 'b', 'd'] }]
        })
        await expect(service.create(ctx, 'a', request)).rejects.toThrow(ConflictException)
        expect(createProposal).not.toHaveBeenCalled()
    })
})
