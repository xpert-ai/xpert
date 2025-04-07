import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from 'nest-router'
import { EnvironmentController } from './environment.controller'
import { Environment } from './environment.entity'
import { EnvironmentService } from './environment.service'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/environment', module: EnvironmentModule }]),
		forwardRef(() => TypeOrmModule.forFeature([Environment])),
		CqrsModule,
	],
	controllers: [EnvironmentController],
	providers: [EnvironmentService],
	exports: [TypeOrmModule]
})
export class EnvironmentModule {}
