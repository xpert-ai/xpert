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

export async function regenerateReferralCode(repository: Repository<ReferralCode>, tenantId: string, userId: string) {
	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
		try {
			return await repository.manager.transaction(async (manager) => {
				const transactionRepository = manager.getRepository(ReferralCode)
				const currentCode = await transactionRepository.findOne({
					where: {
						tenantId,
						userId
					},
					lock: {
						mode: 'pessimistic_write'
					}
				})
				if (!currentCode) {
					return ensureReferralCode(transactionRepository, tenantId, userId)
				}

				currentCode.code = generateDifferentReferralCode(currentCode.code)
				return transactionRepository.save(currentCode)
			})
		} catch (error) {
			if (!isUniqueViolation(error)) {
				throw error
			}
		}
	}

	throw referralCodeGenerationError()
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

	throw referralCodeGenerationError()
}

function generateDifferentReferralCode(currentCode: string) {
	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
		const candidate = generateReferralCode()
		if (candidate !== currentCode) {
			return candidate
		}
	}

	throw referralCodeGenerationError()
}

function isUniqueViolation(error: unknown) {
	const code = databaseErrorCode(error)
	return code === '23505' || code === 'SQLITE_CONSTRAINT'
}

function databaseErrorCode(error: unknown): string | null {
	if (typeof error !== 'object' || error === null) {
		return null
	}
	if ('code' in error && typeof error.code === 'string') {
		return error.code
	}
	if ('driverError' in error) {
		return databaseErrorCode(error.driverError)
	}
	return null
}

function referralCodeGenerationError() {
	return new Error(
		t('server-ai:Error.ReferralCodeGenerationFailed', {
			defaultValue: 'Unable to generate a unique invitation code.'
		})
	)
}
