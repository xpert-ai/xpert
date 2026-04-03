import { OrganizationModule, UserModule, UserOrganizationModule } from '@metad/server-core'
import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { XpertModule } from '../xpert'
import { EnvironmentModule } from '../environment'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { AI_BOOTSTRAP_QUEUE } from './constants'
import { ServerAIBootstrapProcessor } from './bootstrap.processor'
import { ServerAIBootstrapService } from './bootstrap.service'

@Module({
	imports: [
		BullModule.registerQueue({
			name: AI_BOOTSTRAP_QUEUE
		}),
		OrganizationModule,
		UserModule,
		UserOrganizationModule,
		XpertWorkspaceModule,
		EnvironmentModule,
		XpertModule,
		XpertTemplateModule
	],
	providers: [ServerAIBootstrapProcessor, ServerAIBootstrapService]
})
export class InitializationModule {}
