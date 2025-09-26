import { IntegrationModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { FirecrawlController } from './firecrawl.controller'
import { FirecrawlService } from './firecrawl.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/firecrawl', module: IntegrationFirecrawlModule }]),
		CqrsModule,
		IntegrationModule
	],
	controllers: [FirecrawlController],
	providers: [FirecrawlService],
	exports: [FirecrawlService]
})
export class IntegrationFirecrawlModule {}
