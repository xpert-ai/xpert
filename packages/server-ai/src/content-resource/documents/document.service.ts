import { ConflictException, ForbiddenException, NotFoundException, Injectable } from '@nestjs/common'
import {
  ContentEditorRegistry,
  type ContentDocumentInput, type ContentDocumentScope, type ContentDocumentState
} from '@xpert-ai/plugin-sdk'
import type { ContentDocumentDescriptor, ContentDocumentRevision } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ProjectFilesRuntimeService } from '../../xpert-project/services/project-files-runtime.service'
import { CollaborationService } from '../../collaboration/collaboration.service'
import { ContentResourceService } from '../content-resource.service'
import { ContentDocumentAccess } from './document-access.service'
import { ContentDocumentStore } from './document-store.service'
import { ContentDocument, ContentRevision } from './entities'

export const CONTENT_DOCUMENT_COLLABORATION = 'platform.content.document'
export const contentDocumentDescriptor = (doc: ContentDocument): ContentDocumentDescriptor => ({
  resourceRef: { providerKey: 'platform.project.file', resourceId: doc.id },
  id: doc.id, projectId: doc.projectId, path: doc.path, title: doc.title, modelKey: doc.modelKey,
  schemaVersion: doc.schemaVersion, epoch: doc.epoch, headRevisionId: doc.headRevisionId ?? '',
  fileHash: doc.fileHash, sequence: doc.sequence, status: doc.status
})
export const contentRevisionDescriptor = (r: ContentRevision): ContentDocumentRevision => ({
  id: r.id, resourceId: r.resourceId, parentId: r.parentId, hash: r.hash, epoch: r.epoch,
  sequence: r.sequence, label: r.label, createdAt: r.createdAt.toISOString(), createdById: r.createdById
})

@Injectable()
export class ContentDocumentService {
  constructor(
    readonly store: ContentDocumentStore,
    readonly access: ContentDocumentAccess,
    readonly models: ContentEditorRegistry,
    private readonly files: ProjectFilesRuntimeService,
    private readonly resources: ContentResourceService,
    readonly collaboration: CollaborationService
  ) {}

  collab(scope: ContentDocumentScope) {
    return this.collaboration.createScopedApi({ ...scope.actor, projectId: scope.projectId, xpertId: scope.assistantId })
  }
  async require(input: ContentDocumentInput, write = false) {
    const permissions = await this.access.check(input, write)
    const document = await this.store.documents.findOneByOrFail({ id: input.resourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, projectId: input.projectId })
    this.access.match(input, document)
    return { document, ...permissions }
  }
  async list(input: ContentDocumentScope & { modelKey: string }) {
    await this.access.check(input)
    const rows = await this.store.documents.find({ where: {
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId,
      projectId: input.projectId, modelKey: input.modelKey
    }, order: { updatedAt: 'DESC' }, take: 100 })
    const visible: ContentDocumentDescriptor[] = []
    for (const row of rows) {
      if (['deleted', 'moving'].includes(row.status)) continue
      try {
        await this.resources.authorize({ actor: input.actor, providerKey: row.sourceProvider,
          resourceId: row.sourceId, operation: 'read' })
        visible.push(contentDocumentDescriptor(row))
      } catch (error) {
        if (!(error instanceof ForbiddenException) && !(error instanceof NotFoundException)) throw error
      }
    }
    return visible
  }
  async register(input: ContentDocumentScope & {
    resourceId: string; path: string; title: string; modelKey: string
    source: { providerKey: string; resourceId: string }; anchors?: Array<{ id: string; text: string }>
  }) {
    await this.access.check(input)
    const found = await this.store.documents.findOneBy({ id: input.resourceId })
    if (found) {
      this.access.match(input, found)
      if (found.path !== input.path || found.modelKey !== input.modelKey) this.conflict()
      return contentDocumentDescriptor(found)
    }
    await this.access.check(input, true)
    await this.resources.authorize({ ...input.source, actor: input.actor, operation: 'write' })
    const model = this.models.getTextModel(input.modelKey, input.actor.organizationId)
    const disk = await this.files.read({ actor: input.actor, projectId: input.projectId, path: input.path })
    const stateBase64 = model.initialize(disk.buffer.toString('utf8'), input.anchors)
    model.validate(stateBase64)
    const seed = this.store.documents.create({ id: input.resourceId, tenantId: input.actor.tenantId,
      organizationId: input.actor.organizationId, projectId: input.projectId, path: input.path, title: input.title,
      modelKey: input.modelKey, schemaVersion: model.descriptor.schemaVersion, epoch: 1, sequence: 0,
      sourceProvider: input.source.providerKey, sourceId: input.source.resourceId, createdById: input.actor.userId,
      fileHash: disk.sha256, headRevisionId: null, collaborationId: null, status: 'pending' })
    return this.store.locked(seed, async () => {
      let document = await this.store.documents.findOneBy({ id: seed.id })
      if (document?.headRevisionId) { this.access.match(input, document); return contentDocumentDescriptor(document) }
      if (!document) document = await this.store.documents.save(seed)
      // Import preserves exact bytes; Tiptap formatting becomes a new version only after an edit.
      await this.store.publish(document, { mutationId: 'initial', markdown: disk.buffer.toString('utf8'),
        stateBase64, sequence: 0, label: 'Imported original', scope: input })
      return contentDocumentDescriptor(document)
    })
  }

  async get(input: ContentDocumentInput): Promise<ContentDocumentState> {
    const { document, canWrite } = await this.require(input)
    await this.recover(document)
    const record = await this.collab(input).ensureDocument({ providerKey: CONTENT_DOCUMENT_COLLABORATION,
      resourceId: `${document.id}:${document.epoch}`, schemaVersion: document.schemaVersion })
    if (document.collaborationId !== record.id) {
      await this.store.documents.update(document.id, { collaborationId: record.id })
      document.collaborationId = record.id
    }
    const state = await this.collab(input).getDocumentState({ documentId: record.id })
    const value = this.models.getTextModel(document.modelKey, input.actor.organizationId).read(state.updateBase64)
    const disk = await this.store.disk(document)
    const current = await this.store.documents.findOneByOrFail({ id: document.id })
    return { document: { ...contentDocumentDescriptor(current), sequence: state.sequenceNumber,
        status: current.status === 'ready' && state.sequenceNumber > current.sequence ? 'pending' : current.status },
      stateBase64: state.updateBase64, ...value, canWrite,
      externalChange: disk.hash !== current.fileHash || current.status === 'conflict' }
  }
  async session(input: ContentDocumentInput & { schemaVersion: number }) {
    let state = await this.get(input)
    if (input.schemaVersion !== state.document.schemaVersion) {
      await this.upgradeSchema(input, state)
      state = await this.get(input)
    }
    if (input.schemaVersion !== state.document.schemaVersion) this.conflict()
    const { document } = await this.require(input)
    if (!document.collaborationId) this.conflict()
    const session = await this.collab(input).createSession({ documentId: document.collaborationId,
      access: state.canWrite && !state.externalChange ? 'write' : 'read' })
    return { ...state, session }
  }
  /** Model upgrades retire the old room with the same CAS used by restore.
   * Never reparse Markdown: keep CRDT anchors and the exact project file bytes.
   * A concurrent accepted update makes retirement fail, so a retry reads it first.
   */
  private async upgradeSchema(input: ContentDocumentInput & { schemaVersion: number }, state: ContentDocumentState) {
    const { document } = await this.require(input, true)
    const model = this.models.getTextModel(document.modelKey, input.actor.organizationId)
    if (!model.upgrade || input.schemaVersion !== model.descriptor.schemaVersion ||
      input.schemaVersion <= state.document.schemaVersion || state.externalChange || state.document.status !== 'ready') this.conflict()
    const upgraded = model.upgrade(state.stateBase64, state.document.schemaVersion)
    model.validate(upgraded)
    await this.store.locked(document, async () => {
      const { document: current } = await this.require(input, true)
      if (current.schemaVersion === input.schemaVersion) return // Another opener completed the same upgrade.
      if (current.epoch !== state.document.epoch || current.schemaVersion !== state.document.schemaVersion ||
        current.sequence !== state.document.sequence || current.status !== 'ready' || !current.collaborationId) this.conflict()
      const disk = await this.store.disk(current)
      if (disk.hash !== current.fileHash) this.conflict()
      const retire = { documentId: current.collaborationId, expectedSequence: state.document.sequence }
      current.epoch++
      current.schemaVersion = input.schemaVersion
      current.collaborationId = null
      await this.store.publish(current, { mutationId: `schema:${current.epoch}:${input.schemaVersion}`,
        markdown: disk.buffer.toString('utf8'), stateBase64: upgraded, sequence: current.sequence + 1,
        label: `Schema ${input.schemaVersion}`, scope: input, retire })
    })
  }
  async update(input: ContentDocumentInput & { epoch: number; schemaVersion: number; updateBase64: string }) {
    const { document } = await this.require(input, true)
    if (document.epoch !== input.epoch || document.schemaVersion !== input.schemaVersion || !document.collaborationId) this.conflict()
    return this.collab(input).applyUpdate({ documentId: document.collaborationId, updateBase64: input.updateBase64, origin: 'content:editor' })
  }
  async history(input: ContentDocumentInput) {
    await this.require(input)
    return (await this.store.revisions.find({ where: { resourceId: input.resourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, status: 'committed' },
      order: { createdAt: 'DESC' }, take: 200 })).map(contentRevisionDescriptor)
  }
  async preview(input: ContentDocumentInput & { revisionId: string }) {
    const { document } = await this.require(input)
    const revision = await this.store.revisions.findOneByOrFail({ id: input.revisionId, resourceId: input.resourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, status: 'committed' })
    return { revision: contentRevisionDescriptor(revision), markdown: (await this.store.bytes(document, revision)).toString('utf8') }
  }
  async checkpoint(input: ContentDocumentInput & { label: string }) {
    const state = await this.get(input)
    if (state.externalChange || state.document.status !== 'ready') this.conflict()
    await this.require(input, true)
    await this.store.revisions.update(state.document.headRevisionId, { label: input.label.slice(0, 200) })
    return contentRevisionDescriptor(await this.store.revisions.findOneByOrFail({ id: state.document.headRevisionId }))
  }
  async relocate(input: ContentDocumentInput & { path: string; title: string }) {
    const { document } = await this.require(input, true)
    await this.store.locked(document, async () => {
      const { document: current } = await this.require(input, true)
      const disk = await this.files.read({ actor: input.actor, projectId: input.projectId, path: input.path })
      if (disk.sha256 !== current.fileHash) this.conflict()
      await this.store.documents.update(document.id, { path: input.path, title: input.title })
    })
  }
  async recover(document: ContentDocument) {
    await this.store.locked(document, async () => {
      const current = await this.store.documents.findOneByOrFail({ id: document.id })
      const pending = await this.store.revisions.find({ where: { resourceId: document.id, status: 'prepared' }, order: { createdAt: 'ASC' } })
      for (const revision of pending) await this.store.finish(current, revision)
      Object.assign(document, current)
    })
  }
  conflict(): never { throw new ConflictException(t('server-ai:Error.ContentVersionConflict')) }
}
