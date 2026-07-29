import { getMetadataArgsStorage } from 'typeorm'
import { ReferralCode } from './referral-code.entity'

describe('ReferralCode entity', () => {
	it('enforces the uppercase invitation-code alphabet at the database boundary', () => {
		const expressions = getMetadataArgsStorage()
			.checks.filter((check) => check.target === ReferralCode)
			.map((check) => check.expression)

		expect(expressions).toEqual(
			expect.arrayContaining([
				expect.stringContaining('"code" = UPPER("code")'),
				expect.stringContaining('23456789ABCDEFGHJKLMNPQRSTUVWXYZ')
			])
		)
	})
})
