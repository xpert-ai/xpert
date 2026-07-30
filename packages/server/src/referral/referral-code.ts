import { randomBytes } from 'crypto'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { ReferralCode } from './referral-code.entity'

const REFERRAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const REFERRAL_CODE_LENGTH = 10
const MAX_GENERATION_ATTEMPTS = 10

export function generateReferralCode() {
	const bytes = randomBytes(REFERRAL_CODE_LENGTH)
	return Array.from(bytes, (byte) => REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length]).join('')
}

export async function ensureReferralCode(repository: Repository<ReferralCode>, tenantId: string, userId: string) {
	const existingCode = await repository.findOne({
		where: {
			tenantId,
			userId
		}
	})
	if (existingCode) {
		return existingCode
	}

	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
		await repository
			.createQueryBuilder()
			.insert()
			.into(ReferralCode)
			.values({
				tenantId,
				userId,
				code: generateReferralCode()
			})
			.orIgnore()
			.execute()

		const referralCode = await repository.findOne({
			where: {
				tenantId,
				userId
			}
		})
		if (referralCode) {
			return referralCode
		}
	}

	throw new Error(
		t('server-ai:Error.ReferralCodeGenerationFailed', {
			defaultValue: 'Unable to generate a unique invitation code.'
		})
	)
}
