import { UserType } from '@xpert-ai/contracts'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { User } from '../user/user.entity'
import { ensureReferralCode } from './referral-code'
import { ReferralCode } from './referral-code.entity'

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

		await ensureReferralCode(event.manager.getRepository(ReferralCode), tenantId, user.id)
	}
}
