import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../core/entities/internal'
import { DatabaseModule } from '../database/database.module'
import { HealthController } from './health.controller'
import { CacheHealthIndicator } from './indicators/cache-health.indicator'
import { RedisHealthIndicator } from './indicators/redis-health.indicator'
import { RuntimeControlModule } from '../runtime-control'

@Module({
	controllers: [HealthController],
	imports: [
		// We need to import the TypeOrmModule here to use Repositories in Health Service
		TypeOrmModule.forFeature([User]),
		DatabaseModule,
		RuntimeControlModule,
		TerminusModule
	],
	providers: [CacheHealthIndicator, RedisHealthIndicator]
})
export class HealthModule {}
