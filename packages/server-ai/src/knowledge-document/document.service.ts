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
		// Complete file type
		if (!document.type) {
			if (document.storageFileId) {
				const storageFile = await this.storageFileService.findOne(document.storageFileId)
				const fileType = storageFile.originalName.split('.').pop()
				document.type = fileType
			} else if (document.options?.url) {
				document.type = 'html'
			}
		}
		return await this.create({
			...document,
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
		const document = await this.findOne(documentId, { relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot'] })
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		// const vectorStore = new KnowledgeDocumentVectorStore(document.knowledgebase, this.pgPool)
		return await vectorStore.deleteChunk(id)
	}

	async deletePage(documentId: string, id: string) {
		const document = await this.findOne(documentId, { relations: ['pages', 'knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot'] })
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		await vectorStore.delete({filter: {docPageId: id, knowledgeId: documentId}})

		document.pages = document.pages.filter((_) => _.id !== id)
		await this.save(document)
	}

}
