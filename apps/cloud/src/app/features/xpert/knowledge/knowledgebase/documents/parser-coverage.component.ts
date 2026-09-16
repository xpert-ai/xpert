import { Component, computed, input } from '@angular/core'
import { ZardBadgeComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { DocumentParserDiagnostics, KnowledgeImageUnderstandingWarning } from '@xpert-ai/contracts'

@Component({
  selector: 'xp-parser-coverage',
  standalone: true,
  imports: [TranslateModule, ZardBadgeComponent],
  template: `
    @if (pendingPages().length) {
      @if (compact()) {
        <z-badge zType="outline" zShape="pill" class="border-text-warning/30 bg-text-warning/10 text-text-warning">{{
          'XP.Knowledgebase.ParserCoverageIncomplete' | translate
        }}</z-badge>
      } @else {
        <div
          role="status"
          class="mt-4 rounded-lg border border-text-warning/30 bg-text-warning/5 p-3 text-sm text-text-warning"
        >
          {{ 'XP.Knowledgebase.ParserCoveragePages' | translate: { pages: pendingPages().join(', ') } }}
        </div>
      }
    } @else if (compact() && failedCount()) {
      <z-badge zType="outline" zShape="pill" class="border-text-warning/30 bg-text-warning/10 text-text-warning">{{
        'XP.Knowledgebase.ParserImagesIncomplete' | translate
      }}</z-badge>
    } @else {
      <ng-content />
    }
    @if (!compact() && warnings()?.length) {
      <div role="status" class="mt-4 rounded-lg border border-divider-subtle p-3 text-sm text-text-secondary">
        @if (failedCount()) {
          <p class="text-text-warning">
            {{ 'XP.Knowledgebase.ParserImagesFailed' | translate: { count: failedCount() } }}
          </p>
        }
        @if (skippedCount()) {
          <p>{{ 'XP.Knowledgebase.ParserImagesSkipped' | translate: { count: skippedCount() } }}</p>
        }
        <ul class="mt-2 list-inside list-disc break-words">
          @for (warning of warnings(); track $index) {
            <li>{{ warning.message }}</li>
          }
        </ul>
      </div>
    }
  `
})
export class ParserCoverageComponent {
  readonly diagnostics = input<DocumentParserDiagnostics | undefined>()
  readonly compact = input(false)
  readonly warnings = input<KnowledgeImageUnderstandingWarning[] | undefined>()
  readonly failedCount = computed(() => this.warningCount('image_understanding_failed'))
  readonly skippedCount = computed(() => this.warningCount('image_understanding_skipped'))
  private warningCount(type: KnowledgeImageUnderstandingWarning['type']) {
    return (
      this.warnings()
        ?.filter((warning) => warning.type === type)
        .reduce((count, warning) => count + (warning.assetCount ?? 1), 0) ?? 0
    )
  }
  readonly pendingPages = computed(() =>
    [
      ...new Set(
        this.diagnostics()
          ?.pages.filter((page) => page.status === 'needs-ocr')
          .map((page) => page.page) ?? []
      )
    ].sort((a, b) => a - b)
  )
}
