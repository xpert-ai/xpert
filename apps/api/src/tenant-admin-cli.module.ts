import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
	DatabaseModule,
	provideEventEmitterModule,
	Role,
	Tenant,
	TenantService,
	UserService
} from '@xpert-ai/server-core'

@Module({
	imports: [
		DatabaseModule,
		TypeOrmModule.forFeature([Tenant, Role]),
		CqrsModule,
		provideEventEmitterModule()
	],
	providers: [
		TenantService,
		{
			provide: UserService,
			useValue: {
				update: async () => undefined
			}
		}
	],
	exports: [TenantService]
})
export class TenantAdminCliModule {}
