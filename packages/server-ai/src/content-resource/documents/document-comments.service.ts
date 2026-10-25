import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ContentDocumentComment } from '@xpert-ai/contracts'
import type { ContentDocumentsApi, ContentDocumentInput } from '@xpert-ai/plugin-sdk'
import { ContentComment } from './entities'
import { ContentDocumentService } from './document.service'

const descriptor = (comment: ContentComment): ContentDocumentComment => ({ id: comment.id, resourceId: comment.resourceId,
  blockId: comment.blockId, epoch: comment.epoch, body: comment.body, resolved: comment.resolved,
  createdById: comment.createdById, createdAt: comment.createdAt.toISOString() })

@Injectable()
export class ContentDocumentComments {
  constructor(private readonly documents: ContentDocumentService,
    @InjectRepository(ContentComment) private readonly repository: Repository<ContentComment>) {}

  async comments(input: ContentDocumentInput) {
    await this.documents.require(input)
    return (await this.repository.find({ where: { resourceId: input.resourceId, tenantId: input.actor.tenantId,
      organizationId: input.actor.organizationId }, order: { createdAt: 'ASC' }, take: 500 })).map(descriptor)
  }
  async comment(input: Parameters<ContentDocumentsApi['comment']>[0]) {
    await this.documents.require(input, true)
    const state = await this.documents.get(input)
    if (input.blockId && !state.blocks.some((block) => block.id === input.blockId)) this.documents.conflict()
    return descriptor(await this.repository.save(this.repository.create({
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, resourceId: input.resourceId,
      blockId: input.blockId, epoch: state.document.epoch, body: input.body, resolved: false, createdById: input.actor.userId
    })))
  }
  async resolveComment(input: Parameters<ContentDocumentsApi['resolveComment']>[0]) {
    await this.documents.require(input, true)
    const comment = await this.repository.findOneByOrFail({ id: input.commentId, resourceId: input.resourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
    comment.resolved = input.resolved
    return descriptor(await this.repository.save(comment))
  }
}
