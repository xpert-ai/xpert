import { IntegrationModule, StorageFileModule, TenantModule, UserModule } from '@metad/server-core'
import { BullModule } from '@nestjs/bull'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CopilotModule } from '../copilot'
import { KnowledgebaseModule } from '../knowledgebase/knowledgebase.module'
import { CommandHandlers } from './commands/handlers'
import { KnowledgeDocumentController } from './document.controller'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDocumentPage } from './page/document-page.entity'
import { QueryHandlers } from './queries/handlers'
import { JOB_EMBEDDING_DOCUMENT } from './types'

@Module({
	imports: [
		RouterModule.register([{ path: '/knowledge-document', module: KnowledgeDocumentModule }]),
		TypeOrmModule.forFeature([KnowledgeDocument, KnowledgeDocumentPage]),
		DiscoveryModule,
		TenantModule,
		CqrsModule,
		UserModule,
		StorageFileModule,
		CopilotModule,
		IntegrationModule,
		forwardRef(() => KnowledgebaseModule),

		BullModule.registerQueue({
			name: JOB_EMBEDDING_DOCUMENT
		})
	],
	controllers: [KnowledgeDocumentController],
	providers: [
		KnowledgeDocumentService,
		KnowledgeDocumentConsumer,
		...CommandHandlers,
		...QueryHandlers
	],
	exports: [
		KnowledgeDocumentService,
		TypeOrmModule
	]
})
export class KnowledgeDocumentModule {}
