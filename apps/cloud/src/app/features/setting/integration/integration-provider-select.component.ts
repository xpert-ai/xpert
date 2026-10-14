import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TIntegrationProvider } from '@xpert-ai/contracts'
import { XpI18nPipe, ZardComboboxComponent, ZardComboboxOptionTemplateDirective } from '@xpert-ai/headless-ui'
import { IconComponent } from '../../../@shared/avatar'

@Component({
  standalone: true,
  selector: 'xp-integration-provider-select',
  imports: [TranslateModule, XpI18nPipe, IconComponent, ZardComboboxComponent, ZardComboboxOptionTemplateDirective],
  providers: [XpI18nPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <z-combobox
      zWidth="full"
      class="block min-w-0 pointer-coarse:[&_button]:min-h-[44px]"
      [value]="value()"
      [options]="options()"
      [placeholder]="placeholder()"
      [ariaLabel]="'XP.Integration.Provider' | translate: { Default: 'Provider' }"
      [searchPlaceholder]="'XP.IntegrationSettings.SearchProviders' | translate"
      [emptyText]="'XP.IntegrationSettings.NoProviders' | translate"
      (zValueChange)="value.set($event)"
    >
      <ng-template zComboboxOption let-option>
        <div class="flex min-w-0 items-start gap-3 py-1">
          @if (option.data.icon) {
            <xp-icon
              [icon]="option.data.icon"
              class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"
            />
          } @else if (option.data.avatar) {
            <img
              class="size-8 shrink-0 rounded-md object-contain"
              [src]="'/assets/images/integrations/' + option.data.avatar"
              alt=""
            />
          }
          <div class="min-w-0">
            <span class="block text-sm font-medium">{{ option.label }}</span>
            <span class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ option.data.description | i18n }}</span>
          </div>
        </div>
      </ng-template>
    </z-combobox>
  `
})
export class IntegrationProviderSelectComponent {
  private readonly translate = inject(TranslateService)
  private readonly i18n = inject(XpI18nPipe)
  private readonly language = toSignal(this.translate.onLangChange)
  readonly providers = input<TIntegrationProvider[]>([])
  readonly placeholder = input('')
  readonly value = model<string | null>(null)
  readonly options = computed(() => {
    this.language()
    return this.providers().map((provider) => ({
      value: provider.name,
      label: this.i18n.transform(provider.label) || provider.name,
      command: provider.name + ' ' + this.i18n.transform(provider.description),
      data: provider
    }))
  })
}
