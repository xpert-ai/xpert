import { Module } from '@nestjs/common'
import { DataXLiveArtifactsMiddleware } from './datax-live-artifacts.middleware'

@Module({
	providers: [DataXLiveArtifactsMiddleware]
})
export class DataXLiveArtifactsPluginModule {}
