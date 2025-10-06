import { IKnowledgebaseTask, IKnowledgeDocument, TaskStep } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
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
	 * Create a new task for a knowledgebase
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
			steps,
		})

		return task
	}

	/**
	 * Update or insert documents context cache into task
	 * 
	 * @param id 
	 * @param documents 
	 */
	async upsertDocuments(id: string, documents: Partial<IKnowledgeDocument>[]): Promise<IKnowledgebaseTask> {
		const task = await this.taskRepo.findOneBy({ id })
		if (!task) throw new Error(`Task ${id} not found`)
		
		task.context ??= {}
		// Upsert documents
		const docMap = new Map(task.context.documents?.map(doc => [doc.id, doc]))
		for (const doc of documents) {
			if (doc.id) {
				docMap.set(doc.id, 
					{
						...(docMap.get(doc.id) || {}),
						...doc
					} as IKnowledgeDocument)
			} else {
				this.#logger.warn(`Document without id cannot be upserted into task ${id}`)
			}
		}
		const updatedDocuments = Array.from(docMap.values())
		task.context.documents = updatedDocuments
		return await this.taskRepo.save(task)
	}
}
