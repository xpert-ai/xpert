import { Document } from '@langchain/core/documents'
import { IKnowledgebase, IKnowledgeDocument, KBDocumentStatusEnum, KnowledgeDocumentMetadata } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ChunkMetadata, countTokensSafe } from '@xpert-ai/plugin-sdk'
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

		runWithRequestContext({ user, headers: { ['organization-id']: knowledgebase.organizationId, language: user.preferredLanguage } }, () => {
			this._processJob(knowledgebase, job.data.docs, job).catch((err) => {
				this.logger.error(err)
			})
		})
	}

	async _processJob(knowledgebase: IKnowledgebase, docs: IKnowledgeDocument<KnowledgeDocumentMetadata>[], job: Job) {
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
				// Start processing
				const processBeginAt = new Date()
				await this.documentService.update(document.id, { processBeginAt })

				const data = await this.commandBus.execute<
					KnowledgeDocLoadCommand,
					{ chunks: Document<ChunkMetadata>[]; }
				>(new KnowledgeDocLoadCommand({ doc: document, stage: 'prod' }))

				let chunks = data?.chunks // .map(transformDocument2Chunk)
				let docTokenUsed = 0
				if (chunks) {
					this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
					document.chunks = await this.documentService.coverChunks({...document, chunks}, vectorStore)
					await this.documentService.update(document.id, { status: KBDocumentStatusEnum.EMBEDDING, progress: 0, draft: null })
					chunks = await this.documentService.findAllEmbeddingNodes(document)

					// Clear history chunks
					await vectorStore.deleteKnowledgeDocument(document)
					const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
					let count = 0
					while (batchSize * count < chunks.length) {
						const batch = chunks.slice(batchSize * count, batchSize * (count + 1))
						// Count and Record token usage
						let tokenUsed = 0
						batch.forEach((chunk) => {
							chunk.metadata.tokens = countTokensSafe(chunk.pageContent)
							tokenUsed += chunk.metadata.tokens
						})
						docTokenUsed += tokenUsed
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
						await this.documentService.update(doc.id, {
							status: KBDocumentStatusEnum.EMBEDDING,
							progress: Number(progress),
							metadata: { ...doc.metadata, tokens: docTokenUsed }
						})
					}
				}

				await this.documentService.update(doc.id, {
					status: KBDocumentStatusEnum.FINISH,
					processMsg: '', 
					processDuation: new Date().getTime() - processBeginAt.getTime(), 
					progress: 100, 
					metadata: { ...doc.metadata, tokens: docTokenUsed }
				})

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
