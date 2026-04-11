import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Certification } from './certification.entity'

@Injectable()
export class CertificationService extends TenantOrganizationAwareCrudService<Certification> {
	constructor(
		@InjectRepository(Certification)
		certRepository: Repository<Certification>
	) {
		super(certRepository)
	}
}
