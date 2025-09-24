import { TaskStep } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { KnowledgeDocument } from '../document.entity'
import { KnowledgeDocumentTask } from './document-task.entity'

@Injectable()
export class KnowledgeDocumentTaskService extends TenantOrganizationAwareCrudService<KnowledgeDocumentTask> {
	readonly #logger = new Logger(KnowledgeDocumentTaskService.name)

	@InjectRepository(KnowledgeDocument)
	private readonly docRepo: Repository<KnowledgeDocument>

	constructor(
		@InjectRepository(KnowledgeDocumentTask)
		private readonly taskRepo: Repository<KnowledgeDocumentTask>
	) {
		super(taskRepo)
	}

	/**
	 * Create a new task for a document
	 */
	async createTask(documentId: string, taskType: string): Promise<KnowledgeDocumentTask> {
		const document = await this.docRepo.findOneBy({ id: documentId })
		if (!document) {
			throw new Error(`Document ${documentId} not found`)
		}

		const steps: TaskStep[] = [
			{ name: 'load', status: 'pending', progress: 0 },
			{ name: 'preprocess', status: 'pending', progress: 0 },
			{ name: 'split', status: 'pending', progress: 0 },
			{ name: 'embed', status: 'pending', progress: 0 },
			{ name: 'store', status: 'pending', progress: 0 }
		]

		const task = await this.create({
			document,
			taskType,
			status: 'pending',
			progress: 0,
			steps,
		})

		return task
	}

	/**
	 * Update progress/status of a specific step
	 */
	async updateStepProgress(
		taskId: string,
		stepName: string,
		status: TaskStep['status'],
		progress: number,
		log?: string,
		errorMessage?: string
	): Promise<KnowledgeDocumentTask> {
		const task = await this.taskRepo.findOneBy({ id: taskId })
		if (!task) throw new Error(`Task ${taskId} not found`)

		task.steps = task.steps.map((s) =>
			s.name === stepName
				? {
						...s,
						status,
						progress,
						log: log ?? s.log,
						error_message: errorMessage ?? s.error_message,
						started_at: s.started_at ?? (status === 'running' ? new Date() : s.started_at),
						finished_at: status === 'success' || status === 'failed' ? new Date() : s.finished_at
					}
				: s
		)

		// update overall progress (average of step progresses)
		task.progress = task.steps.reduce((acc, s) => acc + (s.progress ?? 0), 0) / task.steps.length

		return this.taskRepo.save(task)
	}

	/**
	 * Update overall task status
	 */
	async updateTaskStatus(
		taskId: string,
		status: KnowledgeDocumentTask['status'],
		errorMessage?: string
	): Promise<KnowledgeDocumentTask> {
		const task = await this.taskRepo.findOneBy({ id: taskId })
		if (!task) throw new Error(`Task ${taskId} not found`)

		task.status = status
		if (errorMessage) {
			task.error = errorMessage
		}
		if (status === 'success' || status === 'failed' || status === 'cancelled') {
			task.finishedAt = new Date()
		}

		return this.taskRepo.save(task)
	}

	/**
	 * Get the latest task by documentId
	 */
	async getLatestTaskByDocumentId(documentId: string): Promise<KnowledgeDocumentTask | null> {
		return this.taskRepo.findOne({
			where: { document: { id: documentId } },
			order: { createdAt: 'DESC' }
		})
	}
}
