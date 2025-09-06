import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bull'
import { RouterModule } from '@nestjs/core'
import { IntegrationModule, StorageFileModule, TenantModule, UserModule } from '@metad/server-core'
import { KnowledgeDocumentController } from './document.controller'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDocumentConsumer } from './document.job'
import { CopilotModule } from '../copilot'
import { KnowledgebaseModule } from '../knowledgebase/knowledgebase.module'
import { CommandHandlers } from './commands/handlers'
import { KnowledgeDocumentPage } from './page/document-page.entity'
import { QueryHandlers } from './queries/handlers'
import { JOB_EMBEDDING_DOCUMENT } from './types'

@Module({
	imports: [
		RouterModule.register([{ path: '/knowledge-document', module: KnowledgeDocumentModule }]),
		TypeOrmModule.forFeature([KnowledgeDocument, KnowledgeDocumentPage]),
		TenantModule,
		CqrsModule,
		UserModule,
		StorageFileModule,
		CopilotModule,
		KnowledgebaseModule,
		IntegrationModule,

		BullModule.registerQueue({
			name: JOB_EMBEDDING_DOCUMENT,
		  })
	],
	controllers: [KnowledgeDocumentController],
	providers: [KnowledgeDocumentService, KnowledgeDocumentConsumer, ...CommandHandlers, ...QueryHandlers],
	exports: [KnowledgeDocumentService]
})
export class KnowledgeDocumentModule {}
