import { Module } from '@nestjs/common'
import {
	AnalyticsModule,
} from '@xpert-ai/analytics'
import { SeederModule, ServerAppModule } from '@xpert-ai/server-core'

@Module({
	imports: [
		ServerAppModule,
		AnalyticsModule,
    	SeederModule
	],
	controllers: [],
	providers: []
})
export class AppModule {}
