// A workspace file has one in-memory draft. Views own their editor instances and display modes.
import { Injectable, OnDestroy } from '@angular/core'
import type { TFile } from '@xpert-ai/contracts'

export interface FileDocumentSnapshot {
  file: TFile
  content: string
  url: string | null
  buffer: ArrayBuffer | null
  binary: File | null
}

export type FileDocumentUpdate = 'draft' | 'dirty' | 'saved' | 'discarded' | 'saving' | 'error'
type Listener = (update: FileDocumentUpdate, source?: object) => void
type ExportDraft = (finishEditing: boolean) => Promise<File | null>

export class SharedFileDocument {
  baseline: FileDocumentSnapshot
  draft: FileDocumentSnapshot
  dirty = false
  saving = false
  synchronizing = false
  revision = 0
  readonly #listeners = new Set<Listener>()
  readonly #urls = new Set<string>()
  #writer: object | null = null
  #exportDraft: ExportDraft | null = null
  #capture: Promise<void> = Promise.resolve()
  #captureError: unknown = null
  #disposed = false

  constructor(snapshot: FileDocumentSnapshot, ownedUrl: string | null) {
    this.baseline = snapshot
    this.draft = snapshot
    if (ownedUrl) this.#urls.add(ownedUrl)
  }

  subscribe(listener: Listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  changeText(content: string, source: object) {
    if (this.saving) return
    this.revision++
    this.draft = { ...this.draft, content }
    this.dirty = content !== this.baseline.content
    this.notify('draft', source)
  }

  changeBinary(source: object, exportDraft: ExportDraft) {
    if (this.saving) return
    this.revision++
    this.#writer = source
    this.#exportDraft = exportDraft
    this.dirty = true
    this.synchronizing = true
    this.notify('dirty', source)
    // Batch the mutations from one user action into one in-memory export.
    this.capture(false, true)
  }

  detachWriter(source: object) {
    if (this.#writer === source) {
      this.revision++
      this.capture(false)
      this.#writer = null
      this.#exportDraft = null
    }
  }

  private capture(finishEditing: boolean, defer = false) {
    const exportDraft = this.#exportDraft
    if (!exportDraft) return
    const revision = this.revision
    const writer = this.#writer
    this.#capture = (async () => {
      try {
        if (defer) await Promise.resolve()
        if (this.#disposed || revision !== this.revision) return
        const binary = await exportDraft(finishEditing)
        if (!binary) throw new Error('Document editor is not ready')
        const buffer = await binary.arrayBuffer()
        if (this.#disposed || revision !== this.revision) return
        const url = URL.createObjectURL(binary)
        this.#urls.add(url)
        this.draft = { ...this.draft, binary, buffer, url }
        this.#captureError = null
        this.synchronizing = false
        this.notify('draft', writer ?? undefined)
        this.releaseUnusedUrls()
      } catch (error) {
        if (revision === this.revision) {
          this.#captureError = error
          this.synchronizing = false
          this.notify('error', writer ?? undefined)
        }
      }
    })()
  }

  async flush(finishEditing = false) {
    if (finishEditing && this.#exportDraft) this.capture(true)
    let capture: Promise<void>
    do {
      capture = this.#capture
      await capture
    } while (capture !== this.#capture)
    if (this.#captureError) throw this.#captureError
  }

  beginSave() {
    if (this.saving) return false
    this.saving = true
    this.notify('saving')
    return true
  }

  endSave() {
    this.saving = false
    this.notify('saving')
  }

  saved(file?: TFile) {
    this.revision++
    this.draft = { ...this.draft, file: file ?? this.draft.file, content: file?.contents ?? this.draft.content }
    this.baseline = this.draft
    this.dirty = false
    this.synchronizing = false
    this.#exportDraft = null
    this.#writer = null
    this.notify('saved')
    this.releaseUnusedUrls()
  }

  discard() {
    if (this.saving) return
    this.revision++
    this.#exportDraft = null
    this.#writer = null
    this.#captureError = null
    this.draft = this.baseline
    this.synchronizing = false
    this.dirty = false
    this.notify('discarded')
    this.releaseUnusedUrls()
  }

  replace(snapshot: FileDocumentSnapshot, ownedUrl: string | null) {
    this.revision++
    if (ownedUrl) this.#urls.add(ownedUrl)
    this.baseline = snapshot
    this.draft = snapshot
    this.notify('saved')
    this.releaseUnusedUrls()
  }

  dispose() {
    this.#disposed = true
    this.#listeners.clear()
    this.#exportDraft = null
    for (const url of this.#urls) URL.revokeObjectURL(url)
    this.#urls.clear()
  }

  private notify(update: FileDocumentUpdate, source?: object) {
    for (const listener of this.#listeners) listener(update, source)
  }

  private releaseUnusedUrls() {
    for (const url of this.#urls) {
      if (url !== this.baseline.url && url !== this.draft.url) {
        URL.revokeObjectURL(url)
        this.#urls.delete(url)
      }
    }
  }
}

@Injectable()
export class FileDocumentStore implements OnDestroy {
  readonly #documents = new Map<string, SharedFileDocument>()

  key(scope: string, path: string) {
    const normalized = path
      .replace(/\\/g, '/')
      .replace(/^\/workspace\//, '')
      .replace(/^(?:\.\/|\/)+/, '')
    return JSON.stringify([scope, normalized])
  }

  get(key: string) {
    return this.#documents.get(key)
  }

  open(key: string, snapshot: FileDocumentSnapshot, ownedUrl: string | null) {
    const existing = this.#documents.get(key)
    if (existing) {
      if (ownedUrl && ownedUrl !== existing.draft.url && ownedUrl !== existing.baseline.url)
        URL.revokeObjectURL(ownedUrl)
      return existing
    }
    const document = new SharedFileDocument(snapshot, ownedUrl)
    this.#documents.set(key, document)
    return document
  }

  ngOnDestroy() {
    for (const document of this.#documents.values()) document.dispose()
    this.#documents.clear()
  }
}

export function workspaceDocumentScope(xpertId?: string | null, projectId?: string | null) {
  return projectId ? `project:${projectId}` : xpertId ? `xpert:${xpertId}` : null
}
