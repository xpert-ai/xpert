import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, type TXpertAttachmentType } from '@xpert-ai/contracts'
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

@Component({
  selector: 'xp-settings-capabilities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  readonly page = input.required<'files' | 'speech' | 'runtime'>()
  readonly editor = inject(XpertSettingsEditor)
  readonly files = this.editor.form.controls.files.controls
  readonly speech = this.editor.form.controls.speech.controls
  readonly runtime = this.editor.form.controls.runtime.controls
  readonly modelTypes = AiModelTypeEnum
  readonly fileTypes: TXpertAttachmentType[] = ['document', 'image', 'audio', 'video', 'others']
  private readonly api = inject(XpertAPIService)
  readonly providers = signal<TSandboxProvider[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  ngOnInit() {
    if (this.page() === 'runtime') void this.loadProviders()
  }
  toggleFileType(type: TXpertAttachmentType, event: Event) {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    const types = this.files.fileTypes.value.filter((value) => value !== type)
    this.files.fileTypes.setValue(target.checked ? [...types, type] : types)
  }
  providerUnavailable() {
    return (
      !!this.runtime.sandboxProvider.value &&
      !this.providers().some((item) => item.type === this.runtime.sandboxProvider.value)
    )
  }
  selectProvider(value: ZardSelectValue | ZardSelectValue[]) {
    // Numeric zero represents the empty string, which Zard Select cannot select directly.
    if (value !== 0 && typeof value !== 'string') return
    this.runtime.sandboxProvider.markAsDirty()
    this.runtime.sandboxProvider.setValue(value === 0 ? '' : value)
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
