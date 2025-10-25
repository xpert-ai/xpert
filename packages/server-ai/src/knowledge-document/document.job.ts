import { Document } from '@langchain/core/documents'
import { IKnowledgebase, IKnowledgeDocument, KBDocumentStatusEnum, Metadata } from '@metad/contracts'
import { estimateTokenUsage } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { Job } from 'bull'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { KnowledgebaseService, KnowledgeDocumentStore } from '../knowledgebase/index'
import { KnowledgeDocLoadCommand } from './commands'
import { KnowledgeDocumentService } from './document.service'
import { JOB_EMBEDDING_DOCUMENT } from './types'


@Processor({
	name: JOB_EMBEDDING_DOCUMENT
	// scope: Scope.REQUEST
})
export class KnowledgeDocumentConsumer {
	private readonly logger = new Logger(KnowledgeDocumentConsumer.name)

	constructor(
		@Inject(JOB_REF) jobRef: Job,
		private readonly knowledgebaseService: KnowledgebaseService,
		private readonly documentService: KnowledgeDocumentService,
		private readonly userService: UserService,
		private readonly commandBus: CommandBus
	) {}

	@Process({ concurrency: 5 })
	async process(job: Job<{ userId: string; docs: IKnowledgeDocument[] }>) {
		const user = await this.userService.findOne(job.data.userId, { relations: ['role'] })
		const knowledgebaseId = job.data.docs[0]?.knowledgebaseId
		const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
			relations: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider']
		})

		runWithRequestContext({ user, headers: { ['organization-id']: knowledgebase.organizationId } }, () => {
			this._processJob(knowledgebase, job.data.docs, job).catch((err) => {
				this.logger.error(err)
			})
		})
	}

	async _processJob(knowledgebase: IKnowledgebase, docs: IKnowledgeDocument<Metadata>[], job: Job) {
		const copilot = knowledgebase?.copilotModel?.copilot
		let vectorStore: KnowledgeDocumentStore
		try {
			// const doc = job.data.docs[0]
			vectorStore = await this.knowledgebaseService.getVectorStore(knowledgebase, true)
		} catch (err) {
			await Promise.all(
				docs.map((doc) =>
					this.documentService.update(doc.id, {
						status: KBDocumentStatusEnum.ERROR,
						processMsg: getErrorMessage(err)
					})
				)
			)
			await job.moveToFailed(err)
			return
		}

		for await (const doc of job.data.docs) {
			const document = await this.documentService.findOne(doc.id, { relations: ['chunks'] })

			try {
				const data = await this.commandBus.execute<
					KnowledgeDocLoadCommand,
					{ chunks: Document<ChunkMetadata>[]; }
				>(new KnowledgeDocLoadCommand({ doc: document, stage: 'prod' }))

				// Save pages into db, And associated with the chunk's metadata.
				// let chunks: Document<ChunkMetadata>[] = data?.chunks
				// if (data?.pages?.length) {
				// 	// let pages = mergeParentChildChunks(data.pages, data.chunks)
				// 	const pages = await this.service.createPageBulk(
				// 		document.id,
				// 		data.pages.map((page) => ({
				// 			pageContent: page.pageContent,
				// 			metadata: page.metadata,
				// 			tenantId: document.tenantId,
				// 			organizationId: document.organizationId,
				// 			knowledgebaseId: document.knowledgebaseId
				// 		}))
				// 	)
				// 	chunks = chunks.map((chunk) => {
				// 		const page = pages.find((p) => p.metadata.chunkId === chunk.metadata.parentId)
				// 		if (page) {
				// 			chunk.metadata.pageId = page.id
				// 		}
				// 		return chunk
				// 	})
				// }
				let chunks = data?.chunks // .map(transformDocument2Chunk)
				if (chunks) {
					this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
					document.chunks = await this.documentService.coverChunks({...document, chunks}, vectorStore)
					chunks = await this.documentService.findAllLeaves(document)

					// Clear history chunks
					await vectorStore.deleteKnowledgeDocument(document)
					const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
					let count = 0
					while (batchSize * count < chunks.length) {
						const batch = chunks.slice(batchSize * count, batchSize * (count + 1))
						// Record token usage
						const tokenUsed = batch.reduce((total, doc) => total + estimateTokenUsage(doc.pageContent), 0)
						await this.commandBus.execute(
							new CopilotTokenRecordCommand({
								tenantId: knowledgebase.tenantId,
								organizationId: knowledgebase.organizationId,
								userId: job.data.userId,
								copilotId: copilot.id,
								tokenUsed,
								model: vectorStore.embeddingModel
							})
						)
						await vectorStore.addKnowledgeDocument(document, batch)
						count++
						const progress =
							batchSize * count >= chunks.length
								? 100
								: (((batchSize * count) / chunks.length) * 100).toFixed(1)
						this.logger.debug(`Embeddings document '${document.name}' progress: ${progress}%`)
						if (await this.checkIfJobCancelled(doc.id)) {
							this.logger.debug(`[Job: entity '${job.id}'] Cancelled`)
							return
						}
						await this.documentService.update(doc.id, { progress: Number(progress) })
					}
				}

				await this.documentService.update(doc.id, { status: KBDocumentStatusEnum.FINISH, processMsg: '' })

				this.logger.debug(`[Job: entity '${job.id}'] End!`)
			} catch (err) {
				this.logger.debug(`[Job: entity '${job.id}'] Error!`)
				this.documentService.update(document.id, {
					status: KBDocumentStatusEnum.ERROR,
					processMsg: getErrorMessage(err)
				})
				await job.moveToFailed(err)
			}
		}

		return {}
	}

	async checkIfJobCancelled(docId: string): Promise<boolean> {
		// Check database/cache for cancellation flag
		const doc = await this.documentService.findOne(docId)
		if (doc) {
			return doc?.status === KBDocumentStatusEnum.CANCEL
		}
		return true
	}
}
