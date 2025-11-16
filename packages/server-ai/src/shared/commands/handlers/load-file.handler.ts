import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { LoadFileCommand } from '../load-file.command'

/**
 */
@CommandHandler(LoadFileCommand)
export class LoadFileHandler implements ICommandHandler<LoadFileCommand> {
	readonly #logger = new Logger(LoadFileHandler.name)

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: LoadFileCommand) {
		const { file } = command

		const type = file.filePath.split('.').pop()
		let data: Document[]
		switch (type.toLowerCase()) {
			case 'md':
			case 'mdx':
			case 'markdown':
				data = await this.processMarkdown(file.filePath)
				break
			case 'pdf':
				data = await this.processPdf(file.filePath)
				break
			case 'epub':
				data = await this.processEpub(file.filePath)
				break
			case 'doc':
			case 'docx':
				data = await this.processDoc(file.filePath)
				break
			case 'pptx':
				data = await this.processPPT(file.filePath)
				break
			case 'xlsx':
				data = await this.processExcel(file.filePath)
				break
			case 'odt':
			case 'ods':
			case 'odp':
				data = await this.processOpenDocument(file.filePath)
				break
			default:
				data = await this.processText(file.filePath)
				break
		}

		return data
	}

	async processMarkdown(url: string): Promise<Document<Record<string, any>>[]> {
		return this.processText(url)
	}

	async processPdf(url: string): Promise<Document<Record<string, any>>[]> {
		const loader = new PDFLoader(url)
		return await loader.load()
	}

	async processEpub(url: string): Promise<Document<Record<string, any>>[]> {
		const loader = new EPubLoader(url, { splitChapters: false })
		return await loader.load()
	}

	async processDoc(filePath: string): Promise<Document<Record<string, any>>[]> {
		const loader = new DocxLoader(filePath)
		return await loader.load()
	}

	async processText(url: string): Promise<Document<Record<string, any>>[]> {
		const loader = new TextLoader(url)
		return await loader.load()
	}

	async processPPT(url: string): Promise<Document<Record<string, any>>[]> {
		const loader = new PPTXLoader(url)
		return await loader.load()
	}

	async processExcel(url: string): Promise<Document<Record<string, any>>[]> {
		const loader = new PPTXLoader(url)
		return await loader.load()
	}
	async processOpenDocument(url: string): Promise<Document<Record<string, any>>[]> {
		const loader = new PPTXLoader(url)
		return await loader.load()
	}
}
