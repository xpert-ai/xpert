import { IDocumentChunk, IKnowledgeDocument, KBDocumentStatusEnum } from '@metad/contracts'
import { RequestContext, StorageFileService, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectQueue } from '@nestjs/bull'
import { DocumentSourceRegistry } from '@xpert-ai/plugin-sdk'
import { Queue } from 'bull'
import { Document } from 'langchain/document'
import { In, Repository } from 'typeorm'
import { KnowledgebaseService, TVectorSearchParams } from '../knowledgebase'
import { KnowledgeDocument } from './document.entity'
import { LoadStorageFileCommand } from '../shared'

@Injectable()
export class KnowledgeDocumentService extends TenantOrganizationAwareCrudService<KnowledgeDocument> {
	readonly #logger = new Logger(KnowledgeDocumentService.name)

	@Inject(DocumentSourceRegistry)
	private readonly docSourceRegistry: DocumentSourceRegistry;

	constructor(
		@InjectRepository(KnowledgeDocument)
		repository: Repository<KnowledgeDocument>,
		private readonly storageFileService: StorageFileService,
		private readonly knowledgebaseService: KnowledgebaseService,
		private readonly commandBus: CommandBus,
		@InjectQueue('embedding-document') private docQueue: Queue
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
			...document
		})
	}

	async createBulk(documents: Partial<IKnowledgeDocument>[]): Promise<KnowledgeDocument[]> {
		if (!documents?.length) {
			return []
		}
		return await Promise.all(documents.map((document) => this.createDocument(document)))
	}

	async save(document: KnowledgeDocument | KnowledgeDocument[]): Promise<KnowledgeDocument | KnowledgeDocument[]> {
		return Array.isArray(document)
			? await Promise.all(document.map((d) => this.repository.save(d)))
			: await this.repository.save(document)
	}

	async deletePage(documentId: string, id: string) {
		const document = await this.findOne(documentId, {
			relations: ['pages', 'knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		await vectorStore.delete({ filter: { docPageId: id, knowledgeId: documentId } })

		document.pages = document.pages.filter((_) => _.id !== id)
		await this.save(document)
	}

	async getChunks(id: string, params: TVectorSearchParams) {
		const document = await this.findOne(id, {
			relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		return await vectorStore.getChunks(id, params)
	}

	async createChunk(id: string, entity: IDocumentChunk) {
		const { vectorStore, document } = await this.getDocumentVectorStore(id)
		await vectorStore.addKnowledgeDocument(document, [
			{
				metadata: entity.metadata ?? {},
				pageContent: entity.pageContent
			}
		])
	}

	async updateChunk(documentId: string, id: string, entity: IDocumentChunk) {
		try {
			const { vectorStore, document } = await this.getDocumentVectorStore(documentId)
			return await vectorStore.updateChunk(id, {
				metadata: entity.metadata,
				pageContent: entity.pageContent
			}, document)
		} catch (err) {
			throw new BadRequestException(err.message)
		}
	}

	async deleteChunk(documentId: string, id: string) {
		const { vectorStore, document } = await this.getDocumentVectorStore(documentId)
		return await vectorStore.deleteChunk(id)
	}

	async getDocumentVectorStore(id: string) {
		const document = await this.findOne(id, {
			relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		return { document, vectorStore }
	}

	async previewFile(id: string) {
		try {
			const docs = await this.commandBus.execute<LoadStorageFileCommand, Document[]>(
				new LoadStorageFileCommand(id)
			)
			// Limit the size of the data returned for preview
			return docs.map((doc) => ({
				...doc,
				pageContent: doc.pageContent.length > 10000 ? doc.pageContent.slice(0, 10000) + ' ...' : doc.pageContent
			}))
		} catch (err) {
			throw new BadRequestException(err.message)
		}
	}

	async startProcessing(ids: string[], kbId?: string) {
		const userId = RequestContext.currentUserId()
		const where = kbId ? { knowledgebaseId: kbId, id: In(ids) } : {id: In(ids)}
		const { items } = await this.findAll({
			where
		})

		const docs = items.filter((doc) => doc.status !== KBDocumentStatusEnum.RUNNING)

		const job = await this.docQueue.add({
			userId,
			docs
		})

		docs.forEach((item) => {
			item.jobId = job.id as string
			item.status = KBDocumentStatusEnum.RUNNING
			item.processMsg = ''
			item.progress = 0
		})

		return await this.save(docs)
	}

	async delete(id: string) {
		const document = await this.findOne(id, { relations: ['knowledgebase',] })
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase, false)
		await vectorStore.deleteKnowledgeDocument(document)
		const result = await super.delete(id)
		return result
	}

	// Document source connection
	async connectDocumentSource(type: string, config: any) {
		const documentSource = this.docSourceRegistry.get(type)
		if (!documentSource) {
			throw new BadRequestException(`Document source '${type}' not found`)
		}

		try {
			const docs = await documentSource.test(config)
			
			return docs
		} catch (err) {
			this.#logger.error(`Failed to connect document source '${type}'`, err)
			throw new BadRequestException(`Failed to connect document source '${type}': ${err.message}`)
		}
	}
}
