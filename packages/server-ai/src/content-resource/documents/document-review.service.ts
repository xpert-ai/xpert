import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ContentDocumentInput, ContentTextPatch } from '@xpert-ai/plugin-sdk'
import type { ContentDocumentProposal } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ContentProposal } from './entities'
import { ContentDocumentService } from './document.service'

const descriptor = (p: ContentProposal): ContentDocumentProposal => ({ id: p.id, resourceId: p.resourceId,
  mutationId: p.mutationId, epoch: p.epoch, sequence: p.sequence, blockId: p.blockId, before: p.before,
  after: p.after, status: p.status, createdById: p.createdById, assistantId: p.assistantId })

/** Assistant owns review decisions; this service persists resource-scoped proposals. */
@Injectable()
export class ContentDocumentReview {
  constructor(private readonly documents: ContentDocumentService,
    @InjectRepository(ContentProposal) private readonly proposalsRepo: Repository<ContentProposal>) {}

  async proposals(input: ContentDocumentInput) {
    await this.documents.require(input)
    return (await this.proposalsRepo.find({ where: { resourceId: input.resourceId, tenantId: input.actor.tenantId,
      organizationId: input.actor.organizationId }, order: { createdAt: 'DESC' }, take: 100 })).map(descriptor)
  }
  async propose(input: ContentDocumentInput & ContentTextPatch) {
    const { document } = await this.documents.require(input, true)
    return this.documents.store.storage(document).withLock(`proposals/${input.resourceId}/${input.mutationId}`, async () => {
      const existing = await this.proposalsRepo.findOneBy({ resourceId: input.resourceId, mutationId: input.mutationId,
        tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
      if (existing) {
        if (existing.blockId !== input.blockId || existing.before !== input.before || existing.after !== input.after ||
            existing.epoch !== input.epoch || existing.sequence !== input.expectedSequence)
          throw new ConflictException(t('server-ai:Error.ContentMutationConflict'))
        return descriptor(existing)
      }
      const state = await this.documents.get(input)
      if (state.externalChange || state.document.epoch !== input.epoch || state.document.sequence !== input.expectedSequence)
        this.documents.conflict()
      this.documents.models.getTextModel(document.modelKey, document.organizationId).patch(state.stateBase64, input)
      return descriptor(await this.proposalsRepo.save(this.proposalsRepo.create({
        tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, resourceId: input.resourceId,
        mutationId: input.mutationId, epoch: input.epoch, sequence: input.expectedSequence, blockId: input.blockId,
        before: input.before, after: input.after, status: 'pending', createdById: input.actor.userId,
        assistantId: input.assistantId ?? null, preparedUpdate: null
      })))
    })
  }
  async decide(input: ContentDocumentInput & { proposalId: string; accept: boolean }) {
    const { document } = await this.documents.require(input, true)
    return this.documents.store.storage(document).withLock(`decisions/${input.proposalId}`, async () => {
      const proposal = await this.proposalsRepo.findOneByOrFail({ id: input.proposalId, resourceId: input.resourceId,
        tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
      if (proposal.status !== 'pending') return descriptor(proposal)
      if (!input.accept) {
        if (proposal.preparedUpdate) this.documents.conflict()
        proposal.status = 'rejected'
        return descriptor(await this.proposalsRepo.save(proposal))
      }
      const state = await this.documents.get(input)
      if (state.externalChange || state.document.epoch !== proposal.epoch) this.documents.conflict()
      if (!proposal.preparedUpdate) {
        if (state.document.sequence !== proposal.sequence) {
          proposal.status = 'stale'
          return descriptor(await this.proposalsRepo.save(proposal))
        }
        proposal.preparedUpdate = this.documents.models.getTextModel(document.modelKey, document.organizationId).patch(state.stateBase64, proposal)
        await this.proposalsRepo.save(proposal)
      }
      const { document: current } = await this.documents.require(input, true)
      if (!current.collaborationId) this.documents.conflict()
      await this.documents.collab(input).applyUpdate({ documentId: current.collaborationId,
        updateBase64: proposal.preparedUpdate, expectedSequence: proposal.sequence,
        origin: `content:proposal:${proposal.id}` })
      proposal.status = 'accepted'
      return descriptor(await this.proposalsRepo.save(proposal))
    })
  }
}
