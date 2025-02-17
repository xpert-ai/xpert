import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { FileStorage, StorageFile, StorageFileService } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { LoadStorageFileCommand } from '../load-storage-file.command'
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";

@CommandHandler(LoadStorageFileCommand)
export class LoadStorageFileHandler implements ICommandHandler<LoadStorageFileCommand> {
	readonly #logger = new Logger(LoadStorageFileHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly storageFileService: StorageFileService
	) {}

	public async execute(command: LoadStorageFileCommand) {
		const { id } = command

		const storageFile = await this.storageFileService.findOne(id)

		const type = storageFile.originalName.split('.').pop()
		let data: Document[]
		switch (type.toLowerCase()) {
			case 'md':
			case 'mdx':
			case 'markdown':
				data = await this.processMarkdown(storageFile)
				break
			case 'pdf':
				data = await this.processPdf(storageFile)
				break
			case 'epub':
				data = await this.processEpub(storageFile)
				break
			case 'doc':
			case 'docx':
				data = await this.processDocx(storageFile)
				break
			case 'pptx':
				data = await this.processPPT(storageFile)
				break
			case 'xlsx':
				data = await this.processExcel(storageFile)
				break
			case 'odt':
			case 'ods':
			case 'odp':
				data = await this.processOpenDocument(storageFile)
				break
			default:
				data = await this.processText(storageFile)
				break
		}

		return data
	}

	async processMarkdown(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		return this.processText(storageFile)
	}

	async processPdf(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const storageProvider = new FileStorage().setProvider(storageFile.storageProvider).getProviderInstance()
		const fileBuffer = await storageProvider.getFile(storageFile.file)
		const loader = new PDFLoader(new Blob([fileBuffer], { type: 'pdf' }))
		return await loader.load()
	}

	async processEpub(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const filePath = this.getFilePath(storageFile)
		const loader = new EPubLoader(filePath, { splitChapters: false })
		return await loader.load()
	}

	async processDocx(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const filePath = this.getFilePath(storageFile)
		const loader = new DocxLoader(filePath)
		return await loader.load()
	}

	async processText(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const storageProvider = new FileStorage().setProvider(storageFile.storageProvider).getProviderInstance()
		const fileBuffer = await storageProvider.getFile(storageFile.file)

		const loader = new TextLoader(new Blob([fileBuffer], { type: 'text/plain' }))
		return await loader.load()
	}

	async processPPT(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const path = this.getFilePath(storageFile)
		const loader = new PPTXLoader(path)
		return await loader.load()
	}

	async processExcel(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const path = this.getFilePath(storageFile)
		const loader = new PPTXLoader(path)
		return await loader.load()
	}
	async processOpenDocument(storageFile: StorageFile): Promise<Document<Record<string, any>>[]> {
		const path = this.getFilePath(storageFile)
		const loader = new PPTXLoader(path)
		return await loader.load()
	}

	getFilePath(storageFile: StorageFile) {
		const storageProvider = new FileStorage().setProvider(storageFile.storageProvider).getProviderInstance()
		const filePath = storageProvider.path(storageFile.file)
		return filePath
	}
}
