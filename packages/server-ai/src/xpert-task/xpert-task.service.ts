import { IUser, IXpertTask, XpertTaskStatus } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { runWithRequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import * as chalk from 'chalk'
import { CronJob } from 'cron'
import { from, switchMap } from 'rxjs'
import { Repository } from 'typeorm'
import { XpertAgentService } from '../xpert-agent/xpert-agent.service'
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
			this.scheduleCronJob(job, job.createdBy)
		})
		console.log(chalk.magenta(`Scheduled ${total} tasks for xpert`))
	}

	scheduleCronJob(task: IXpertTask, user: IUser) {
		runWithRequestContext({user: user, headers: {['organization-id']: task.organizationId}}, () => {
			const job = new CronJob(task.schedule, () => {
				this.#logger.warn(`time (${10}) for job ${task.name} to run!`)
				if (task.xpertId) {
					from(
						this.agentService.chatAgentJob({
							input: {
								input: task.prompt
							},
							xpertId: task.xpertId,
							agentKey: task.agentKey
						})
					)
						.pipe(switchMap((obsv) => obsv))
						.subscribe({
							error: (err) => {
								this.#logger.error(err)
							}
						})
				}
			})
	
			this.schedulerRegistry.addCronJob(task.id, job)
			job.start()
		})

		this.#logger.warn(`job ${task.name} added for '${task.schedule}'!`)
	}

	async removeTasks(tasks: XpertTask[]) {
		tasks.forEach((task) => {
			try {
				const job = this.schedulerRegistry.getCronJob(task.id)
				if (job) {
					this.schedulerRegistry.deleteCronJob(task.id)
				}
			} catch (err) {
				//
			}
		})

		await this.repository.remove(tasks)
	}

	async getActiveJobs() {
		return this.findAll({
			where: {
				status: XpertTaskStatus.RUNNING
			},
			relations: ['createdBy']
		})
	}

	async pause(id: string) {
		const task = await this.findOne(id)
		try {
			const job = this.schedulerRegistry.getCronJob(task.id)
			if (job) {
				this.schedulerRegistry.deleteCronJob(task.id)
			}
		} catch (err) {
			//
		}

		return await this.update(id, {status: XpertTaskStatus.PAUSED})
	}
}
