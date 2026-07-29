import { UserType } from '@xpert-ai/contracts'
import { randomBytes } from 'crypto'
import { t } from 'i18next'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { User } from '../user/user.entity'
import { ReferralCode } from './referral-code.entity'

const REFERRAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const REFERRAL_CODE_LENGTH = 10
const MAX_GENERATION_ATTEMPTS = 10

export function generateReferralCode() {
	const bytes = randomBytes(REFERRAL_CODE_LENGTH)
	return Array.from(bytes, (byte) => REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length]).join('')
}

@EventSubscriber()
export class ReferralCodeSubscriber implements EntitySubscriberInterface<User> {
	listenTo() {
		return User
	}

	async afterInsert(event: InsertEvent<User>) {
		const user = event.entity
		const tenantId = user.tenantId ?? user.tenant?.id
		if (!user.id || !tenantId || user.type === UserType.COMMUNICATION) {
			return
		}

		const repository = event.manager.getRepository(ReferralCode)
		for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
			await repository
				.createQueryBuilder()
				.insert()
				.into(ReferralCode)
				.values({
					tenantId,
					userId: user.id,
					code: generateReferralCode()
				})
				.orIgnore()
				.execute()

			const referralCode = await repository.findOne({
				where: {
					tenantId,
					userId: user.id
				}
			})
			if (referralCode) {
				return
			}
		}

		throw new Error(
			t('server-ai:Error.ReferralCodeGenerationFailed', {
				defaultValue: 'Unable to generate a unique invitation code.'
			})
		)
	}
}
