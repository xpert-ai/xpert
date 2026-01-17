import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
	DocumentSheetParserConfig,
	DocumentTextParserConfig,
	IKnowledgeDocument,
	IKnowledgeDocumentChunk,
	KBDocumentCategoryEnum,
	KBDocumentStatusEnum,
} from '@metad/contracts'
import { loadCsvWithAutoEncoding, loadExcel, pick } from '@metad/server-common'
import { computeObjectHash, RequestContext } from '@metad/server-core'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import {
	ChunkMetadata,
	DocumentTransformerRegistry,
	ImageUnderstandingRegistry,
	TextSplitterRegistry,
	TImageUnderstandingResult,
} from '@xpert-ai/plugin-sdk'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Document } from '@langchain/core/documents'
import { Cache } from 'cache-manager'
import { omit } from 'lodash'
import { v4 as uuid } from 'uuid'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { GetRagWebDocCacheQuery } from '../../../rag-web'
import { VolumeClient } from '../../../shared/'
import { KnowledgeDocLoadCommand } from '../load.command'
import { PluginPermissionsCommand } from '../../../knowledgebase/commands'
import { TDocChunkMetadata } from '../../types'
import { KnowledgeDocumentService } from '../../document.service'


@CommandHandler(KnowledgeDocLoadCommand)
export class KnowledgeDocLoadHandler implements ICommandHandler<KnowledgeDocLoadCommand> {
	@Inject(TextSplitterRegistry)
	private readonly textSplitterRegistry: TextSplitterRegistry

	@Inject(DocumentTransformerRegistry)
	private readonly transformerRegistry: DocumentTransformerRegistry

	@Inject(ImageUnderstandingRegistry)
	private readonly imageUnderstandingRegistry: ImageUnderstandingRegistry

	@Inject(CACHE_MANAGER)
	private readonly cacheManager: Cache

	@Inject(KnowledgeDocumentService)
	private readonly kbDocumentService: KnowledgeDocumentService

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
				// pageContent always contains all fields for display
				// searchContent in metadata contains only indexed fields for retrieval matching
				const metadata: any = { raw: row, documentId: doc.id, chunkId: uuid() }
				
				// If indexedFields exist, store searchContent (indexed fields only) in metadata for vectorization
				// Store full pageContent in metadata to restore after retrieval
				const fullPageContent = JSON.stringify(row)
				if (parserConfig?.indexedFields?.length) {
					metadata.searchContent = JSON.stringify(pick(row, parserConfig.indexedFields))
					// Store full content in metadata for restoration after retrieval
					metadata.fullPageContent = fullPageContent
				}
				
				documents.push(
					new Document({
						pageContent: fullPageContent,
						metadata
					})
				)
			}
			return { chunks: documents }
		}

		if (doc.filePath || doc.fileUrl) {
			// let docs: Document[]
			const transformerType = doc.parserConfig?.transformerType || 'default'
			const transformer = this.transformerRegistry.get(transformerType)
			if (transformer) {
				const permissions = await this.commandBus.execute(new PluginPermissionsCommand(transformer.permissions, {
						knowledgebaseId: doc.knowledgebaseId,
						integrationId: doc.parserConfig?.transformerIntegration,
						// folder: stage === 'test' ? 'temp/' : `/`
					}))
				const cacheConfig = {
					document: omit(doc, 'parserConfig'),
					parserConfig: pick(doc.parserConfig, ['transformerType', 'transformerIntegration', 'transformer']),
					stage,
				}
				const cacheKey = 'knowledges:transformer:' + computeObjectHash(cacheConfig)
				let transformed: Partial<IKnowledgeDocument<ChunkMetadata>>[] = await this.cacheManager.get(cacheKey)
				if (!transformed) {
					transformed = await transformer.transformDocuments(
						[doc]
						, {
							...(doc.parserConfig?.transformer ?? {}),
							stage,
							tempDir: volumeClient.getVolumePath('tmp'),
							permissions
						}
					)
					await this.cacheManager.set(cacheKey, transformed, 60 * 10 * 1000) // 10 min
				}

				// Update document status
				if (stage !== 'test') {
					await this.kbDocumentService.update(doc.id, {status: KBDocumentStatusEnum.TRANSFORMED})
				}

				const chunks = []
				// const pages = []
				for await (const transItem of transformed) {
					// Chunker with caching
					const chunkerCacheConfig = {
						document: transItem,
						parserConfig: pick(doc.parserConfig, ['textSplitterType', 'textSplitter']),
						stage,
					}
					const cacheKey = 'knowledges:chunker:' + computeObjectHash(chunkerCacheConfig)
					let splitted = await this.cacheManager.get<{ chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[] }>(cacheKey)
					if (!splitted) {
						splitted = await this.splitDocuments(doc, transItem.chunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[])
						await this.cacheManager.set(cacheKey, splitted, 60 * 10 * 1000) // 10 min
					}

					// Update document status
					if (stage !== 'test') {
						await this.kbDocumentService.update(doc.id, {status: KBDocumentStatusEnum.SPLITTED})
					}

					// Image understanding
					const images = transItem.metadata?.assets?.filter((asset) => asset.type === 'image')
					if (images?.length && doc.parserConfig?.imageUnderstandingType) {

						const imageCacheConfig = {
							document: {...transItem, chunks: splitted.chunks},
							parserConfig: pick(doc.parserConfig, ['imageUnderstandingType', 'imageUnderstandingIntegration', 'imageUnderstanding']),
							stage,
						}
						const cacheKey = 'knowledges:understanding:' + computeObjectHash(imageCacheConfig)
						let imgTransformed = await this.cacheManager.get<TImageUnderstandingResult>(cacheKey)
						if (!imgTransformed) {
							if (!visionModel) {
								visionModel = await this.knowledgebaseService.getVisionModel(doc.knowledgebaseId, doc.parserConfig.imageUnderstandingModel)
							}
							const imageUnderstanding = this.imageUnderstandingRegistry.get(
								doc.parserConfig.imageUnderstandingType
							)
							const permissions = await this.commandBus.execute(new PluginPermissionsCommand(imageUnderstanding.permissions, {
								knowledgebaseId: doc.knowledgebaseId,
								integrationId: doc.parserConfig?.imageUnderstandingIntegration,
								// folder: stage === 'test' ? 'temp/' : `/`
							}))
							imgTransformed = await imageUnderstanding.understandImages({
									...transItem,
									chunks: splitted.chunks
								} as IKnowledgeDocument<ChunkMetadata>,
								{
									...(doc.parserConfig.imageUnderstanding ?? {}),
									stage,
									visionModel,
									permissions
								}
							)
							
							await this.cacheManager.set(cacheKey, imgTransformed, 60 * 10 * 1000) // 10 min
						}
						
						chunks.push(...imgTransformed.chunks)

						// Update document status
						if (stage !== 'test') {
							await this.kbDocumentService.update(doc.id, {status: KBDocumentStatusEnum.UNDERSTOOD})
						}
					} else {
						chunks.push(...splitted.chunks)
					}
				}
				return { chunks }
			} else {
				throw new Error(`Transformer not found: ${transformerType}`)
			}
			// else {
			// 	docs = await this.commandBus.execute(new LoadStorageFileCommand(doc.storageFileId))
			// }
			// return await this.splitDocuments(doc, docs)
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
	 * @param chunks The document data to split.
	 * @param parserConfig custom parser configuration.
	 * @returns An array of split document chunks.
	 */
	async splitDocuments(document: IKnowledgeDocument, chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[], parserConfig?: DocumentTextParserConfig) {
		// Text Preprocessing
		if (document.parserConfig?.replaceWhitespace) {
			chunks.forEach((doc) => {
				doc.pageContent = doc.pageContent.replace(/[\s\n\t]+/g, ' ') // Replace consecutive spaces, newlines, and tabs
			})
		}
		if (document.parserConfig?.removeSensitive) {
			const imageRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
			const urlRegex = /https?:\/\/[^\s]+/g;
			const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

			chunks.forEach((doc) => {
				let page = doc.pageContent;

				// 1) Extract markdown image urls with placeholder
				const imagePlaceholders: string[] = [];
				page = page.replace(imageRegex, (match) => {
					imagePlaceholders.push(match);
					return `__IMG_PLACEHOLDER_${imagePlaceholders.length - 1}__`;
				});

				// 2) Remove normal URLs (not inside markdown image)
				page = page.replace(urlRegex, '');

				// 3) Remove email addresses
				page = page.replace(emailRegex, '');

				// 4) Restore markdown image urls
				page = page.replace(/__IMG_PLACEHOLDER_(\d+)__/g, (_, index) => {
					return imagePlaceholders[Number(index)];
				});

				doc.pageContent = page;
			});
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
			const result = await textSplitter.splitDocuments(chunks, {
				chunkSize,
				chunkOverlap,
				separators: delimiter?.split(' '),
				...(document.parserConfig.textSplitter || {})
			})

			return result
		}
	}

	async loadSheet(doc: IKnowledgeDocument, volumeClient: VolumeClient): Promise<Record<string, any>[]> {
		const filePath = volumeClient.getVolumePath(doc.filePath)
		if (doc.name.endsWith('.csv')) {
			return loadCsvWithAutoEncoding(filePath)
		}

		return loadExcel(filePath)
	}
}
