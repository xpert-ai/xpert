import { SharedModule, UserModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CertificationController } from './certification.controller'
import { Certification } from './certification.entity'
import { CertificationService } from './certification.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/certification', module: CertificationModule }]),
		TypeOrmModule.forFeature([Certification]),
		SharedModule,
		CqrsModule,
		UserModule,
	],
	controllers: [CertificationController],
	providers: [CertificationService, ...QueryHandlers],
	exports: [CertificationService]
})
export class CertificationModule {}
