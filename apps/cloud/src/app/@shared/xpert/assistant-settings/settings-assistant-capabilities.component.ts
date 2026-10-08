import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { AssistantCapabilityConfiguration, RealtimeVoiceSelection } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { cloneDeep, isEqual } from 'lodash-es'
import { XpertAPIService } from '@cloud/app/@core/services/xpert.service'
import { getErrorMessage } from '@cloud/app/@core/types'
import { SettingsCapabilitiesComponent } from './settings-capabilities.component'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { SettingsRealtimeVoiceComponent } from './settings-realtime-voice.component'

@Component({
  selector: 'xp-settings-assistant-capabilities',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardSwitchComponent,
    SettingsCapabilitiesComponent,
    SettingsRealtimeVoiceComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-assistant-capabilities.component.html'
})
export class SettingsAssistantCapabilitiesComponent {
  readonly page = input<'capabilities' | 'speech'>('capabilities')
  readonly editor = inject(XpertSettingsEditor)
  private readonly api = inject(XpertAPIService)
  private readonly translate = inject(TranslateService)
  private readonly destroyRef = inject(DestroyRef)
  readonly loading = signal(false)
  readonly applying = signal(false)
  readonly error = signal<string | null>(null)
  readonly configuration = signal<AssistantCapabilityConfiguration | null>(null)
  readonly selected = signal<string[]>([])
  readonly sandboxCapabilityKey = 'sandbox-tools'
  readonly voiceCapabilityKey = 'realtime-voice'
  readonly voice = signal<RealtimeVoiceSelection | undefined>(undefined)
  private readonly appliedVoice = signal<RealtimeVoiceSelection | undefined>(undefined)
  readonly voiceOption = computed(() =>
    this.configuration()?.options.find((option) => option.key === this.voiceCapabilityKey)
  )
  readonly voiceEnabled = computed(
    () => this.voiceOption()?.required || this.selected().includes(this.voiceCapabilityKey)
  )
  readonly voiceDirty = computed(
    () =>
      this.selected().includes(this.voiceCapabilityKey) !== this.applied().includes(this.voiceCapabilityKey) ||
      (this.voiceEnabled() && !isEqual(this.voice(), this.appliedVoice()))
  )
  readonly pendingSection = computed(() => (this.voiceDirty() ? ('speech' as const) : ('capabilities' as const)))
  private readonly applied = signal<string[]>([])
  private changed = false
  readonly provider = new FormControl(this.editor.source.draft().team.features?.sandbox?.provider ?? '', {
    nonNullable: true
  })
  private readonly providerValue = toSignal(this.provider.valueChanges, { initialValue: this.provider.value })
  private readonly appliedProvider = signal(this.provider.value)
  readonly sandboxEnabled = computed(
    () =>
      this.configuration()?.options.some(
        (option) =>
          option.key === this.sandboxCapabilityKey && (option.required || this.selected().includes(option.key))
      ) ?? false
  )
  readonly dirty = computed(() => {
    return (
      !isEqual([...this.selected()].sort(), [...this.applied()].sort()) ||
      (this.sandboxEnabled() && this.providerValue() !== this.appliedProvider()) ||
      this.voiceDirty()
    )
  })

  constructor() {
    afterNextRender(() => void this.load())
  }

  async load() {
    if (this.loading() || this.applying() || this.editor.composing()) return
    this.loading.set(true)
    this.editor.composing.set(true)
    this.error.set(null)
    try {
      const result = await firstValueFrom(this.api.getAssistantCapabilities(this.editor.source.id))
      if (this.destroyRef.destroyed) return
      this.configuration.set(result)
      if (!this.dirty()) {
        this.selected.set(result.selected)
        this.voice.set(result.realtimeVoice)
        this.appliedProvider.set(this.provider.value)
      }
      this.appliedVoice.set(result.realtimeVoice)
      this.applied.set(result.selected)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
      this.editor.composing.set(false)
    }
  }

  toggle(key: string, enabled: boolean) {
    if (this.editor.composing() || this.editor.publishing()) return
    this.selected.update((selected) =>
      enabled ? [...new Set([...selected, key])] : selected.filter((item) => item !== key)
    )
    this.editor.confirmDiscard.set(false)
  }

  reset() {
    this.selected.set([...this.applied()])
    this.provider.setValue(this.appliedProvider())
    this.voice.set(this.appliedVoice())
    this.error.set(null)
  }

  async preparePublish(): Promise<boolean> {
    return this.save(this.changed)
  }

  async save(revalidate = false): Promise<boolean> {
    if (this.loading() || this.applying() || this.editor.composing()) return false
    if (!this.dirty() && !revalidate) return this.editor.save()
    if (this.editor.invalidSections().length) {
      this.error.set(this.translate.instant('XP.XpertSettings.Capabilities.FixInvalid'))
      return false
    }
    this.applying.set(true)
    this.editor.composing.set(true)
    this.error.set(null)
    try {
      // Persist other edited fields only after an explicit save, before validating against that revision.
      // The provider stays local until it can be composed with the capability graph.
      if (!(await this.editor.save())) return false
      const snapshot = cloneDeep(this.editor.source.draft())
      const selection = [...this.selected()]
      const voice = this.voice()
      const configuration = await firstValueFrom(this.api.getAssistantCapabilities(this.editor.source.id, selection))
      if (this.destroyRef.destroyed) return false
      this.configuration.set(configuration)
      if (
        this.voiceEnabled() &&
        !configuration.setup.realtimeModels?.some(
          (model) => model.id === voice?.modelId && model.voices.some((entry) => entry.id === voice.voice)
        )
      ) {
        this.editor.select('speech')
        throw new Error(this.translate.instant('XP.XpertSettings.RealtimeVoice.InvalidSelection'))
      }
      const result = await firstValueFrom(
        this.api.previewAssistantCapabilities(this.editor.source.id, {
          revision: configuration.revision,
          capabilities: selection,
          ...(this.voiceEnabled() ? { realtimeVoice: voice } : {}),
          ...(this.sandboxEnabled() ? { sandboxProvider: this.provider.value } : {})
        })
      )
      if (this.destroyRef.destroyed) return false
      if (!isEqual(snapshot, this.editor.source.draft()))
        throw new Error(this.translate.instant('XP.XpertSettings.Capabilities.DraftChanged'))
      this.editor.source.update(() => ({
        ...snapshot,
        nodes: result.nodes,
        connections: result.connections,
        team: { ...snapshot.team, options: result.team.options, features: result.team.features }
      }))
      this.editor.syncCapabilityRuntime()
      this.provider.setValue(result.team.features?.sandbox?.provider ?? '')
      this.applied.set(selection)
      this.appliedVoice.set(voice)
      this.changed = true
      this.appliedProvider.set(this.provider.value)
      return await this.editor.save()
    } catch (error) {
      this.error.set(getErrorMessage(error))
      return false
    } finally {
      this.applying.set(false)
      this.editor.composing.set(false)
    }
  }
}
