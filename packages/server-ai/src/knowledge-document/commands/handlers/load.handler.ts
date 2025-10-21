import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
	DocumentSheetParserConfig,
	DocumentTextParserConfig,
	IKnowledgeDocument,
	KBDocumentCategoryEnum
} from '@metad/contracts'
import { loadCsvWithAutoEncoding, loadExcel, pick } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import {
	DocumentTransformerRegistry,
	FileSystemPermission,
	ImageUnderstandingRegistry,
	TextSplitterRegistry,
	XpFileSystem
} from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { GetRagWebDocCacheQuery } from '../../../rag-web'
import { LoadStorageFileCommand, sandboxVolumeUrl, VolumeClient } from '../../../shared/'
import { KnowledgeDocLoadCommand } from '../load.command'

@CommandHandler(KnowledgeDocLoadCommand)
export class KnowledgeDocLoadHandler implements ICommandHandler<KnowledgeDocLoadCommand> {
	@Inject(TextSplitterRegistry)
	private readonly textSplitterRegistry: TextSplitterRegistry

	@Inject(DocumentTransformerRegistry)
	private readonly transformerRegistry: DocumentTransformerRegistry

	@Inject(ImageUnderstandingRegistry)
	private readonly imageUnderstandingRegistry: ImageUnderstandingRegistry

	constructor(
		private readonly knowledgebaseService: KnowledgebaseService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: KnowledgeDocLoadCommand): Promise<{ chunks: Document[]; pages?: Document[] }> {
		const { doc, stage } = command.input

		let visionModel: BaseChatModel = null
		const volumeClient = new VolumeClient({
								tenantId: RequestContext.currentTenantId(),
								catalog: 'knowledges',
								userId: RequestContext.currentUserId(),
								knowledgeId: doc.knowledgebaseId
							})

		if (doc.category === KBDocumentCategoryEnum.Sheet) {
			const parserConfig = doc.parserConfig as DocumentSheetParserConfig
			// const data = await this.commandBus.execute(new LoadStorageSheetCommand(doc.storageFileId))
			const data = await this.loadSheet(doc, volumeClient)
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
			return { chunks: documents }
		}

		if (doc.filePath || doc.fileUrl) {
			let docs: Document[]
			const transformerType = doc.parserConfig?.transformerType || 'default'
			if (transformerType) {
				const transformer = this.transformerRegistry.get(transformerType)
				if (transformer) {
					const type = doc.name?.split('.').pop()?.toLowerCase()
					const fsPermission = transformer.permissions?.find(
						(permission) => permission.type === 'filesystem'
					) as FileSystemPermission
					const permissions = {}
					if (fsPermission) {
						const folder = stage === 'test' ? 'temp/' : `/`
						permissions['fileSystem'] = new XpFileSystem(
							fsPermission,
							volumeClient.getVolumePath(folder),
							sandboxVolumeUrl(`/knowledges/${doc.knowledgebaseId}/${folder}`)
						)
					}
					const transformed = await transformer.transformDocuments(
						[doc],
						{
							...(doc.parserConfig.transformer ?? {}),
							stage,
							tempDir: volumeClient.getVolumePath('tmp'),
							permissions
						}
					)

					const chunks = []
					const pages = []
					for await (const transItem of transformed) {
						const splitted = await this.splitDocuments(doc, transItem.chunks)
						// Image understanding
						const images = transItem.metadata?.assets?.filter((asset) => asset.type === 'image')
						if (images?.length && doc.parserConfig.imageUnderstandingType) {
							if (!visionModel) {
								visionModel = await this.knowledgebaseService.getVisionModel(doc.knowledgebaseId)
							}
							const imageUnderstanding = this.imageUnderstandingRegistry.get(
								doc.parserConfig.imageUnderstandingType
							)
							const fsPermission = imageUnderstanding.permissions?.find(
								(permission) => permission.type === 'filesystem'
							) as FileSystemPermission
							const permissions = {}
							if (fsPermission) {
								const folder = stage === 'test' ? 'temp/' : `/`
								permissions['fileSystem'] = new XpFileSystem(
									fsPermission,
									volumeClient.getVolumePath(folder),
									sandboxVolumeUrl(`/knowledges/${doc.knowledgebaseId}/${folder}`)
								)
							}
							const imgTransformed = await imageUnderstanding.understandImages(
								{
									files: images,
									chunks: splitted.chunks,
								},
								{
									...(doc.parserConfig.imageUnderstanding ?? {}),
									stage,
									visionModel,
									permissions
								}
							)
							chunks.push(...imgTransformed.chunks)
							if (splitted.pages?.length) {
								pages.push(...splitted.pages)
							} else {
								pages.push(...imgTransformed.pages)
							}
						} else {
							chunks.push(...splitted.chunks)
							if (splitted.pages?.length) {
								pages.push(...splitted.pages)
							}
						}
					}
					return { chunks, pages: pages.length ? pages : undefined }
				} else {
					throw new Error(`Transformer not found: ${transformerType}`)
				}
			} else {
				docs = await this.commandBus.execute(new LoadStorageFileCommand(doc.storageFileId))
			}

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

	/**
	 * Split documents into smaller chunks for processing by `parserConfig`.
	 *
	 * @param document The original knowledge document entity.
	 * @param data The document data to split.
	 * @param parserConfig custom parser configuration.
	 * @returns An array of split document chunks.
	 */
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

		const textSplitter = this.textSplitterRegistry.get(
			document.parserConfig.textSplitterType || 'recursive-character'
		)
		if (!textSplitter) {
			throw new Error(
				`Text Splitter not found: ${document.parserConfig.textSplitterType || 'recursive-character'}`
			)
		}
		if (textSplitter) {
			const result = await textSplitter.splitDocuments(data, {
				chunkSize,
				chunkOverlap,
				separators: delimiter?.split(' '),
				...(document.parserConfig.textSplitter || {})
			})

			return result
		}

		// const textSplitter1 = new RecursiveCharacterTextSplitter({
		// 	chunkSize,
		// 	chunkOverlap,
		// 	separators: delimiter?.split(' ')
		// })

		// return {
		// 	chunks: await textSplitter1.splitDocuments(data)
		// }
	}

	async loadSheet(doc: IKnowledgeDocument, volumeClient: VolumeClient): Promise<Record<string, any>[]> {
		const filePath = volumeClient.getVolumePath(doc.filePath)
		if (doc.name.endsWith('.csv')) {
			return loadCsvWithAutoEncoding(filePath)
		}

		return loadExcel(filePath)
	}
}
