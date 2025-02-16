import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocumentParserConfig, IKnowledgeDocument } from '@metad/contracts'
import { FileStorage, StorageFileService } from '@metad/server-core'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { GetRagWebDocCacheQuery } from '../../../rag-web'
import { KnowledgeDocumentService } from '../../document.service'
import { KnowledgeDocLoadCommand } from '../load.command'

@CommandHandler(KnowledgeDocLoadCommand)
export class KnowledgeDocLoadHandler implements ICommandHandler<KnowledgeDocLoadCommand> {
	constructor(
		private readonly service: KnowledgeDocumentService,
		private readonly storageFileService: StorageFileService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: KnowledgeDocLoadCommand): Promise<Document[]> {
		const { doc } = command.input

		if (doc.storageFileId) {
			const storageFile = await this.storageFileService.findOne(doc.storageFileId)
			
			return this.loadFile({...doc, storageFile})
		}

		return this.loadWeb(doc)
	}

	async loadWeb(doc: IKnowledgeDocument) {
		const docs = []
		for await (const page of doc.pages) {
			if (page.id) {
				docs.push({...page, metadata: { ...page.metadata, docPageId: page.id }})
			} else {
				// From cache when scraping web pages
				const _docs = await this.queryBus.execute(new GetRagWebDocCacheQuery(page.metadata.scrapeId))
				docs.push(..._docs.map((doc) => ({...doc, metadata: { ...doc.metadata, docPageId: page.id }})))
			}
		}

		return await this.splitDocuments(doc, docs)
	}

	async loadFile(doc: IKnowledgeDocument) {
		const type = doc.type || doc.storageFile.originalName.split('.').pop()
		let data: Document[]
		switch (type.toLowerCase()) {
			case 'md':
				data = await this.processMarkdown(doc)
				break
			case 'pdf':
				data = await this.processPdf(doc)
				break
			case 'epub':
				data = await this.processEpub(doc)
				break
			case 'docx':
				data = await this.processDocx(doc)
				break
			default:
				data = await this.processText(doc)
				break
		}

		return await this.splitDocuments(doc, data)
	}

	async splitDocuments(document: IKnowledgeDocument, data: Document[], parserConfig?: DocumentParserConfig) {
		let chunkSize: number, chunkOverlap: number
		if (document.parserConfig?.chunkSize) {
			chunkSize = Number(document.parserConfig.chunkSize)
			chunkOverlap = Number(document.parserConfig.chunkOverlap ?? chunkSize / 10)
		} else if (parserConfig?.chunkSize) {
			chunkSize = Number(parserConfig.chunkSize)
			chunkOverlap = Number(parserConfig.chunkOverlap ?? chunkSize / 10)
		} else {
			chunkSize = 1000
			chunkOverlap = 100
		}
		const delimiter = document.parserConfig?.delimiter || parserConfig?.delimiter
		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize,
			chunkOverlap,
			separators: delimiter?.split(' ')
		})

		return await textSplitter.splitDocuments(data)
	}

	async processMarkdown(document: IKnowledgeDocument): Promise<Document<Record<string, any>>[]> {
		return this.processText(document)
	}

	async processPdf(document: IKnowledgeDocument): Promise<Document<Record<string, any>>[]> {
		const storageProvider = new FileStorage()
			.setProvider(document.storageFile.storageProvider)
			.getProviderInstance()
		const fileBuffer = await storageProvider.getFile(document.storageFile.file)
		const loader = new PDFLoader(new Blob([fileBuffer], { type: 'pdf' }))
		const data = await loader.load()

		return await this.splitDocuments(document, data)
	}

	async processEpub(document: IKnowledgeDocument): Promise<Document<Record<string, any>>[]> {
		const storageProvider = new FileStorage()
			.setProvider(document.storageFile.storageProvider)
			.getProviderInstance()
		const filePath = storageProvider.path(document.storageFile.file)
		const loader = new EPubLoader(filePath, { splitChapters: false })
		const data = await loader.load()

		return await this.splitDocuments(document, data)
	}

	async processDocx(document: IKnowledgeDocument): Promise<Document<Record<string, any>>[]> {
		const storageProvider = new FileStorage()
			.setProvider(document.storageFile.storageProvider)
			.getProviderInstance()
		const filePath = storageProvider.path(document.storageFile.file)
		const loader = new DocxLoader(filePath)
		const data = await loader.load()

		return await this.splitDocuments(document, data)
	}

	async processText(document: IKnowledgeDocument): Promise<Document<Record<string, any>>[]> {
		const storageProvider = new FileStorage()
			.setProvider(document.storageFile.storageProvider)
			.getProviderInstance()
		const fileBuffer = await storageProvider.getFile(document.storageFile.file)

		const loader = new TextLoader(new Blob([fileBuffer], { type: 'text/plain' }))
		const data = await loader.load()

		return await this.splitDocuments(document, data)
	}
}
