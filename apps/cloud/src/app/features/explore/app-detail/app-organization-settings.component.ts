import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, model, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { XpI18nPipe, ZardButtonComponent, ZardInputDirective, ZardSelectImports } from '@xpert-ai/headless-ui'
import type {
  AnalyticsBinding,
  AnalyticsSourceRef,
  ApplicationSetupField,
  OrganizationApplicationSettings,
  OrganizationApplicationSetupForm,
  PluginApplicationSetupInput
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, PluginApplicationService } from '@cloud/app/@core'

@Component({
  selector: 'xp-app-organization-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, XpI18nPipe, ZardButtonComponent, ZardInputDirective, ...ZardSelectImports],
  templateUrl: './app-organization-settings.component.html'
})
export class AppOrganizationSettingsComponent implements OnInit {
  private readonly api = inject(PluginApplicationService)
  private readonly destroyed = inject(DestroyRef)
  readonly app = input.required<PluginApplicationSetupInput>()
  readonly fields = input.required<ApplicationSetupField[]>()
  readonly disabled = input(false)
  readonly value = model<OrganizationApplicationSettings | null>(null)
  readonly form = signal<OrganizationApplicationSetupForm | null>(null)
  readonly error = signal('')
  readonly members = signal<Record<string, string[]>>({})
  readonly sources = signal<Record<string, string>>({})
  readonly definitions = signal<Record<string, string>>({})
  readonly invalid = signal<string[]>([])

  async ngOnInit() {
    await this.load()
  }
  async load() {
    this.error.set('')
    this.value.set(null)
    try {
      const form = await firstValueFrom(this.api.organizationSettings(this.app()))
      if (this.destroyed.destroyed) return
      this.form.set(form)
      this.members.set(form.settings.members)
      this.sources.set(
        Object.fromEntries(Object.entries(form.settings.queries).map(([key, b]) => [key, this.sourceKey(b.source)]))
      )
      this.definitions.set(
        Object.fromEntries(Object.entries(form.settings.queries).map(([key, b]) => [key, JSON.stringify(b, null, 2)]))
      )
      this.changed()
    } catch (error) {
      if (!this.destroyed.destroyed) this.error.set(getErrorMessage(error))
    }
  }
  sourceKey(source: AnalyticsSourceRef) {
    return source.kind === 'definition' ? source.definitionId + '/' + source.versionId : ''
  }
  sourcesFor(provider: string) {
    return (
      this.form()?.sources.filter(
        (s) => s.source.kind === 'definition' && s.providers.some((p) => p.id === provider)
      ) ?? []
    )
  }
  selectMembers(key: string, value: string | number | (string | number)[]) {
    this.members.update((previous) => ({
      ...previous,
      [key]: Array.isArray(value)
        ? value.filter((id): id is string => typeof id === 'string')
        : typeof value === 'string' && value
          ? [value]
          : []
    }))
    this.changed()
  }
  selectSource(key: string, value: string) {
    this.sources.update((previous) => ({ ...previous, [key]: value }))
    this.changed()
  }
  editQuery(key: string, value: string) {
    this.definitions.update((previous) => ({ ...previous, [key]: value }))
    this.changed()
  }
  private changed() {
    const form = this.form()
    if (!form) return
    const queries: OrganizationApplicationSettings['queries'] = {}
    const invalid: string[] = []
    let complete = true
    for (const f of this.fields()) {
      if (f.kind === 'members') {
        if (!f.optional && !this.members()[f.key]?.length) complete = false
        continue
      }
      const source = this.sourcesFor(f.providerId).find((s) => this.sourceKey(s.source) === this.sources()[f.key])
      const text = this.definitions()[f.key]?.trim()
      if (!text || !source) {
        complete = false
        continue
      }
      try {
        const binding: Partial<AnalyticsBinding> = JSON.parse(text)
        if (
          !binding?.id ||
          !binding.operation ||
          !binding.contractVersion ||
          !binding.output?.fields?.length ||
          !Array.isArray(binding.parameters) ||
          binding.payload === undefined
        )
          throw Error()
        queries[f.key] = {
          id: binding.id,
          source: source.source,
          providerId: f.providerId,
          operation: binding.operation,
          contractVersion: binding.contractVersion,
          output: binding.output,
          payload: binding.payload,
          parameters: binding.parameters
        }
      } catch {
        invalid.push(f.key)
        complete = false
      }
    }
    this.invalid.set(invalid)
    this.value.set(complete ? { revision: form.settings.revision, members: this.members(), queries } : null)
  }
}
