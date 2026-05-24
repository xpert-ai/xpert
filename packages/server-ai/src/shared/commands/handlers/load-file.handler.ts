import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { GetFileAssetByStorageFileQuery, GetFileAssetQuery, SearchFileChunksQuery } from '../../../file-understanding'
import { LoadFileCommand } from '../load-file.command'

/**
 * @deprecated Prefer FileUnderstanding tools/queries for parsed assets. This
 * handler keeps old callers working and only falls back to file loaders when a
 * FileAsset is not available.
 */
@CommandHandler(LoadFileCommand)
export class LoadFileHandler implements ICommandHandler<LoadFileCommand> {
    readonly #logger = new Logger(LoadFileHandler.name)

    constructor(private readonly queryBus: QueryBus) {}

    public async execute(command: LoadFileCommand) {
        const { file } = command
        const understoodDocs = await this.tryLoadFileUnderstandingDocs(file as any)
        if (understoodDocs?.length) {
            return understoodDocs
        }

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

    private async tryLoadFileUnderstandingDocs(file: {
        fileId?: string
        fileAssetId?: string
        storageFileId?: string
        id?: string
    }) {
        const fileAssetId = file.fileId ?? file.fileAssetId
        const fileAsset = fileAssetId
            ? await this.queryBus.execute(new GetFileAssetQuery(fileAssetId))
            : (file.storageFileId ?? file.id)
              ? await this.queryBus.execute(new GetFileAssetByStorageFileQuery(file.storageFileId ?? file.id))
              : null
        if (!fileAsset || !['ready', 'partial'].includes(fileAsset.status)) {
            return null
        }
        const chunks = await this.queryBus.execute<
            SearchFileChunksQuery,
            Array<{ id: string; content: string; anchor?: unknown }>
        >(new SearchFileChunksQuery({ fileId: fileAsset.id, limit: 30 }))
        if (!chunks.length) {
            return null
        }
        return chunks.map(
            (chunk) =>
                new Document({
                    pageContent: chunk.content,
                    metadata: {
                        fileId: fileAsset.id,
                        chunkId: chunk.id,
                        anchor: chunk.anchor
                    }
                })
        )
    }
}
