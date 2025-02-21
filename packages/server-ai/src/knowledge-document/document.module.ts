import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bull'
import { RouterModule } from 'nest-router'
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

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/knowledge-document', module: KnowledgeDocumentModule }]),
		TypeOrmModule.forFeature([KnowledgeDocument, KnowledgeDocumentPage]),
		TenantModule,
		CqrsModule,
		UserModule,
		StorageFileModule,
		CopilotModule,
		KnowledgebaseModule,
		IntegrationModule,

		BullModule.registerQueue({
			name: 'embedding-document',
		  })
	],
	controllers: [KnowledgeDocumentController],
	providers: [KnowledgeDocumentService, KnowledgeDocumentConsumer, ...CommandHandlers, ...QueryHandlers],
	exports: [KnowledgeDocumentService]
})
export class KnowledgeDocumentModule {}
