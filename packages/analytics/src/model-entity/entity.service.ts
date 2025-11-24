import { embeddingCubeCollectionName, generateCronExpression, ISemanticModelEntity, IUser, ScheduleTaskStatus } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext, runWithRequestContext } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { OnEvent } from '@nestjs/event-emitter'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import chalk from 'chalk'
import { CronJob } from 'cron'
import { DeepPartial, Repository } from 'typeorm'
import { BusinessAreaAwareCrudService } from '../core/crud/index'
import { SemanticModelEntity } from './entity.entity'
import { JOB_ENTITY_SYNC, MEMBERS_SYNC_NAME, TDimensionMembersSyncJob } from './types'
import { CreateVectorStoreCommand } from '../model-member'
import { EVENT_SEMANTIC_MODEL_DELETED, SemanticModelDeletedEvent } from '../model/types'

@Injectable()
export class SemanticModelEntityService extends BusinessAreaAwareCrudService<SemanticModelEntity> implements OnModuleInit {
	readonly #logger = new Logger(SemanticModelEntityService.name)

	constructor(
		@InjectRepository(SemanticModelEntity)
		entityRepository: Repository<SemanticModelEntity>,
		readonly commandBus: CommandBus,
		private readonly schedulerRegistry: SchedulerRegistry,
		@InjectQueue(JOB_ENTITY_SYNC)
		private readonly jobQueue: Queue<TDimensionMembersSyncJob>
	) {
		super(entityRepository, commandBus)
	}

	async onModuleInit() {
		const { items: jobs, total } = await this.getActiveJobs()
		jobs.filter((job) => job.schedule).forEach((job) => {
			try {
				this.scheduleCronJob(job, job.createdBy)
			} catch (err) {
				console.error(chalk.red('Schedule "' + job.name + '" error:' + getErrorMessage(err)))
			}
		})
		console.log(chalk.magenta(`Scheduled ${total} tasks for semantic model members sync`))
	}

	async getActiveJobs() {
		const {items, total} = await this.findAll({
			where: {
				status: ScheduleTaskStatus.SCHEDULED
			},
			relations: ['createdBy', 'createdBy.role']
		})
		// Processing previously running tasks, mark as cancelled.
		for await (const entity of items) {
			if (entity.job?.status === 'processing') {
				this.update(entity.id, {job: {...entity.job, status: 'cancel', error: 'Job stopped' }})
			}
		}

		return { items, total }
	}

	public async create(entity: DeepPartial<SemanticModelEntity>, ...options: any[]): Promise<SemanticModelEntity> {
		const _entity = await this.findOneOrFailByWhereOptions({
				modelId: entity.modelId,
				name: entity.name
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
			dimensions: entity.options?.vector.dimensions
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
					this.#logger.debug(`Job ${task.name} to run!`)
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

	async deleteEntity(id: string) {
		const entity = await this.findOne(id)
		
		await this.pauseSchedule(id)

		const collectionName = embeddingCubeCollectionName(entity.modelId, entity.name, false)
		const vectorStore = await this.commandBus.execute(new CreateVectorStoreCommand(collectionName))
		// Clear all dimensions
		await vectorStore?.clear()

		await this.delete(id)
	}

	@OnEvent(EVENT_SEMANTIC_MODEL_DELETED)
	async handle(event: SemanticModelDeletedEvent) {
		const id = event.id
		// Delete all entity by model id
		const {items} = await this.findAll({where: {modelId: id}})
		for await (const item of items) {
			await this.deleteEntity(item.id)
		}
	}
}