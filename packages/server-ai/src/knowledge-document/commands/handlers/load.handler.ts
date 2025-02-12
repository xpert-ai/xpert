import { DocumentParserConfig, IKnowledgeDocument } from '@metad/contracts'
import { FileStorage } from '@metad/server-core'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { KnowledgeDocumentService } from '../../document.service'
import { KnowledgeDocLoadCommand } from '../load.command'

@CommandHandler(KnowledgeDocLoadCommand)
export class KnowledgeDocLoadHandler implements ICommandHandler<KnowledgeDocLoadCommand> {
	constructor(private readonly service: KnowledgeDocumentService) {}

	public async execute(command: KnowledgeDocLoadCommand): Promise<Document[]> {
		const { doc } = command.input

		const storageProvider = new FileStorage().setProvider(doc.storageFile.storageProvider).getProviderInstance()

		const fileBuffer = await storageProvider.getFile(doc.storageFile.file)

		const loader = new TextLoader(new Blob([fileBuffer], { type: 'text/plain' }))
		const data = await loader.load()

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
}
