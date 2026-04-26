import { normalizeTenantSubdomain } from './tenant-subdomain.util'

describe('normalizeTenantSubdomain', () => {
	it('converts spaces and punctuation into a lowercase hyphenated subdomain', () => {
		expect(normalizeTenantSubdomain('  DTT   SAA  ')).toBe('dtt-saa')
		expect(normalizeTenantSubdomain('dtt_saa')).toBe('dtt-saa')
		expect(normalizeTenantSubdomain('dtt---saa')).toBe('dtt-saa')
	})

	it('returns null when the input cannot produce a valid subdomain', () => {
		expect(normalizeTenantSubdomain('')).toBeNull()
		expect(normalizeTenantSubdomain('!!!')).toBeNull()
		expect(normalizeTenantSubdomain(undefined)).toBeNull()
	})
})
