import { canConsumeIntegration } from './integration-sharing.policy'
import { integrationSharingSchema } from './integration-sharing.schema'
import { IIntegration } from '@xpert-ai/contracts'

const organization = '11111111-1111-4111-8111-111111111111'
const scope = { tenantId: 'tenant', organizationId: organization }
const row: Pick<IIntegration, 'tenantId' | 'organizationId' | 'sharing'> = {
	tenantId: 'tenant',
	organizationId: null,
	sharing: { visibility: 'selected-organizations', organizationIds: [organization], usages: ['bind'] }
}

describe('integration consumption policy', () => {
	it('requires same tenant, an explicit audience and the requested usage', () => {
		expect(canConsumeIntegration(row, scope, 'bind')).toBe(true)
		expect(canConsumeIntegration(row, scope, 'invoke')).toBe(false)
		expect(canConsumeIntegration(row, { ...scope, tenantId: 'foreign' }, 'bind')).toBe(false)
		expect(canConsumeIntegration(row, { ...scope, organizationId: 'other' }, 'bind')).toBe(false)
	})
	it('preserves own-organization access without exposing other organizations', () => {
		expect(canConsumeIntegration({ ...row, organizationId: organization, sharing: null }, scope, 'invoke')).toBe(
			true
		)
		expect(canConsumeIntegration({ ...row, organizationId: 'other' }, scope, 'bind')).toBe(false)
		expect(
			canConsumeIntegration({ ...row, organizationId: organization }, { ...scope, organizationId: null }, 'bind')
		).toBe(false)
	})
	it('fails closed for missing policies and immediately honors revocation', () => {
		expect(canConsumeIntegration({ ...row, sharing: null }, scope, 'bind')).toBe(false)
		expect(
			canConsumeIntegration(
				{ ...row, sharing: { ...row.sharing!, visibility: 'private', organizationIds: [] } },
				scope,
				'bind'
			)
		).toBe(false)
	})
	it('rejects ambiguous, empty, duplicated and malformed grants', () => {
		for (const policy of [
			{ visibility: 'public', organizationIds: [], usages: ['bind'] },
			{ visibility: 'selected-organizations', organizationIds: [], usages: ['bind'] },
			{ visibility: 'all-organizations', organizationIds: [], usages: [] },
			{ visibility: 'all-organizations', organizationIds: [organization], usages: ['bind'] },
			{ visibility: 'all-organizations', organizationIds: [], usages: ['bind', 'bind'] },
			{ visibility: 'private', organizationIds: [], usages: [], tenantId: 'foreign' }
		])
			expect(integrationSharingSchema.safeParse(policy).success).toBe(false)
	})
})
