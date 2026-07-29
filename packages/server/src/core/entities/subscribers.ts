import { Type } from '@nestjs/common'
import { EntitySubscriberInterface } from 'typeorm'
import { StorageFileSubscriber, TagSubscriber } from './internal'
import { ReferralCodeSubscriber } from '../../referral/referral-code.subscriber'

/**
 * A map of the core TypeORM Subscribers.
 */
export const coreSubscribers: Array<Type<EntitySubscriberInterface>> = [
	StorageFileSubscriber,
	TagSubscriber,
	ReferralCodeSubscriber
]
