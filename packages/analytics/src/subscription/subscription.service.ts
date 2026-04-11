import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Subscription } from './subscription.entity'

@Injectable()
export class SubscriptionService extends TenantOrganizationAwareCrudService<Subscription> {
	constructor(
		@InjectRepository(Subscription)
		private readonly repo: Repository<Subscription>
	) {
		super(repo)
	}

	async setupJobs() {
		const subscriptions = await this.repository.find()

		// subscriptions.forEach(subscirption => {
		// 	const job = new CronJob(`${30} * * * * *`, () => {
		// 		this.logger.warn(`time (${30}) for job ${subscirption.id} to run!`);
		// 	  })
		// 	this.schedulerRegistry.addCronJob(subscirption.id, job)

		// 	job.start()
		// })
	}
}
