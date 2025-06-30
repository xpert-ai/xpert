import {
	DocumentSheetParserConfig,
	DocumentTextParserConfig,
	IKnowledgeDocument,
	KBDocumentCategoryEnum
} from '@metad/contracts'
import { pick } from '@metad/server-common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { GetRagWebDocCacheQuery } from '../../../rag-web'
import { LoadStorageFileCommand, LoadStorageSheetCommand } from '../../../shared/'
import { KnowledgeDocumentService } from '../../document.service'
import { KnowledgeDocLoadCommand } from '../load.command'

@CommandHandler(KnowledgeDocLoadCommand)
export class KnowledgeDocLoadHandler implements ICommandHandler<KnowledgeDocLoadCommand> {
	constructor(
		private readonly service: KnowledgeDocumentService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: KnowledgeDocLoadCommand): Promise<Document[]> {
		const { doc } = command.input

		if (doc.category === KBDocumentCategoryEnum.Sheet) {
			const parserConfig = doc.parserConfig as DocumentSheetParserConfig
			const data = await this.commandBus.execute(new LoadStorageSheetCommand(doc.storageFileId))
			const documents: Document[] = []
			for (const row of data) {
				const metadata = { raw: row, docId: doc.id }
				documents.push(
					new Document({
						pageContent: parserConfig?.indexedFields?.length
							? JSON.stringify(pick(row, parserConfig.indexedFields))
							: JSON.stringify(row),
						metadata
					})
				)
			}
			return documents
		}

		if (doc.storageFileId) {
			const docs = await this.commandBus.execute(new LoadStorageFileCommand(doc.storageFileId))
			return await this.splitDocuments(doc, docs)
		}

		return this.loadWeb(doc)
	}

	async loadWeb(doc: IKnowledgeDocument) {
		const docs = []
		for await (const page of doc.pages) {
			if (page.id) {
				docs.push({ ...page, metadata: { ...page.metadata, docPageId: page.id } })
			} else {
				// From cache when scraping web pages
				const _docs = await this.queryBus.execute(new GetRagWebDocCacheQuery(page.metadata.scrapeId))
				docs.push(..._docs.map((doc) => ({ ...doc, metadata: { ...doc.metadata, docPageId: page.id } })))
			}
		}

		return await this.splitDocuments(doc, docs)
	}

	async splitDocuments(document: IKnowledgeDocument, data: Document[], parserConfig?: DocumentTextParserConfig) {
		// Text Preprocessing
		if (document.parserConfig?.replaceWhitespace) {
			data.forEach((doc) => {
				doc.pageContent = doc.pageContent.replace(/[\s\n\t]+/g, ' ') // Replace consecutive spaces, newlines, and tabs
			})
		}
		if (document.parserConfig?.removeSensitive) {
			data.forEach((doc) => {
				doc.pageContent = doc.pageContent.replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
				doc.pageContent = doc.pageContent.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '') // Remove email addresses
			})
		}

		// Process the document in chunks
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
}
