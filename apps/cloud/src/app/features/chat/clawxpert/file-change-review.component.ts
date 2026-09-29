import { countFileChangeLines } from '@xpert-ai/chatkit-types'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  untracked
} from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardMenuImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { FileChangeReviewService, type FileChangeResource } from '../../../@core/services/file-change-review.service'
import { FileChangeDiffComponent } from './file-change-diff.component'
import {
  fileReviewKey,
  hasReviewText,
  type FileChangeReviewTab,
  type FileReviewEntry,
  type FileDiffStats
} from './file-change-review.types'

@Component({
  standalone: true,
  selector: 'xp-file-change-review',
  imports: [TranslateModule, ZardButtonComponent, ...ZardMenuImports, ...ZardTooltipImports, FileChangeDiffComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background-default text-text-primary' },
  templateUrl: './file-change-review.component.html'
})
export class FileChangeReviewComponent implements OnDestroy {
  private readonly service = inject(FileChangeReviewService)
  readonly tab = input.required<FileChangeReviewTab>()
  readonly active = input(true)
  readonly selectedLabel = computed(() =>
    this.tab().resource.type === 'file_change_set' ? 'FileActivity.MessageChanges' : 'FileActivity.SelectedChange'
  )
  readonly scope = signal<'selected' | 'conversation'>('selected')
  readonly entries = signal<FileReviewEntry[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly sideBySide = signal(true)
  readonly wordWrap = signal(false)
  readonly showWhitespace = signal(false)
  readonly showMetadata = signal(false)
  readonly showFiles = signal(false)
  readonly collapsed = signal<ReadonlySet<string>>(new Set())
  readonly counts = signal<ReadonlyMap<string, FileDiffStats>>(new Map())
  readonly allCollapsed = computed(
    () => this.entries().length > 0 && this.entries().every((entry) => this.collapsed().has(entry.key))
  )
  readonly totals = computed(() => {
    const entries = this.entries().filter((entry) => entry.report && hasReviewText(entry.report))
    const counted = entries.filter((entry) => this.counts().has(entry.key))
    if (!counted.length) return null
    return counted.reduce(
      (total, entry) => ({
        added: total.added + this.counts().get(entry.key)!.added,
        removed: total.removed + this.counts().get(entry.key)!.removed
      }),
      { added: 0, removed: 0 }
    )
  })
  readonly hasText = hasReviewText
  private request = 0

  constructor() {
    effect(() => {
      const tab = this.tab()
      untracked(() => {
        this.scope.set('selected')
        void this.load(tab, 'selected')
      })
    })
  }

  selectScope(scope: 'selected' | 'conversation') {
    this.scope.set(scope)
    void this.load(this.tab(), scope)
  }
  refresh() {
    void this.load(this.tab(), this.scope())
  }

  private async load(tab: FileChangeReviewTab, scope: 'selected' | 'conversation') {
    const request = ++this.request
    this.loading.set(true)
    this.failed.set(false)
    this.entries.set([])
    this.collapsed.set(new Set())
    this.counts.set(new Map())
    try {
      const targets: { path: string; resource?: FileChangeResource }[] =
        scope === 'conversation' && tab.conversationId
          ? (await this.service.listChanges(tab.conversationId)).map((change) => ({
              path: change.workspacePath,
              resource: change.resource?.type === 'file_change' ? change.resource : undefined
            }))
          : tab.resource.type === 'file_change_set'
            ? tab.resource.changes.map(({ workspacePath, resource }) => ({ path: workspacePath, resource }))
            : [{ path: '', resource: tab.resource }]
      if (request !== this.request) return
      const entries: FileReviewEntry[] = []
      for (let offset = 0; offset < targets.length; offset += 4) {
        const batch = await Promise.all(
          targets.slice(offset, offset + 4).map(async ({ path, resource }) => {
            const key = resource ? fileReviewKey(resource) : path
            if (!resource) return { key, path, unavailable: true }
            try {
              const report = await this.service.loadReport(resource)
              if (path && path !== report.workspacePath) throw new Error('File change path mismatch')
              return { key, path: report.workspacePath, report }
            } catch {
              return { key, path, unavailable: true }
            }
          })
        )
        if (request !== this.request) return
        entries.push(...batch)
      }
      const counts = new Map<string, FileDiffStats>()
      for (const entry of entries) {
        if (!entry.report) continue
        const stats = countFileChangeLines(entry.report)
        if (stats.status === 'ready') counts.set(entry.key, { added: stats.added, removed: stats.removed })
      }
      this.counts.set(counts)
      this.entries.set(entries)
    } catch {
      if (request === this.request) this.failed.set(true)
    } finally {
      if (request === this.request) this.loading.set(false)
    }
  }

  toggle(key: string) {
    this.collapsed.update((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  toggleAll() {
    this.collapsed.set(this.allCollapsed() ? new Set() : new Set(this.entries().map((entry) => entry.key)))
  }
  ngOnDestroy() {
    ++this.request
  }
}
