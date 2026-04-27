import { TAcpArtifactKind } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AcpArtifact } from './acp-artifact.entity'
import { AcpAuditService } from './acp-audit.service'
import { AcpSession } from './acp-session.entity'

type CreateArtifactInput = {
  kind: TAcpArtifactKind
  title?: string | null
  mimeType?: string | null
  content?: string | null
  path?: string | null
  metadata?: Record<string, unknown> | null
  eventId?: string | null
}

@Injectable()
export class AcpArtifactService extends TenantOrganizationAwareCrudService<AcpArtifact> {
  constructor(
    @InjectRepository(AcpArtifact)
    protected readonly repository: Repository<AcpArtifact>,
    private readonly auditService: AcpAuditService
  ) {
    super(repository)
  }

  async createArtifact(
    session: Pick<AcpSession, 'id' | 'tenantId' | 'organizationId' | 'executionId'>,
    input: CreateArtifactInput
  ): Promise<AcpArtifact> {
    const artifact = await this.repository.save(
      this.repository.create({
        tenantId: session.tenantId,
        organizationId: session.organizationId,
        sessionId: session.id,
        executionId: session.executionId ?? null,
        eventId: input.eventId ?? null,
        kind: input.kind,
        title: input.title ?? null,
        mimeType: input.mimeType ?? null,
        content: input.content ?? null,
        path: input.path ?? null,
        metadata: input.metadata ?? null
      })
    )

    await this.auditService.appendEvent(session, 'artifact_created', {
      artifactId: artifact.id,
      kind: artifact.kind,
      title: artifact.title ?? null
    })

    return artifact
  }

  async listBySession(sessionId: string): Promise<AcpArtifact[]> {
    const result = await this.findAll({
      where: { sessionId },
      order: { createdAt: 'ASC' }
    })

    return result.items
  }
}
