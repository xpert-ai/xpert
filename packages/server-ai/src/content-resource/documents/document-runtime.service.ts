import { Injectable } from '@nestjs/common'
import { ContentDocumentsRuntimeCapability, type ContentDocumentsApi } from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import { ContentDocumentService } from './document.service'
import { ContentDocumentReview } from './document-review.service'
import { ContentDocumentLifecycle } from './document-lifecycle.service'
import { ContentDocumentComments } from './document-comments.service'
import { ContentDocumentLocations } from './document-location.service'
import { ContentDocumentHierarchy } from './document-hierarchy.service'

@Injectable()
@RuntimeCapabilityProvider(ContentDocumentsRuntimeCapability)
export class ContentDocumentsRuntimeService implements ContentDocumentsApi {
  validateImport: ContentDocumentsApi['validateImport'] = async (input) => {
    await this.documents.access.check(input)
    this.documents.models.getTextModel(input.modelKey, input.actor.organizationId).initialize(input.markdown)
  }
  constructor(private readonly documents: ContentDocumentService, private readonly review: ContentDocumentReview, private readonly lifecycle: ContentDocumentLifecycle, private readonly threads: ContentDocumentComments, private readonly locations: ContentDocumentLocations, private readonly pages: ContentDocumentHierarchy) {}
  hierarchy: ContentDocumentsApi['hierarchy'] = (input) => this.pages.hierarchy(input)
  createChild: ContentDocumentsApi['createChild'] = (input) => this.pages.createChild(input)
  list: ContentDocumentsApi['list'] = (input) => this.documents.list(input)
  move: ContentDocumentsApi['move'] = (input) => this.locations.move(input)
  restore: ContentDocumentsApi['restore'] = (input) => this.lifecycle.restore(input)
  reconcile: ContentDocumentsApi['reconcile'] = (input) => this.lifecycle.reconcile(input)
  setDeleted: ContentDocumentsApi['setDeleted'] = (input) => this.lifecycle.setDeleted(input)
  comments: ContentDocumentsApi['comments'] = (input) => this.threads.comments(input)
  comment: ContentDocumentsApi['comment'] = (input) => this.threads.comment(input)
  resolveComment: ContentDocumentsApi['resolveComment'] = (input) => this.threads.resolveComment(input)
  register: ContentDocumentsApi['register'] = (input) => this.documents.register(input)
  get: ContentDocumentsApi['get'] = (input) => this.documents.get(input)
  session: ContentDocumentsApi['session'] = (input) => this.documents.session(input)
  update: ContentDocumentsApi['update'] = (input) => this.documents.update(input)
  history: ContentDocumentsApi['history'] = (input) => this.documents.history(input)
  preview: ContentDocumentsApi['preview'] = (input) => this.documents.preview(input)
  checkpoint: ContentDocumentsApi['checkpoint'] = (input) => this.documents.checkpoint(input)
  relocate: ContentDocumentsApi['relocate'] = (input) => this.documents.relocate(input)
  proposals: ContentDocumentsApi['proposals'] = (input) => this.review.proposals(input)
  propose: ContentDocumentsApi['propose'] = (input) => this.review.propose(input)
  decide: ContentDocumentsApi['decide'] = (input) => this.review.decide(input)
}
