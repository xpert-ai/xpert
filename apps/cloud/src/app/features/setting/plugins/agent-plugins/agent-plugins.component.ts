import { Component, computed, effect, inject, signal } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { API_PREFIX } from '@cloud/app/@core/state/constants'
import { injectActiveScope } from '@cloud/app/@core/state'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import type {
  AgentPluginDiagnostic,
  AgentPluginXpertExtension,
  JSONValue,
  RuntimeResourceBindingInput,
  TAgentMiddlewareMeta
} from '@xpert-ai/contracts'

interface PackageSummary {
  id: string
  digest: string
  descriptor: {
    name: string
    version?: string
    description?: string
    diagnostics: AgentPluginDiagnostic[]
    skills: Array<{ key: string }>
    servers: Array<{ key: string }>
    extension?: AgentPluginXpertExtension
  }
}
interface BindingSummary extends RuntimeResourceBindingInput {
  id: string
  version: string
  enabled: boolean
  supersededById?: string
}
interface ResourceOptions {
  workspaces: Array<{ id: string; name: string }>
  experts: Array<{ id: string; name: string }>
  middlewares: TAgentMiddlewareMeta[]
}

function isJsonValue(value: unknown): value is JSONValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  return !!value && typeof value === 'object' && Object.values(value).every(isJsonValue)
}
function parseOptions(text: string): { [key: string]: JSONValue } {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || !isJsonValue(value) || Array.isArray(value))
    throw new Error('Middleware options must be a JSON object')
  return value
}

@Component({
  standalone: true,
  selector: 'xp-agent-plugins',
  imports: [ReactiveFormsModule, TranslateModule],
  templateUrl: './agent-plugins.component.html',
  host: { class: 'block px-8 pb-8' }
})
export class AgentPluginsComponent {
  private readonly http = inject(HttpClient)
  private readonly toastr = injectToastr()
  private readonly scope = injectActiveScope()
  private readonly endpoint = `${API_PREFIX}/agent-plugins`
  readonly busy = signal(false)
  readonly error = signal<string | null>(null)
  readonly packages = signal<PackageSummary[]>([])
  readonly bindings = signal<BindingSummary[]>([])
  readonly options = signal<ResourceOptions>({ workspaces: [], experts: [], middlewares: [] })
  readonly replacesBindingId = signal('')
  readonly selectedPackageId = signal('')
  readonly selectedPackage = computed(() => this.packages().find((pkg) => pkg.id === this.selectedPackageId()))
  readonly workspaceIds = signal<string[]>([])
  readonly expertMappings = signal<{ [reference: string]: string }>({})
  readonly kind = signal<'agent_plugin' | 'middleware' | 'external_xpert'>('agent_plugin')
  readonly git = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https:\/\//)]
    }),
    ref: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    subdirectory: new FormControl('.', { nonNullable: true })
  })
  readonly binding = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true }),
    provider: new FormControl('', { nonNullable: true }),
    expert: new FormControl('', { nonNullable: true }),
    options: new FormControl('{}', { nonNullable: true })
  })
  private generation = 0

  constructor() {
    effect(() => {
      this.scope()
      this.generation++
      this.packages.set([])
      this.bindings.set([])
      this.workspaceIds.set([])
      this.selectedPackageId.set('')
      this.replacesBindingId.set('')
      this.expertMappings.set({})
      void this.refresh()
    })
  }
  async refresh() {
    const generation = this.generation
    this.error.set(null)
    try {
      const [data, options] = await Promise.all([
        firstValueFrom(this.http.get<{ packages: PackageSummary[]; bindings: BindingSummary[] }>(this.endpoint)),
        firstValueFrom(this.http.get<ResourceOptions>(`${this.endpoint}/options`))
      ])
      if (generation === this.generation) {
        this.packages.set(data.packages)
        this.bindings.set(data.bindings)
        this.options.set(options)
      }
    } catch (error) {
      if (generation === this.generation) this.error.set(getErrorMessage(error))
    }
  }
  private async run(work: () => Promise<unknown>) {
    if (this.busy()) return
    this.busy.set(true)
    this.error.set(null)
    try {
      await work()
      await this.refresh()
    } catch (error) {
      this.error.set(getErrorMessage(error))
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
  importGit() {
    if (this.git.invalid) {
      this.git.markAllAsTouched()
      return
    }
    const generation = this.generation
    return this.run(async () => {
      const pkg = await firstValueFrom(this.http.post<PackageSummary>(`${this.endpoint}/git`, this.git.getRawValue()))
      if (generation === this.generation) this.selectPackage(pkg)
    })
  }
  importZip(event: Event) {
    if (!(event.target instanceof HTMLInputElement)) return
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    const generation = this.generation
    return this.run(async () => {
      const data = new FormData()
      data.append('file', file)
      const pkg = await firstValueFrom(this.http.post<PackageSummary>(`${this.endpoint}/zip`, data))
      if (generation === this.generation) this.selectPackage(pkg)
    })
  }
  selectPackage(pkg: PackageSummary) {
    this.selectedPackageId.set(pkg.id)
    this.expertMappings.set({})
    this.binding.controls.title.setValue(pkg.descriptor.extension?.interface?.displayName || pkg.descriptor.name)
    this.binding.controls.description.setValue(pkg.descriptor.description || '')
  }
  toggleWorkspace(id: string) {
    this.workspaceIds.update((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))
  }
  mapExpert(reference: string, event: Event) {
    if (event.target instanceof HTMLSelectElement)
      this.expertMappings.update((values) => ({ ...values, [reference]: (event.target as HTMLSelectElement).value }))
  }
  replaceSelection(event: Event) {
    if (event.target instanceof HTMLSelectElement) this.replacesBindingId.set(event.target.value)
  }
  publish() {
    if (this.binding.invalid || !this.workspaceIds().length) {
      this.binding.markAllAsTouched()
      return
    }
    return this.run(async () => {
      const values = this.binding.getRawValue()
      const kind = this.kind()
      const definition: RuntimeResourceBindingInput['definition'] =
        kind === 'agent_plugin'
          ? {
              kind,
              packageId: this.selectedPackageId(),
              experts: this.expertMappings()
            }
          : kind === 'middleware'
            ? { kind, provider: values.provider, options: parseOptions(values.options) }
            : { kind, xpertId: values.expert }
      await firstValueFrom(
        this.http.post(`${this.endpoint}/bindings`, {
          ...(this.replacesBindingId() ? { replacesBindingId: this.replacesBindingId() } : {}),
          title: values.title,
          description: values.description,
          workspaceIds: this.workspaceIds(),
          definition
        } satisfies RuntimeResourceBindingInput)
      )
    })
  }
  toggleBinding(binding: BindingSummary) {
    return this.run(() =>
      firstValueFrom(this.http.put(`${this.endpoint}/bindings/${binding.id}`, { enabled: !binding.enabled }))
    )
  }
}
