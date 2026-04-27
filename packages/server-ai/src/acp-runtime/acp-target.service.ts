import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AcpTarget } from './acp-target.entity'

@Injectable()
export class AcpTargetService extends TenantOrganizationAwareCrudService<AcpTarget> {
  constructor(
    @InjectRepository(AcpTarget)
    protected readonly repository: Repository<AcpTarget>
  ) {
    super(repository)
  }

  async listEnabled(): Promise<AcpTarget[]> {
    const result = await this.findAll({
      where: { enabled: true },
      order: { createdAt: 'ASC' }
    })

    return result.items
  }
}
