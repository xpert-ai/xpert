import { generateCronExpression, IUser, IXpertTask, RolesEnum, TChatOptions, XpertTaskStatus } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'
import { RequestContext, runWithRequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { CronJob } from 'cron'
import { Repository } from 'typeorm'
import { XpertChatCommand } from '../xpert/commands'
import { XpertTask } from './xpert-task.entity'

@Injectable()
export class XpertTaskService extends TenantOrganizationAwareCrudService<XpertTask> implements OnModuleInit {
	readonly #logger = new Logger(XpertTaskService.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	constructor(
		@InjectRepository(XpertTask)
		repository: Repository<XpertTask>,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async onModuleInit() {
		const { items: jobs, total } = await this.getActiveJobs()
		jobs.forEach((job) => {
			try {
				this.scheduleCronJob(job, job.createdBy)
			} catch (err) {
				console.error(chalk.red('Schedule "' + job.name + '" error:' + getErrorMessage(err)))
			}
		})
		console.log(chalk.magenta(`Scheduled ${total} tasks for xpert`))
	}

	async executeTask(id: string, options: TChatOptions) {
		const task = await this.findOne(id, { relations: ['xpert'] })
		const observable = await this.commandBus.execute(
			new XpertChatCommand(
				{
					input: {
						input: task.prompt
					},
					xpertId: task.xpertId
				},
				{
					...options,
					timeZone: task.timeZone || options.timeZone,
					from: 'job',
					taskId: task.id
				}
			)
		)
		observable.subscribe({
			next: (message) => {
				// console.log('Test message:', message)
			},
			error: (err) => {
				this.#logger.error('Test error:', getErrorMessage(err))
			}
		})
	}

	scheduleCronJob(task: IXpertTask, user: IUser) {
		const MaximumRuns = 10
		let runs = 0

		const cronTime = task.schedule || generateCronExpression(task.options)
		const scheduleJob = () => {
			const job = CronJob.from({
				cronTime: cronTime,
				timeZone: task.timeZone,
				onTick: () => {
					runs += 1
					this.#logger.verbose(`Times (${runs}) for job ${task.name} to run!`)
					if (task.xpertId) {
						// Trial account limit
						if (RequestContext.hasRole(RolesEnum.TRIAL) && runs > MaximumRuns) {
							this.pause(task.id).catch((err) => {
								this.#logger.error(err)
							})
							return
						}

						this.executeTask(task.id, { timeZone: task.timeZone }).catch((err) => {
							this.#logger.error(err)
						})
					}
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

	async removeTasks(tasks: XpertTask[]) {
		tasks.forEach((task) => {
			this.deleteJob(task.id)
		})

		await this.repository.remove(tasks)
	}

	async getActiveJobs() {
		return this.findAll({
			where: {
				status: XpertTaskStatus.SCHEDULED
			},
			relations: ['createdBy', 'createdBy.role']
		})
	}

	rescheduleTask(task: IXpertTask, user: IUser) {
		try {
			const job = this.schedulerRegistry.getCronJob(task.id)
			if (job) {
				this.schedulerRegistry.deleteCronJob(task.id)
			}
		} catch (err) {
			//
		}

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

	/**
	 * Update task and reschedule if necessary
	 */
	async updateTask(id: string, entity: Partial<IXpertTask>) {
		await super.update(id, entity)
		const task = await this.findOne(id, { relations: ['xpert'] })
		if (task.status === XpertTaskStatus.SCHEDULED) {
			this.rescheduleTask(task, RequestContext.currentUser())
		} else {
			this.deleteJob(task.id)
		}
		return task
	}

	async schedule(id: string) {
		const task = await this.findOne(id, { relations: ['createdBy', 'createdBy.role'] })
		this.rescheduleTask(task, RequestContext.currentUser() ?? task.createdBy)
		return await this.update(id, { status: XpertTaskStatus.SCHEDULED })
	}

	async pause(id: string) {
		const task = await this.findOne(id)
		this.deleteJob(task.id)
		return await this.update(id, { status: XpertTaskStatus.PAUSED })
	}

	async archive(id: string) {
		const task = await this.findOne(id)
		this.deleteJob(task.id)
		return await this.update(id, { status: XpertTaskStatus.ARCHIVED })
	}

	async test(id: string, options: TChatOptions) {
		await this.executeTask(id, options)
	}
}
