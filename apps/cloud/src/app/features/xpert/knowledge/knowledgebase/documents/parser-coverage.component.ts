import { Component, computed, input } from '@angular/core'
import { ZardBadgeComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { DocumentParserDiagnostics } from '@xpert-ai/contracts'

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
    } @else {
      <ng-content />
    }
  `
})
export class ParserCoverageComponent {
  readonly diagnostics = input<DocumentParserDiagnostics | undefined>()
  readonly compact = input(false)
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
