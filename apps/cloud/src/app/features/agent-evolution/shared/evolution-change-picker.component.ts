import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardComboboxComponent } from '@xpert-ai/headless-ui'
import { startWith } from 'rxjs'
import type { EvolutionChangeEntry, EvolutionChangeFilter } from './evolution-change-presentation'

@Component({
  selector: 'xp-evolution-change-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, ZardButtonComponent, ZardComboboxComponent],
  template: ` <section class="flex flex-wrap items-center gap-3 border-b border-divider-regular pb-4">
    <div
      class="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1"
      role="group"
      [attr.aria-label]="'XP.AgentEvolution.StatusLabel' | translate"
    >
      @for (type of types(); track type) {
        <button
          z-button
          zSize="sm"
          zType="ghost"
          type="button"
          [class]="
            filter() === type
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border hover:bg-background'
              : 'text-muted-foreground'
          "
          [attr.aria-pressed]="filter() === type"
          (click)="filterChange.emit(type)"
        >
          {{ statusLabel(type) }}
          <span class="text-xs text-text-secondary">{{ count(type) }}</span>
        </button>
      }
    </div>
    <z-combobox
      class="min-w-0 w-full sm:w-96 lg:w-[32rem]"
      zWidth="full"
      [value]="selectedId()"
      [options]="options()"
      [ariaLabel]="'XP.AgentEvolution.ChangeRecord' | translate"
      [placeholder]="'XP.AgentEvolution.SelectChange' | translate"
      [searchPlaceholder]="'XP.AgentEvolution.SearchChange' | translate"
      [emptyText]="'XP.AgentEvolution.NoChanges' | translate"
      (zValueChange)="selectionChange.emit($event)"
    />
  </section>`
})
export class EvolutionChangePickerComponent {
  readonly items = input.required<EvolutionChangeEntry[]>()
  readonly filter = input.required<EvolutionChangeFilter>()
  readonly selectedId = input<string | null>(null)
  readonly filterChange = output<EvolutionChangeFilter>()
  readonly selectionChange = output<string | null>()
  readonly types = computed(() => ['all', ...new Set(this.items().map((item) => item.publicationStatus))])
  private readonly translate = inject(TranslateService)
  private readonly locale = toSignal(this.translate.onLangChange.pipe(startWith(null)))
  readonly options = computed(() => {
    this.locale()
    return this.items()
      .filter((item) => this.filter() === 'all' || item.publicationStatus === this.filter())
      .map((item) => ({
        value: item.id,
        label: `${item.title} · ${this.statusLabel(item.status)}`
      }))
  })
  statusLabel(status: string) {
    if (status === 'all') return this.translate.instant('XP.AgentEvolution.AllChanges')
    for (const prefix of [
      'XP.AgentEvolution.PublicationStatus.',
      'XP.AgentEvolution.Status.',
      'XP.AgentEvolution.ResourceStatus.'
    ]) {
      const value = this.translate.instant(prefix + status)
      if (value !== prefix + status) return value
    }
    return status
  }
  count(type: EvolutionChangeFilter) {
    return this.items().filter((item) => type === 'all' || item.publicationStatus === type).length
  }
}
