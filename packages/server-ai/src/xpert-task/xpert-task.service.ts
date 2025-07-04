import {
	IUser,
	IXpert,
	IXpertTask,
	RolesEnum,
	TChatAgentParams,
	TChatOptions,
	XpertAgentExecutionStatusEnum,
	XpertTaskStatus
} from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { RequestContext, runWithRequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { getErrorMessage } from '@metad/server-common'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { CronJob } from 'cron'
import { from, Observable, switchMap } from 'rxjs'
import { Repository } from 'typeorm'
import { XpertAgentChatCommand } from '../xpert-agent'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { XpertAgentService } from '../xpert-agent/xpert-agent.service'
import { FindXpertQuery } from '../xpert/queries'
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
		private readonly queryBus: QueryBus,
		private readonly agentService: XpertAgentService
	) {
		super(repository)
	}

	async onModuleInit() {
		const { items: jobs, total } = await this.getActiveJobs()
		jobs.forEach((job) => {
			try {
				this.scheduleCronJob(job, job.createdBy)
			} catch(err) {
				console.error(chalk.red('Schedule "' + job.name + '" error:' + getErrorMessage(err)))
			}
		})
		console.log(chalk.magenta(`Scheduled ${total} tasks for xpert`))
	}

	async chatAgentJob(id: string, params: TChatAgentParams, options: TChatOptions) {
		const xpertId = params.xpertId
		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }, {relations: ['agent']}))
		// New execution (Run) in thread
		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				xpert: { id: xpert.id } as IXpert,
				agentKey: xpert.agent.key,
				inputs: params.input,
				status: XpertAgentExecutionStatusEnum.RUNNING
			})
		)
		// Record execution in task
		const task = await this.findOne(id)
		task.executions ??= []
		task.executions.push(execution)
		this.repository.save(task)

		// Execute chat
		const executionId = execution.id
		return await this.commandBus.execute<XpertAgentChatCommand, Observable<MessageEvent>>(
			new XpertAgentChatCommand(params.input, params.agentKey, xpert, {
				...options,
				isDraft: false,
				execution: {
					id: executionId
				},
				operation: params.operation,
				reject: params.reject,
				from: 'job'
			})
		)
	}

	scheduleCronJob(task: IXpertTask, user: IUser) {
		const MaximumRuns = 10
		let runs = 0

		const scheduleJob = () => {
			const job = CronJob.from({
				cronTime: task.schedule,
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
						from(
							this.chatAgentJob(task.id, {
								input: {
									input: task.prompt
								},
								xpertId: task.xpertId,
								agentKey: task.agentKey
							}, {
								timeZone: task.timeZone
							})
						)
							.pipe(switchMap((obsv) => obsv))
							.subscribe({
								error: (err) => {
									this.#logger.error(err)
								}
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
				} catch(err) {
					console.error(chalk.red('Schedule "' + task.name + '" error: ' + getErrorMessage(err)))
				}
			})
		}

		this.#logger.warn(`job ${task.name} added for '${task.schedule}'!`)
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
				status: XpertTaskStatus.RUNNING
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

	async updateTask(id: string, entity: Partial<IXpertTask>) {
		await super.update(id, entity)
		const task = await this.findOne(id, {relations: ['executions', 'xpert']})
		if (task.status === XpertTaskStatus.RUNNING) {
			this.rescheduleTask(task, RequestContext.currentUser())
		} else {
			this.deleteJob(task.id)
		}
		return task
	}

	async schedule(id: string) {
		const task = await this.findOne(id, { relations: ['createdBy', 'createdBy.role'] })
		this.rescheduleTask(task, RequestContext.currentUser() ?? task.createdBy)
		return await this.update(id, { status: XpertTaskStatus.RUNNING })
	}

	async pause(id: string) {
		const task = await this.findOne(id)
		this.deleteJob(task.id)
		return await this.update(id, { status: XpertTaskStatus.PAUSED })
	}
}
