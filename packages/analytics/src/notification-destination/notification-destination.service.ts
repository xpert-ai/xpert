import { REDIS_CLIENT, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { RedisClientType } from 'redis'
import { Repository } from 'typeorm'
import { createNotificationDestination } from './base-destination'
import { NotificationDestination } from './notification-destination.entity'

@Injectable()
export class NotificationDestinationService extends TenantOrganizationAwareCrudService<NotificationDestination> {
	constructor(
		@InjectRepository(NotificationDestination)
		repository: Repository<NotificationDestination>,
		private configService: ConfigService,
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType
	) {
		super(repository)
	}

	async getGroups(id: string) {
		const destination = await this.repository.findOneBy({id})
		return createNotificationDestination(destination, this.redisClient).getGroups()
	}
}
