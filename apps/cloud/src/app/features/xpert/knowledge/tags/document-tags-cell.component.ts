import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgeDocumentTag } from '@xpert-ai/contracts'
import { ZardBadgeComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-document-tags-cell',
  standalone: true,
  imports: [TranslateModule, ZardBadgeComponent],
  template: `
    <div class="flex min-w-0 flex-wrap items-center gap-1">
      @for (item of visible(); track item.tagId) {
        <z-badge
          zType="outline"
          zShape="pill"
          class="max-w-full"
          [title]="item.tag.name + ' · ' + (prefix + item.source | translate)"
        >
          @if (item.source === 'automatic') {
            <i class="ri-sparkling-line mr-1 shrink-0" aria-hidden="true"></i>
          }
          <span class="truncate">{{ item.tag.name }}</span>
        </z-badge>
      }
      @if (remaining().length) {
        <z-badge zType="secondary" zShape="pill" [title]="remainingNames()">+{{ remaining().length }}</z-badge>
      }
      @if (!ordered().length) {
        <span class="text-text-quaternary">—</span>
      }
    </div>
  `
})
export class DocumentTagsCellComponent {
  readonly assignments = input<readonly IKnowledgeDocumentTag[] | null | undefined>()
  readonly prefix = 'XP.Knowledgebase.AutomaticTagging.'
  readonly ordered = computed(() =>
    [...(this.assignments() ?? [])].sort(
      (a, b) => Number(a.source === 'automatic') - Number(b.source === 'automatic') || a.tagId.localeCompare(b.tagId)
    )
  )
  readonly visible = computed(() => this.ordered().slice(0, 3))
  readonly remaining = computed(() => this.ordered().slice(3))
  readonly remainingNames = computed(() =>
    this.remaining()
      .map((item) => item.tag.name)
      .join('、')
  )
}
