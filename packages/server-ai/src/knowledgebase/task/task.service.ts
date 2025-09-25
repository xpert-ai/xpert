import { IKnowledgebaseTask, IKnowledgeDocument, TaskStep } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { KnowledgebaseTask } from './task.entity'
import { Knowledgebase } from '../knowledgebase.entity'

@Injectable()
export class KnowledgebaseTaskService extends TenantOrganizationAwareCrudService<KnowledgebaseTask> {
	readonly #logger = new Logger(KnowledgebaseTaskService.name)

	@InjectRepository(Knowledgebase)
	private readonly baseRepo: Repository<Knowledgebase>

	constructor(
		@InjectRepository(KnowledgebaseTask)
		private readonly taskRepo: Repository<KnowledgebaseTask>
	) {
		super(taskRepo)
	}

	/**
	 * Create a new task
	 */
	async createTask(knowledgebaseId: string, entity: Partial<IKnowledgebaseTask>): Promise<KnowledgebaseTask> {
		const knowledgebase = await this.baseRepo.findOneBy({ id: knowledgebaseId })
		if (!knowledgebase) {
			throw new Error(`Knowledgebase ${knowledgebaseId} not found`)
		}

		const steps: TaskStep[] = [
			{ name: 'load', status: 'pending', progress: 0 },
			{ name: 'preprocess', status: 'pending', progress: 0 },
			{ name: 'split', status: 'pending', progress: 0 },
			{ name: 'embed', status: 'pending', progress: 0 },
			{ name: 'store', status: 'pending', progress: 0 }
		]

		const task = await this.create({
			...entity,
			knowledgebase,
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
	): Promise<KnowledgebaseTask> {
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
		status: KnowledgebaseTask['status'],
		errorMessage?: string
	): Promise<KnowledgebaseTask> {
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
	async getLatestTaskByDocumentId(documentId: string): Promise<KnowledgebaseTask | null> {
		return this.taskRepo.findOne({
			where: { knowledgebase: { id: documentId } },
			order: { createdAt: 'DESC' }
		})
	}

	/**
	 * Update or insert documents context cache into task
	 * 
	 * @param id 
	 * @param documents 
	 */
	async upsertDocuments(id: string, documents: Partial<IKnowledgeDocument>[]): Promise<void> {
		const task = await this.taskRepo.findOneBy({ id })
		if (!task) throw new Error(`Task ${id} not found`)
		
		task.context ??= {}
		// Upsert documents
		const docMap = new Map(task.context.documents?.map(doc => [doc.id, doc]))
		for (const doc of documents) {
			if (doc.id) {
				docMap.set(doc.id, doc as IKnowledgeDocument)
			} else {
				this.#logger.warn(`Document without id cannot be upserted into task ${id}`)
			}
		}
		const updatedDocuments = Array.from(docMap.values())
		task.context.documents = updatedDocuments
		await this.taskRepo.save(task)
	}

}
