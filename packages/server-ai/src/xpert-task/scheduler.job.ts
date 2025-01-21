import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { XpertTaskService } from './xpert-task.service'

export type TSchedulerType = {
	taskId: string
}

@Processor({
	name: 'xpert-task-scheduler'
})
export class TaskSchedulerProcessor {
	readonly #logger = new Logger(TaskSchedulerProcessor.name)

	constructor(
		@Inject(JOB_REF) jobRef: Job<TSchedulerType>,
		private readonly service: XpertTaskService,
		private readonly commandBus: CommandBus
	) {}

	@Process({ concurrency: 5 })
	async process(job: Job<TSchedulerType>) {
		const { taskId } = job.data
		await this.service.schedule(taskId)
	}
}
