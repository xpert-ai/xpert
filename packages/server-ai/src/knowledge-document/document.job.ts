
import { IKnowledgeDocument } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger, Scope } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { estimateTokenUsage } from '@metad/copilot'
import { KnowledgebaseService, KnowledgeDocumentStore } from '../knowledgebase/index'
import { KnowledgeDocumentService } from './document.service'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { KnowledgeDocLoadCommand } from './commands'

@Processor({
	name: 'embedding-document',
	// scope: Scope.REQUEST
})
export class KnowledgeDocumentConsumer {
	private readonly logger = new Logger(KnowledgeDocumentConsumer.name)
	
	constructor(
		@Inject(JOB_REF) jobRef: Job,
		private readonly knowledgebaseService: KnowledgebaseService,
		private readonly service: KnowledgeDocumentService,
		private readonly commandBus: CommandBus,
	) {}

	@Process({ concurrency: 5 })
	async process(job: Job<{ userId: string; docs: IKnowledgeDocument[] }>) {
		const userId = job.data.userId
		const knowledgebaseId = job.data.docs[0]?.knowledgebaseId
		const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, { relations: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider'] })
		const copilot = knowledgebase?.copilotModel?.copilot
		let vectorStore: KnowledgeDocumentStore
		try {
			const doc = job.data.docs[0]

			vectorStore = await this.knowledgebaseService.getVectorStore(
				knowledgebase,
				true,
				doc.tenantId,
				doc.organizationId
			)
		} catch (err) {
			await Promise.all(
				job.data.docs.map((doc) =>
					this.service.update(doc.id, { status: 'error', processMsg: getErrorMessage(err) })
				)
			)
			await job.moveToFailed(err)
			return
		}

		for await (const doc of job.data.docs) {
			const document = await this.service.findOne(doc.id, { relations: ['pages'] })

			try {
				const data = await this.commandBus.execute(new KnowledgeDocLoadCommand({doc: document}))

				if (data) {
					this.logger.debug(`Embeddings document '${document.name}' size: ${data.length}`)
					// Clear history chunks
					await vectorStore.deleteKnowledgeDocument(document)
					const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
					let count = 0
					while (batchSize * count < data.length) {
						const batch = data.slice(batchSize * count, batchSize * (count + 1))
						// Record token usage
						const tokenUsed = batch.reduce((total, doc) => total + estimateTokenUsage(doc.pageContent), 0)
						await this.commandBus.execute(
							new CopilotTokenRecordCommand({
								tenantId: knowledgebase.tenantId,
								organizationId: knowledgebase.organizationId,
								userId,
								copilotId: copilot.id,
								tokenUsed,
								model: vectorStore.embeddingModel
							})
						)
						await vectorStore.addKnowledgeDocument(document, batch)
						count++
						const progress =
							batchSize * count >= data.length
								? 100
								: (((batchSize * count) / data.length) * 100).toFixed(1)
						this.logger.debug(
							`Embeddings document '${document.name}' progress: ${progress}%`
						)
						if (await this.checkIfJobCancelled(doc.id)) {
							this.logger.debug(
								`[Job: entity '${job.id}'] Cancelled`
							)
							return
						}
						await this.service.update(doc.id, { progress: Number(progress) })
					}
				}

				await this.service.update(doc.id, { status: 'finish', processMsg: '' })

				this.logger.debug(`[Job: entity '${job.id}'] End!`)
			} catch (err) {
				this.logger.debug(`[Job: entity '${job.id}'] Error!`)
				this.service.update(document.id, {
					status: 'error',
					processMsg: getErrorMessage(err)
				})
				await job.moveToFailed(err)
			}
		}

		return {}
	}

	async checkIfJobCancelled(docId: string): Promise<boolean> {
		// Check database/cache for cancellation flag
		const doc = await this.service.findOne(docId)
		if (doc) {
			return doc?.status === 'cancel'
		}
		return true
	}
}
