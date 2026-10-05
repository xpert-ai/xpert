import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type { AssistantCapabilityConfiguration, RealtimeModelOption, RealtimeVoiceSelection } from '@xpert-ai/contracts'
import { ZardSelectImports, ZardSwitchComponent, type ZardSelectValue } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-settings-realtime-voice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, ZardSwitchComponent, ...ZardSelectImports],
  template: `
    <section class="space-y-4 border-b border-divider-regular pb-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold">{{ 'XP.XpertSettings.RealtimeVoice.Title' | translate }}</h3>
          <p class="mt-1 text-sm leading-5 text-text-tertiary">
            {{ 'XP.XpertSettings.RealtimeVoice.Description' | translate }}
          </p>
        </div>
        <z-switch
          class="mt-1 shrink-0"
          [ngModel]="enabled()"
          [disabled]="disabled() || option().required || (!option().available && !enabled())"
          (ngModelChange)="enabledChange.emit($event)"
        >
          <span class="sr-only">{{ 'XP.XpertSettings.RealtimeVoice.Title' | translate }}</span>
        </z-switch>
      </div>
      @if (!option().available) {
        <p class="text-sm text-text-warning">
          {{ option().reason || ('XP.XpertSettings.RealtimeVoice.Unavailable' | translate) }}
        </p>
      }
      @if (option().required) {
        <p class="text-sm text-text-tertiary">{{ 'XP.XpertSettings.Capabilities.ManagedInStudio' | translate }}</p>
      }
      @if (enabled()) {
        <div class="space-y-2">
          <div id="realtime-model-label" class="text-base font-medium">
            {{ 'XP.XpertSettings.RealtimeVoice.Model' | translate }}
          </div>
          <z-select
            zSize="lg"
            class="block"
            [zValue]="selection()?.modelId ?? null"
            [zDisabled]="disabled()"
            [zPlaceholder]="'XP.XpertSettings.RealtimeVoice.SelectModel' | translate"
            aria-labelledby="realtime-model-label"
            (zSelectionChange)="selectModel($event)"
          >
            @if (selection()?.modelId && !model()) {
              <z-select-item [zValue]="selection().modelId">{{
                'XP.XpertSettings.RealtimeVoice.SavedModelUnavailable' | translate
              }}</z-select-item>
            }
            @for (entry of models(); track entry.id) {
              <z-select-item [zValue]="entry.id">{{ entry.label }}</z-select-item>
            }
          </z-select>
        </div>
        <div class="space-y-2">
          <div id="realtime-voice-label" class="text-base font-medium">
            {{ 'XP.XpertSettings.RealtimeVoice.Voice' | translate }}
          </div>
          <z-select
            zSize="lg"
            class="block"
            [zValue]="selection()?.voice ?? null"
            [zDisabled]="disabled() || !model()"
            [zPlaceholder]="'XP.XpertSettings.RealtimeVoice.SelectVoice' | translate"
            aria-labelledby="realtime-voice-label"
            (zSelectionChange)="selectVoice($event)"
          >
            @for (voice of model()?.voices ?? []; track voice.id) {
              <z-select-item [zValue]="voice.id">{{ voice.label }}</z-select-item>
            }
          </z-select>
        </div>
        @if (!valid()) {
          <p role="alert" class="text-sm text-text-warning">
            {{ 'XP.XpertSettings.RealtimeVoice.InvalidSelection' | translate }}
          </p>
        }
      }
    </section>
  `
})
export class SettingsRealtimeVoiceComponent {
  readonly option = input.required<AssistantCapabilityConfiguration['options'][number]>()
  readonly enabled = input(false)
  readonly disabled = input(false)
  readonly models = input<RealtimeModelOption[]>([])
  readonly selection = input<RealtimeVoiceSelection>()
  readonly enabledChange = output<boolean>()
  readonly selectionChange = output<RealtimeVoiceSelection>()
  readonly model = computed(() => this.models().find((entry) => entry.id === this.selection()?.modelId))
  readonly valid = computed(() => this.model()?.voices.some((voice) => voice.id === this.selection()?.voice))

  selectModel(value: ZardSelectValue | ZardSelectValue[]) {
    const model = this.models().find((entry) => entry.id === value)
    if (model) this.selectionChange.emit({ modelId: model.id, voice: model.defaultVoice })
  }

  selectVoice(value: ZardSelectValue | ZardSelectValue[]) {
    const model = this.model()
    const voice = model?.voices.find((entry) => entry.id === value)
    if (voice) this.selectionChange.emit({ modelId: model.id, voice: voice.id })
  }
}
