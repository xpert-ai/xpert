import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AcpSessionEvent } from './acp-session-event.entity'

@Injectable()
export class AcpSessionEventService extends TenantOrganizationAwareCrudService<AcpSessionEvent> {
  constructor(
    @InjectRepository(AcpSessionEvent)
    protected readonly repository: Repository<AcpSessionEvent>
  ) {
    super(repository)
  }

  async getNextSequence(sessionId: string): Promise<number> {
    const latest = await this.repository.findOne({
      where: { sessionId },
      order: { sequence: 'DESC' }
    })

    return (latest?.sequence ?? 0) + 1
  }

  async listBySession(sessionId: string): Promise<AcpSessionEvent[]> {
    const result = await this.findAll({
      where: { sessionId },
      order: { sequence: 'ASC', createdAt: 'ASC' }
    })

    return result.items
  }
}
