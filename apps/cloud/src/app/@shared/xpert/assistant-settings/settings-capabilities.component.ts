import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, DEFAULT_XPERT_AGENT_RECURSION_LIMIT, type TXpertAttachmentType } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardInputDirective,
  ZardCheckboxComponent,
  ZardSelectImports,
  type ZardSelectValue,
  XpI18nPipe
} from '@xpert-ai/headless-ui'
import { XpertAPIService, type TSandboxProvider } from '@cloud/app/@core'
import { SettingsModelSelectComponent } from './settings-model-select.component'
import { firstValueFrom } from 'rxjs'
import { SettingsFeatureComponent } from './settings-feature.component'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { RECURSION_LIMIT_RANGE } from './xpert-settings.form'

@Component({
  selector: 'xp-settings-capabilities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardCheckboxComponent,
    ...ZardSelectImports,
    XpI18nPipe,
    SettingsModelSelectComponent,
    SettingsFeatureComponent
  ],
  templateUrl: './settings-capabilities.component.html'
})
export class SettingsCapabilitiesComponent {
  readonly page = input.required<'files' | 'speech' | 'limits' | 'sandbox'>()
  readonly sandboxProvider = input(new FormControl('', { nonNullable: true }))
  readonly editor = inject(XpertSettingsEditor)
  readonly files = this.editor.form.controls.files.controls
  readonly speech = this.editor.form.controls.speech.controls
  readonly runtime = this.editor.form.controls.runtime.controls
  readonly recursionRange = RECURSION_LIMIT_RANGE
  readonly defaultRecursionLimit = DEFAULT_XPERT_AGENT_RECURSION_LIMIT
  readonly modelTypes = AiModelTypeEnum
  readonly fileTypes: TXpertAttachmentType[] = ['document', 'image', 'audio', 'video', 'others']
  private readonly api = inject(XpertAPIService)
  readonly providers = signal<TSandboxProvider[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  ngOnInit() {
    if (this.page() === 'sandbox') void this.loadProviders()
  }
  setRecursionLimitFromSlider(event: Event) {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    this.runtime.recursionLimit.markAsDirty()
    this.runtime.recursionLimit.setValue(target.valueAsNumber)
  }
  toggleFileType(type: TXpertAttachmentType, event: Event) {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    const types = this.files.fileTypes.value.filter((value) => value !== type)
    this.files.fileTypes.setValue(target.checked ? [...types, type] : types)
  }
  providerUnavailable() {
    return (
      !!this.sandboxProvider().value && !this.providers().some((item) => item.type === this.sandboxProvider().value)
    )
  }
  selectProvider(value: ZardSelectValue | ZardSelectValue[]) {
    // Numeric zero represents the empty string, which Zard Select cannot select directly.
    if (value !== 0 && typeof value !== 'string') return
    this.sandboxProvider().markAsDirty()
    this.sandboxProvider().setValue(value === 0 ? '' : value)
  }
  async loadProviders() {
    this.loading.set(true)
    this.failed.set(false)
    try {
      this.providers.set(await firstValueFrom(this.api.getSandboxProviders()))
    } catch {
      this.failed.set(true)
    } finally {
      this.loading.set(false)
    }
  }
}
