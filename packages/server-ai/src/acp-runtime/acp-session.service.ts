import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AcpSession } from './acp-session.entity'

@Injectable()
export class AcpSessionService extends TenantOrganizationAwareCrudService<AcpSession> {
  constructor(
    @InjectRepository(AcpSession)
    repository: Repository<AcpSession>
  ) {
    super(repository)
  }
}
