import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SharedModule, TenantModule } from '@metad/server-core'
import { SemanticModelCache } from './cache.entity'
import { SemanticModelCacheService } from './cache.service'

@Module({
	imports: [
		TypeOrmModule.forFeature([SemanticModelCache]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
	],
	providers: [SemanticModelCacheService],
	exports: [SemanticModelCacheService],
})
export class SemanticModelCacheModule {}
