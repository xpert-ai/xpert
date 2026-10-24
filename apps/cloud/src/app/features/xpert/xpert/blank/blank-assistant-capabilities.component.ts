import { ChangeDetectionStrategy, Component, afterNextRender, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { BlankAssistantCapabilities } from './blank-assistant-capabilities'

@Component({
  selector: 'xp-blank-assistant-capabilities',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, ZardSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().options().length || state().loading() || state().error()) {
      <section class="mt-5 space-y-4 border-t border-components-panel-border pt-5">
        <h3 class="text-sm font-medium text-text-primary">{{ 'XP.Xpert.QuickCapabilities.Title' | translate }}</h3>
        @for (option of state().options(); track option.key) {
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h4 [id]="'capability-label-' + option.key" class="text-sm font-medium text-text-primary">
                {{ option.label }}
              </h4>
              <p [id]="'capability-description-' + option.key" class="mt-1 text-sm leading-6 text-text-secondary">
                {{ option.description }}
              </p>
            </div>
            <z-switch
              class="shrink-0"
              [attr.aria-labelledby]="'capability-label-' + option.key"
              [attr.aria-describedby]="'capability-description-' + option.key"
              [disabled]="disabled() || state().loading()"
              [checked]="state().selected().includes(option.key)"
              (change)="state().toggle(option.key, $event.checked)"
              ><span class="sr-only">{{ option.label }}</span></z-switch
            >
          </div>
        }
        @if (state().loading()) {
          <p role="status" class="text-sm text-text-secondary">{{ 'XP.COMMON.Loading' | translate }}</p>
        }
        @if (state().error()) {
          <p role="alert" class="text-sm text-text-destructive">{{ state().error() }}</p>
          @if (!state().loaded()) {
            <button
              type="button"
              z-button
              zType="ghost"
              [zDisabled]="state().loading() || disabled()"
              (click)="state().load()"
            >
              {{ 'XP.ACTIONS.Retry' | translate }}
            </button>
          }
        }
      </section>
    }
  `
})
export class BlankAssistantCapabilitiesComponent {
  readonly state = input.required<BlankAssistantCapabilities>()
  readonly disabled = input(false)

  constructor() {
    afterNextRender(() => void this.state().load())
  }
}
