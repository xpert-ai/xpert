import { generateCronExpression, ISemanticModelEntity, IUser, ScheduleTaskStatus } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext, runWithRequestContext } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import chalk from 'chalk'
import { CronJob } from 'cron'
import { DeepPartial, Repository } from 'typeorm'
import { BusinessAreaAwareCrudService } from '../core/crud/index'
import { SemanticModelEntity } from './entity.entity'
import { JOB_ENTITY_SYNC, MEMBERS_SYNC_NAME } from './types'

@Injectable()
export class SemanticModelEntityService extends BusinessAreaAwareCrudService<SemanticModelEntity> {
	readonly #logger = new Logger(SemanticModelEntityService.name)

	constructor(
		@InjectRepository(SemanticModelEntity)
		entityRepository: Repository<SemanticModelEntity>,
		readonly commandBus: CommandBus,
		private readonly schedulerRegistry: SchedulerRegistry,
		@InjectQueue(JOB_ENTITY_SYNC)
		private readonly jobQueue: Queue
	) {
		super(entityRepository, commandBus)
	}

	public async create(entity: DeepPartial<SemanticModelEntity>, ...options: any[]): Promise<SemanticModelEntity> {
		const _entity = await this.findOneOrFail({
			where: {
				modelId: entity.modelId,
				name: entity.name
			}
		})

		if (_entity.success) {
			await this.update(_entity.record.id, entity)
			return this.findOne(_entity.record.id)
		} else {
			return await super.create(entity)
		}
	}

	async startSync(entity: ISemanticModelEntity) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		const job = await this.jobQueue.add(MEMBERS_SYNC_NAME, {
			tenantId,
			organizationId,
			createdById: userId,
			modelId: entity.modelId,
			entityId: entity.id,
			cube: entity.name,
			hierarchies: entity.options?.vector.hierarchies
		})

		await this.update(entity.id, {
			job: {
				id: job.id,
				status: 'processing',
				progress: 0,
				createdAt: new Date(),
			}
		})
	}

	async stopSyncJob(id: string) {
		const entity = await this.findOne(id)
		try {
			if (entity.job?.id) {
				const job = await this.jobQueue.getJob(entity.job.id)
				// cancel job
				// const lockKey = job.lockKey()
				if (job) {
					await job.discard()
					await job.moveToFailed({ message: 'Job stopped by user' }, true)
				}
			}
		} catch(err) {
			//
		}

		await this.update(entity.id, {job: {...entity.job, progress: null, status: 'cancel'}})
	}

	/**
	 * Schedule a cron job for adding sync job into queue
	 */
	scheduleCronJob(task: ISemanticModelEntity, user: IUser) {
		const cronTime = generateCronExpression(task.schedule)
		const scheduleJob = () => {
			const job = CronJob.from({
				cronTime: cronTime,
				timeZone: task.timeZone,
				onTick: () => {
					this.#logger.warn(`Job ${task.name} to run!`)
					this.startSync(task).catch((err) => {
						this.#logger.error(`Error starting sync for entity ${task.name}: ${getErrorMessage(err)}`)
					})
				}
			})

			this.schedulerRegistry.addCronJob(task.id, job)
			job.start()
		}

		if (RequestContext.currentUser()) {
			scheduleJob()
		} else {
			runWithRequestContext({ user: user, headers: { ['organization-id']: task.organizationId } }, () => {
				try {
					scheduleJob()
				} catch (err) {
					console.error(chalk.red('Schedule "' + task.name + '" error: ' + getErrorMessage(err)))
				}
			})
		}

		this.#logger.warn(`job ${task.name} added for '${cronTime}' and timezone '${task.timeZone}'!`)
	}

	rescheduleTask(task: ISemanticModelEntity, user: IUser) {
		this.deleteJob(task.id)
		this.scheduleCronJob(task, user)
	}

	deleteJob(id: string) {
		try {
			const job = this.schedulerRegistry.getCronJob(id)
			if (job) {
				this.schedulerRegistry.deleteCronJob(id)
			}
		} catch (err) {
			//
		}
	}

	async pauseSchedule(id: string) {
		const task = await this.findOne(id)
		this.deleteJob(task.id)
		return await this.update(id, { status: ScheduleTaskStatus.PAUSED })
	}

	async schedule(id: string, body: Partial<SemanticModelEntity>) {
		await this.update(id, body)
		const task = await this.findOne(id, { relations: ['createdBy', 'createdBy.role'] })
		this.rescheduleTask(task, RequestContext.currentUser() ?? task.createdBy)
		return await this.update(id, { status: ScheduleTaskStatus.SCHEDULED })
	}
}
