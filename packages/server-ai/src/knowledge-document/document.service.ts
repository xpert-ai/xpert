import { IKnowledgeDocument } from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Pool } from 'pg'
import { Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService, DATABASE_POOL_TOKEN, StorageFileService, PaginationParams } from '@metad/server-core'
import { KnowledgeDocument } from './document.entity'
import { KnowledgebaseService } from '../knowledgebase'

@Injectable()
export class KnowledgeDocumentService extends TenantOrganizationAwareCrudService<KnowledgeDocument> {
	readonly #logger = new Logger(KnowledgeDocumentService.name)

	constructor(
		@InjectRepository(KnowledgeDocument)
		repository: Repository<KnowledgeDocument>,
		private readonly storageFileService: StorageFileService,
		private readonly knowledgebaseService: KnowledgebaseService,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {
		super(repository)
	}

	async createDocument(document: Partial<IKnowledgeDocument>): Promise<KnowledgeDocument> {
		const storageFile = await this.storageFileService.findOne(document.storageFileId)
		const fileType = storageFile.originalName.split('.').pop()
		return await this.create({
			...document,
			type: document.type ?? fileType
		})
	}

	async createBulk(documents: Partial<IKnowledgeDocument>[]): Promise<KnowledgeDocument[]> {
		return await Promise.all(documents.map((document) => this.createDocument(document)))
	}

	async save(document: KnowledgeDocument | KnowledgeDocument[]): Promise<KnowledgeDocument | KnowledgeDocument[]> {
		return Array.isArray(document)
			? await Promise.all(document.map((d) => this.repository.save(d)))
			: await this.repository.save(document)
	}

	async getChunks(id: string, params: PaginationParams<IKnowledgeDocument>) {
		const document = await this.findOne(id, { relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot'] })
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		// const vectorStore = new KnowledgeDocumentVectorStore(document.knowledgebase, this.pgPool)
		return await vectorStore.getChunks(id, params)
	}

	async deleteChunk(documentId: string, id: string) {
		const document = await this.findOne(id, { relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot'] })
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		// const vectorStore = new KnowledgeDocumentVectorStore(document.knowledgebase, this.pgPool)
		return await vectorStore.deleteChunk(id)
	}

	// async similaritySearch(
	// 	query: string,
	// 	options?: {
	// 		role?: AiBusinessRole
	// 		k: number
	// 		filter: KnowledgeDocumentVectorStore['filter']
	// 		score?: number
	// 		tenantId?: string
	// 		organizationId?: string
	// 	}
	// ) {
	// 	const { role, k, score, filter } = options ?? {}
	// 	const tenantId = options?.tenantId ?? RequestContext.currentTenantId()
	// 	const organizationId = options?.organizationId ?? RequestContext.getOrganizationId()

	// 	const { record: copilotRole, success } = await this.roleService.findOneOrFail({ where: { name: role } })
	// 	let knowledgebases: IKnowledgebase[] = []
	// 	if (!success) {
	// 		const result = await this.knowledgebaseService.findAll()
	// 		knowledgebases = result.items
	// 	} else {
	// 		//
	// 	}

	// 	const documents = []
	// 	const kbs = await Promise.all(
	// 		knowledgebases.map((kb) => {
	// 			return this.knowledgebaseService.getVectorStore(kb, tenantId, organizationId).then((vectorStore) => {
	// 				return vectorStore.similaritySearchWithScore(query, k, filter)
	// 			})
	// 		})
	// 	)

	// 	kbs.forEach((kb) => {
	// 		kb.forEach(([doc, score]) => {
	// 			documents.push(doc)
	// 		})
	// 	})

	// 	return documents
	// }

	// async maxMarginalRelevanceSearch(
	// 	query: string,
	// 	options?: {
	// 		role?: AiBusinessRole
	// 		k: number
	// 		filter: Record<string, any>
	// 		tenantId?: string
	// 		organizationId?: string
	// 	}
	// ) {
	// 	//
	// }
}
