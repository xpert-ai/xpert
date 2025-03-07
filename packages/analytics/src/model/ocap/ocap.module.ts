import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { NgmDSCoreService } from './core.service'
import { provideOcap } from './providers'

/**
 * @deprecated
 */
@Module({
	imports: [CqrsModule],
	controllers: [],
	providers: [...provideOcap()],
	exports: [NgmDSCoreService]
})
export class OcapModule {}
