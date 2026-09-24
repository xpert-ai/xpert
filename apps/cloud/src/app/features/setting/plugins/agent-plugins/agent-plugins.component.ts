import { A11yModule } from '@angular/cdk/a11y'
import { BreakpointObserver } from '@angular/cdk/layout'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed, effect, inject, signal, TemplateRef, untracked } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom, map } from 'rxjs'
import { API_PREFIX } from '@cloud/app/@core/state/constants'
import { injectActiveScope } from '@cloud/app/@core/state'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import type { RuntimeResourceBindingInput } from '@xpert-ai/contracts'
import { ZardSearchInputComponent, ZardSelectImports, type ZardSelectValue } from '@xpert-ai/headless-ui'
import {
  BindingSummary,
  groupPluginPackages,
  PackageSummary,
  packageDescription,
  packageTitle,
  packageVersion,
  PluginBinding,
  PluginGroup,
  PluginStatus
} from './agent-plugins.model'

import { AgentPluginAvatarComponent } from './agent-plugin-avatar.component'

interface ResourceOptions {
  workspaces: Array<{ id: string; name: string }>
  experts: Array<{ id: string; name: string }>
}

@Component({
  standalone: true,
  selector: 'xp-agent-plugins',
  imports: [
    CommonModule,
    A11yModule,
    DialogModule,
    CdkMenuModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardSearchInputComponent,
    ZardSelectImports,
    AgentPluginAvatarComponent
  ],
  templateUrl: './agent-plugins.component.html',
  host: { class: 'block min-h-0 flex-1' }
})
export class AgentPluginsComponent {
  private readonly http = inject(HttpClient)
  private readonly toastr = injectToastr()
  private readonly scope = injectActiveScope()
  private readonly dialog = inject(Dialog)
  private readonly endpoint = `${API_PREFIX}/agent-plugins`
  private importDialog?: DialogRef
  private generation = 0
  private refreshSequence = 0
  readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 1023.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false }
  )
  readonly busy = signal(false)
  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly notice = signal(false)
  readonly packages = signal<PackageSummary[]>([])
  readonly bindings = signal<BindingSummary[]>([])
  readonly options = signal<ResourceOptions>({ workspaces: [], experts: [] })
  readonly search = signal('')
  readonly status = signal<PluginStatus | 'all'>('all')
  readonly page = signal(0)
  readonly pageSize = 8
  readonly groups = computed(() => groupPluginPackages(this.packages(), this.bindings()))
  readonly filteredGroups = computed(() => {
    const query = this.search().trim().toLocaleLowerCase()
    return this.groups().filter(
      (group) =>
        (this.status() === 'all' || group.status === this.status()) &&
        (!query || `${group.name} ${group.title} ${group.description}`.toLocaleLowerCase().includes(query))
    )
  })
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredGroups().length / this.pageSize)))
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1))
  readonly visibleGroups = computed(() =>
    this.filteredGroups().slice(this.currentPage() * this.pageSize, (this.currentPage() + 1) * this.pageSize)
  )
  readonly selectedName = signal('')
  readonly selectedGroup = computed(() => this.groups().find((group) => group.name === this.selectedName()))
  readonly selectedPackageId = signal('')
  readonly selectedPackage = computed(() => this.packages().find((pkg) => pkg.id === this.selectedPackageId()))
  readonly replacesBindingId = signal('')
  readonly selectedBinding = computed(() =>
    this.selectedGroup()?.currentBindings.find((item) => item.id === this.replacesBindingId())
  )
  readonly detailTab = signal<'overview' | 'workspaces' | 'history'>('workspaces')
  readonly workspaceSearch = signal('')
  readonly workspaceIds = signal<string[]>([])
  readonly filteredWorkspaces = computed(() => {
    const query = this.workspaceSearch().trim().toLocaleLowerCase()
    return this.options().workspaces.filter((workspace) => workspace.name.toLocaleLowerCase().includes(query))
  })
  readonly unavailableWorkspaceCount = computed(
    () => this.workspaceIds().filter((id) => !this.options().workspaces.some((workspace) => workspace.id === id)).length
  )
  readonly expertMappings = signal<{ [reference: string]: string }>({})
  readonly missingMappings = computed(() =>
    (this.selectedPackage()?.descriptor.extension?.experts ?? []).some(
      (expert) => !this.expertMappings()[expert.reference]
    )
  )
  readonly packageTitle = packageTitle
  readonly packageDescription = packageDescription
  readonly packageVersion = packageVersion
  readonly statusClasses: { [key in PluginStatus]: string } = {
    published: 'bg-state-success-hover/10 text-text-success',
    unpublished: 'bg-background-default-subtle text-text-tertiary',
    disabled: 'bg-status-error-bg/10 text-text-destructive'
  }
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
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] })
  })

  constructor() {
    effect(() => {
      this.scope()
      untracked(() => {
        this.generation++
        this.importDialog?.close()
        this.packages.set([])
        this.bindings.set([])
        this.options.set({ workspaces: [], experts: [] })
        this.closeDetails()
        this.busy.set(false)
        this.notice.set(false)
        this.search.set('')
        this.status.set('all')
        this.page.set(0)
        void this.refresh()
      })
    })
  }

  async refresh() {
    const generation = this.generation
    const sequence = ++this.refreshSequence
    this.loading.set(true)
    this.error.set(null)
    try {
      const [data, options] = await Promise.all([
        firstValueFrom(this.http.get<{ packages: PackageSummary[]; bindings: BindingSummary[] }>(this.endpoint)),
        firstValueFrom(this.http.get<ResourceOptions>(`${this.endpoint}/options`))
      ])
      if (generation === this.generation && sequence === this.refreshSequence) {
        this.packages.set(data.packages)
        this.bindings.set(data.bindings)
        this.options.set(options)
      }
    } catch (error) {
      if (generation === this.generation && sequence === this.refreshSequence) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.generation && sequence === this.refreshSequence) this.loading.set(false)
    }
  }

  private async run(work: () => Promise<void>) {
    if (this.busy()) return
    const generation = this.generation
    this.busy.set(true)
    this.error.set(null)
    this.notice.set(false)
    try {
      await work()
      if (generation === this.generation) await this.refresh()
    } catch (error) {
      if (generation === this.generation) {
        this.error.set(getErrorMessage(error))
        this.toastr.error(getErrorMessage(error))
      }
    } finally {
      if (generation === this.generation) this.busy.set(false)
    }
  }

  openImport(template: TemplateRef<unknown>) {
    this.error.set(null)
    this.importDialog = this.dialog.open(template, {
      ariaLabelledBy: 'agent-plugin-import-title',
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      disableClose: true
    })
  }
  closeImport() {
    if (!this.busy()) this.importDialog?.close()
  }
  importGit() {
    if (this.git.invalid) {
      this.git.markAllAsTouched()
      return
    }
    const generation = this.generation
    return this.run(async () => {
      const pkg = await firstValueFrom(this.http.post<PackageSummary>(`${this.endpoint}/git`, this.git.getRawValue()))
      if (generation === this.generation) this.acceptImport(pkg)
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
      if (generation === this.generation) this.acceptImport(pkg)
    })
  }
  private acceptImport(pkg: PackageSummary) {
    this.packages.update((items) => [pkg, ...items.filter((item) => item.id !== pkg.id)])
    const group = this.groups().find((item) => item.name === pkg.descriptor.name)
    if (group) {
      this.selectedName.set(group.name)
      this.workspaceSearch.set('')
      this.detailTab.set('overview')
      this.loadBinding(group.currentBindings.find((item) => item.enabled) ?? group.currentBindings[0])
    }
    this.selectVersion(pkg.id)
    this.search.set('')
    this.status.set('all')
    this.page.set(0)
    this.importDialog?.close()
    this.git.reset({ url: '', ref: '', subdirectory: '.' })
  }

  filterSearch(value: string) {
    this.search.set(value)
    this.page.set(0)
  }
  filterStatus(value: ZardSelectValue | ZardSelectValue[]) {
    if (value === 'all' || value === 'published' || value === 'unpublished' || value === 'disabled') {
      this.status.set(value)
      this.page.set(0)
    }
  }
  openGroup(group: PluginGroup, tab: 'overview' | 'workspaces' | 'history' = 'workspaces') {
    if (this.busy()) return
    this.selectedName.set(group.name)
    this.notice.set(false)
    this.workspaceSearch.set('')
    this.detailTab.set(tab)
    this.loadBinding(group.currentBindings.find((item) => item.enabled) ?? group.currentBindings[0])
  }
  closeDetails() {
    this.selectedName.set('')
    this.selectedPackageId.set('')
    this.replacesBindingId.set('')
    this.workspaceIds.set([])
    this.expertMappings.set({})
  }
  loadBinding(binding?: PluginBinding) {
    const group = this.selectedGroup()
    if (!group) return
    const pkg = group.packages.find((item) => item.id === binding?.definition.packageId) ?? group.packages[0]
    this.replacesBindingId.set(binding?.id ?? '')
    this.selectedPackageId.set(pkg.id)
    this.workspaceIds.set([...(binding?.workspaceIds ?? [])])
    this.expertMappings.set({ ...binding?.definition.experts })
    this.binding.reset({
      title: binding?.title || packageTitle(pkg),
      description: binding?.description ?? packageDescription(pkg)
    })
    this.notice.set(false)
  }
  chooseBinding(id: ZardSelectValue | ZardSelectValue[]) {
    if (typeof id === 'string') {
      this.loadBinding(this.selectedGroup()?.currentBindings.find((binding) => binding.id === id))
    }
  }
  selectVersion(id: string) {
    const pkg = this.selectedGroup()?.packages.find((item) => item.id === id)
    if (!pkg) return
    this.selectedPackageId.set(id)
    const previous = this.expertMappings()
    this.expertMappings.set(
      Object.fromEntries(
        (pkg.descriptor.extension?.experts ?? [])
          .filter((expert) => previous[expert.reference])
          .map((expert) => [expert.reference, previous[expert.reference]])
      )
    )
    this.notice.set(false)
  }
  changeVersion(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') this.selectVersion(value)
  }
  versionLabel(pkg: PackageSummary) {
    const duplicates =
      this.selectedGroup()?.packages.filter((item) => packageVersion(item) === packageVersion(pkg)).length ?? 0
    return duplicates > 1 ? `${packageVersion(pkg)} (${pkg.digest.slice(0, 8)})` : packageVersion(pkg)
  }
  toggleWorkspace(id: string) {
    this.workspaceIds.update((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))
    this.notice.set(false)
  }
  mapExpert(reference: string, value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') {
      this.expertMappings.update((values) => ({ ...values, [reference]: value }))
    }
  }
  workspaceName(id: string) {
    return this.options().workspaces.find((workspace) => workspace.id === id)?.name
  }
  bindingVersion(binding: PluginBinding) {
    const pkg = this.selectedGroup()?.packages.find((item) => item.id === binding.definition.packageId)
    return pkg ? packageVersion(pkg) : ''
  }
  publish() {
    const pkg = this.selectedPackage()
    if (
      !pkg ||
      this.binding.invalid ||
      !this.workspaceIds().length ||
      this.missingMappings() ||
      this.unavailableWorkspaceCount()
    ) {
      this.binding.markAllAsTouched()
      return
    }
    const previous = this.selectedBinding()
    const definition: RuntimeResourceBindingInput['definition'] = {
      kind: 'agent_plugin',
      packageId: pkg.id,
      experts: this.expertMappings(),
      ...(previous?.definition.packageId === pkg.id
        ? {
            connectorServers: previous.definition.connectorServers,
            oauthServers: previous.definition.oauthServers
          }
        : {})
    }
    const input: RuntimeResourceBindingInput = {
      ...(previous ? { replacesBindingId: previous.id } : {}),
      ...this.binding.getRawValue(),
      workspaceIds: this.workspaceIds(),
      definition
    }
    const generation = this.generation
    return this.run(async () => {
      const saved = await firstValueFrom(this.http.post<BindingSummary>(`${this.endpoint}/bindings`, input))
      if (generation !== this.generation || saved.definition.kind !== 'agent_plugin') return
      this.bindings.update((items) => [
        saved,
        ...items
          .filter((item) => item.id !== saved.id)
          .map((item) => (item.id === previous?.id ? { ...item, supersededById: saved.id } : item))
      ])
      this.replacesBindingId.set(saved.id)
      this.binding.markAsPristine()
      this.notice.set(true)
    })
  }
  toggleBinding(binding: PluginBinding) {
    const generation = this.generation
    return this.run(async () => {
      await firstValueFrom(this.http.put(`${this.endpoint}/bindings/${binding.id}`, { enabled: !binding.enabled }))
      if (generation === this.generation)
        this.bindings.update((items) =>
          items.map((item) => (item.id === binding.id ? { ...item, enabled: !binding.enabled } : item))
        )
    })
  }
}
