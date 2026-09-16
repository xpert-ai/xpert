import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { getTagTargets, IKnowledgeDocumentTag, ITag } from '@xpert-ai/contracts'
import { ZardAccordionImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { KnowledgeTagsService } from '@cloud/app/@core/services/knowledge-tags.service'

@Component({
  selector: 'xp-knowledge-tags',
  standalone: true,
  imports: [FormsModule, TranslateModule, ...ZardAccordionImports, ZardButtonComponent, ZardInputDirective],
  template: `
    <z-accordion zType="single" zCollapsible>
      <z-accordion-item
        zValue="tags"
        [zTitle]="prefix + 'Catalog' | translate"
        (opened)="open()"
        (closed)="opened = false"
      >
        <div class="space-y-3 py-3">
          <p class="text-sm text-text-tertiary">
            {{ prefix + (documentId() ? 'DocumentHelp' : 'CatalogHelp') | translate }}
          </p>
          @if (loading()) {
            <p class="text-sm text-text-tertiary">{{ prefix + 'Loading' | translate }}</p>
          }
          @if (error()) {
            <p class="text-sm text-text-destructive">{{ error() }}</p>
          }
          @if (!canEdit() && !loading()) {
            <p class="text-sm text-text-tertiary">{{ prefix + 'ReadOnly' | translate }}</p>
          }
          @if (documentId()) {
            @for (item of assigned(); track item.tagId) {
              <div class="flex items-center gap-2 text-sm">
                <span class="font-medium">{{ item.tag.name }}</span>
                <span class="text-text-tertiary">{{ prefix + item.source | translate }}</span>
                @if (canEdit()) {
                  @if (item.source === 'automatic') {
                    <button z-button zType="ghost" zSize="sm" [zDisabled]="busy()" (click)="assign(item.tagId)">
                      {{ prefix + 'ConfirmManual' | translate }}
                    </button>
                  }
                  <button z-button zType="ghost" zSize="sm" [zDisabled]="busy()" (click)="unassign(item.tagId)">
                    {{ prefix + 'Remove' | translate }}
                  </button>
                }
              </div>
            }
          } @else {
            @for (tag of tags(); track tag.id) {
              <div class="flex items-center justify-between gap-2 text-sm">
                <div>
                  <span class="font-medium">{{ tag.name }}</span>
                  <span class="text-text-tertiary">{{ tag.description }}</span>
                  @if (tag.isActive === false) {
                    <span class="text-text-tertiary">{{ prefix + 'Inactive' | translate }}</span>
                  }
                </div>
                @if (canEdit()) {
                  <button z-button zType="ghost" zSize="sm" [zDisabled]="busy()" (click)="unselect(tag.id)">
                    {{ prefix + 'Remove' | translate }}
                  </button>
                }
              </div>
            }
          }
          @if (canEdit()) {
            <input z-input [placeholder]="prefix + 'Search' | translate" [(ngModel)]="search" />
            <div class="flex flex-wrap gap-2">
              @for (tag of options(); track tag.id) {
                <button
                  z-button
                  zType="outline"
                  zSize="sm"
                  [zDisabled]="busy()"
                  (click)="documentId() ? assign(tag.id) : select(tag.id)"
                >
                  + {{ tag.name }}
                </button>
              }
            </div>
          }
          @if (!loading() && !error() && !tags().length) {
            <p class="text-sm text-text-tertiary">{{ prefix + 'Empty' | translate }}</p>
          }
          <button z-button zType="ghost" zSize="sm" [zDisabled]="busy() || loading()" (click)="refresh()">
            {{ prefix + 'Refresh' | translate }}
          </button>
        </div>
      </z-accordion-item>
    </z-accordion>
  `
})
export class KnowledgeTagsComponent {
  readonly knowledgebaseId = input.required<string>()
  readonly documentId = input<string>()
  readonly prefix = 'XP.Knowledgebase.AutomaticTagging.'
  readonly tags = signal<ITag[]>([])
  readonly catalog = signal<ITag[]>([])
  readonly assigned = signal<IKnowledgeDocumentTag[]>([])
  readonly canEdit = signal(false)
  readonly search = signal('')
  readonly options = computed(() => {
    const ids = new Set(
      this.documentId() ? this.assigned().map((item) => item.tagId) : this.tags().map((tag) => tag.id)
    )
    const availableIds = new Set(this.catalog().map((tag) => tag.id))
    const query = this.search().trim().toLocaleLowerCase()
    return (this.documentId() ? this.tags() : this.catalog()).filter(
      (tag) =>
        availableIds.has(tag.id) &&
        !ids.has(tag.id) &&
        tag.isActive !== false &&
        getTagTargets(tag).includes('knowledgebase') &&
        (!query || tag.name?.toLocaleLowerCase().includes(query))
    )
  })
  readonly loading = signal(false)
  readonly busy = signal(false)
  readonly error = signal<string | null>(null)
  readonly api = inject(KnowledgeTagsService)
  private readonly toastr = injectToastr()
  opened = false
  private revision = 0

  constructor() {
    effect(() => {
      this.knowledgebaseId()
      this.documentId()
      this.revision++
      this.tags.set([])
      this.catalog.set([])
      this.assigned.set([])
      this.canEdit.set(false)
      this.search.set('')
      if (this.opened) void this.refresh()
    })
  }

  open() {
    this.opened = true
    void this.refresh()
  }

  async refresh() {
    const revision = ++this.revision
    const kbId = this.knowledgebaseId(),
      docId = this.documentId()
    this.loading.set(true)
    this.error.set(null)
    this.canEdit.set(false)
    try {
      const [catalog, assigned] = await Promise.all([
        firstValueFrom(this.api.list(kbId)),
        docId ? firstValueFrom(this.api.documentTags(kbId, docId)) : Promise.resolve([])
      ])
      if (revision === this.revision) {
        this.tags.set(catalog.tags)
        this.catalog.set(catalog.available)
        this.canEdit.set(catalog.canEdit)
        this.assigned.set(assigned)
      }
    } catch (error) {
      if (revision === this.revision) this.error.set(getErrorMessage(error))
    } finally {
      if (revision === this.revision) this.loading.set(false)
    }
  }

  select(tagId: string) {
    return this.mutate(() => firstValueFrom(this.api.select(this.knowledgebaseId(), tagId)))
  }
  unselect(tagId: string) {
    return this.mutate(() => firstValueFrom(this.api.remove(this.knowledgebaseId(), tagId)))
  }
  assign(tagId: string) {
    return this.mutate(() => firstValueFrom(this.api.addManual(this.knowledgebaseId(), this.documentId(), tagId)))
  }
  unassign(tagId: string) {
    return this.mutate(() => firstValueFrom(this.api.removeManual(this.knowledgebaseId(), this.documentId(), tagId)))
  }

  private async mutate(run: () => Promise<unknown>) {
    if (this.busy() || !this.canEdit()) return
    const revision = this.revision
    this.busy.set(true)
    try {
      await run()
      if (revision === this.revision) await this.refresh()
    } catch (error) {
      if (revision === this.revision) this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}
