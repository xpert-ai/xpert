import { injectLanguage } from '@cloud/app/@core/providers/translate'
import {
  ZardButtonComponent,
  XpDialogFrameImports,
  ZardInputDirective,
  ZardSearchInputComponent,
  ZardSelectImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { DefaultAgentPluginsResultComponent } from '@cloud/app/@shared/agent-plugins/default-agent-plugins-result.component'
import {
  DEFAULT_AGENT_PLUGINS_SOURCE,
  type AgentPluginUpdateProgress,
  type AgentPluginCleanupResult,
  type DefaultAgentPluginsImportResult,
  type DefaultAgentPluginsImportProgress
} from '@xpert-ai/contracts'
import { A11yModule } from '@angular/cdk/a11y'
import { BreakpointObserver } from '@angular/cdk/layout'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed, DestroyRef, effect, inject, signal, TemplateRef, untracked } from '@angular/core'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { firstValueFrom, map, of } from 'rxjs'
import { API_PREFIX } from '@cloud/app/@core/state/constants'
import { injectActiveScope } from '@cloud/app/@core/state'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import type { RuntimeResourceBindingInput } from '@xpert-ai/contracts'
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
    RouterLink,
    A11yModule,
    DialogModule,
    CdkMenuModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    DefaultAgentPluginsResultComponent,
    ZardSearchInputComponent,
    ZardSelectImports,
    AgentPluginAvatarComponent,
    ...XpDialogFrameImports,
    ZardInputDirective
  ],
  templateUrl: './agent-plugins.component.html',
  host: { class: 'block min-h-0 flex-1' }
})
export class AgentPluginsComponent {
  private readonly http = inject(HttpClient)
  private readonly toastr = injectToastr()
  private readonly scope = injectActiveScope()
  private readonly route = inject(ActivatedRoute, { optional: true })
  private handledDesktopLink = false
  readonly desktopScopeMismatch = () => {
    const requested = this.route?.snapshot.queryParamMap.get('organizationId')
    const scope = this.scope()
    return !!requested && (!scope || !('organizationId' in scope) || scope.organizationId !== requested)
  }
  private readonly dialog = inject(Dialog)
  private readonly endpoint = `${API_PREFIX}/agent-plugins`
  private importDialog?: DialogRef
  private generation = 0
  private refreshSequence = 0
  private defaultSequence = 0
  private defaultPollTimer?: ReturnType<typeof setTimeout>
  private wakeDefaultPoll?: () => void
  readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 1023.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false }
  )
  private updateSequence = 0
  private updateTimer?: ReturnType<typeof setTimeout>
  private wakeUpdate?: () => void
  readonly updating = signal(false)
  readonly updateProgress = signal<AgentPluginUpdateProgress | null>(null)
  readonly updateBranch = new FormControl('', { nonNullable: true, validators: [Validators.required] })
  readonly cleanupPreview = signal<AgentPluginCleanupResult | null>(null)
  private cleanupTargetId = ''
  readonly cleanupCandidates = computed(
    () =>
      this.cleanupPreview()?.items.filter(
        (item) => item.reason === 'unreferenced' && !this.cleanupPreview()?.deleted.includes(item.packageId)
      ) ?? []
  )
  readonly busy = signal(false)
  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly notice = signal(false)
  readonly defaultImportResult = signal<DefaultAgentPluginsImportResult | null>(null)
  readonly importingDefaults = signal(false)
  readonly defaultImportProgress = signal<DefaultAgentPluginsImportProgress | null>(null)
  readonly defaultImportError = signal<string | null>(null)
  readonly defaultImportDisconnected = signal(false)
  readonly defaultSource = DEFAULT_AGENT_PLUGINS_SOURCE.browseUrl
  readonly packages = signal<PackageSummary[]>([])
  readonly bindings = signal<BindingSummary[]>([])
  readonly options = signal<ResourceOptions>({ workspaces: [], experts: [] })
  readonly search = signal('')
  private readonly routeSearch = toSignal(
    this.route?.queryParamMap.pipe(map((params) => params.get('search'))) ?? of(null)
  )
  readonly status = signal<PluginStatus | 'all'>('all')
  readonly page = signal(0)
  readonly pageSize = 8
  readonly language = injectLanguage()
  readonly groups = computed(() => groupPluginPackages(this.packages(), this.bindings(), this.language()))
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
  readonly updateBelongsToSelected = computed(
    () =>
      this.selectedGroup()?.packages.some(
        (pkg) => pkg.id === this.updateProgress()?.packageId || pkg.id === this.updateProgress()?.result?.packageId
      ) ?? false
  )
  readonly selectedPackageId = signal('')
  readonly selectedPackage = computed(() => this.packages().find((pkg) => pkg.id === this.selectedPackageId()))
  readonly replacesBindingId = signal('')
  readonly selectedBinding = computed(() =>
    this.selectedGroup()?.currentBindings.find((item) => item.id === this.replacesBindingId())
  )
  readonly detailTab = signal<'overview' | 'history'>('overview')
  readonly installationScope = computed(() => (this.scope()?.level === 'tenant' ? 'tenant' : 'organization'))
  readonly expertMappings = signal<{ [reference: string]: string }>({})
  readonly missingMappings = computed(() =>
    (this.selectedPackage()?.descriptor.extension?.experts ?? []).some(
      (expert) => !this.expertMappings()[expert.reference]
    )
  )
  readonly packageTitle = (pkg: PackageSummary) => packageTitle(pkg, this.language())
  readonly packageDescription = (pkg: PackageSummary) => packageDescription(pkg, this.language())
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
    effect(() => this.search.set(this.routeSearch() || ''))

    inject(DestroyRef).onDestroy(() => {
      this.stopDefaultPolling()
      this.stopUpdatePolling()
    })
    effect(() => {
      this.scope()
      untracked(() => {
        this.generation++
        this.handledDesktopLink = false
        this.importDialog?.close()
        this.packages.set([])
        this.bindings.set([])
        this.options.set({ workspaces: [], experts: [] })
        this.closeDetails()
        this.busy.set(false)
        this.notice.set(false)
        this.defaultImportResult.set(null)
        this.importingDefaults.set(false)
        this.defaultImportProgress.set(null)
        this.defaultImportError.set(null)
        this.defaultImportDisconnected.set(false)
        this.stopDefaultPolling()
        this.stopUpdatePolling()
        this.updating.set(false)
        this.updateProgress.set(null)
        this.cleanupPreview.set(null)
        this.search.set('')
        this.status.set('all')
        this.page.set(0)
        void this.refresh()
        void this.restoreDefaultImport()
        void this.restoreUpdate()
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
        this.openDesktopTarget()
      }
    } catch (error) {
      if (generation === this.generation && sequence === this.refreshSequence) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.generation && sequence === this.refreshSequence) this.loading.set(false)
    }
  }

  private openDesktopTarget() {
    if (this.handledDesktopLink || this.desktopScopeMismatch()) return
    const query = this.route?.snapshot.queryParamMap
    if (!query?.get('organizationId')) return
    const workspaceId = query.get('workspaceId')
    this.handledDesktopLink = true
    const packageId = query.get('packageId')
    const group = this.groups().find((item) => item.packages.some((pkg) => pkg.id === packageId))
    if (!group) return
    this.openGroup(group, 'overview')
    const binding =
      group.currentBindings.find((item) => item.workspaceIds.includes(workspaceId) && item.enabled) ??
      group.currentBindings.find((item) => item.workspaceIds.includes(workspaceId))
    if (binding) this.loadBinding(binding)
    // Older Desktop links still select their existing configuration without changing it.
  }

  private async run(work: () => Promise<void>) {
    if (this.busy() || this.updating()) return
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
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      disableClose: true
    })
  }
  closeImport() {
    if (!this.busy()) this.importDialog?.close()
  }
  async importDefaults() {
    if (this.busy() || this.desktopScopeMismatch()) return
    this.stopDefaultPolling()
    const sequence = this.defaultSequence
    this.defaultImportResult.set(null)
    this.defaultImportError.set(null)
    this.defaultImportDisconnected.set(false)
    this.importingDefaults.set(true)
    this.busy.set(true)
    try {
      const progress = await firstValueFrom(
        this.http.post<DefaultAgentPluginsImportProgress>(`${this.endpoint}/defaults`, {})
      )
      await this.monitorDefaultImport(progress, sequence)
    } catch (error) {
      if (sequence === this.defaultSequence) this.defaultImportError.set(getErrorMessage(error))
    } finally {
      if (sequence === this.defaultSequence) {
        this.importingDefaults.set(false)
        this.busy.set(false)
      }
    }
  }

  private async restoreDefaultImport() {
    const sequence = this.defaultSequence
    try {
      const progress = await firstValueFrom(
        this.http.get<DefaultAgentPluginsImportProgress>(`${this.endpoint}/defaults`)
      )
      await this.monitorDefaultImport(progress, sequence, false)
    } catch (error) {
      if (sequence === this.defaultSequence) this.defaultImportError.set(getErrorMessage(error))
    } finally {
      if (sequence === this.defaultSequence && this.importingDefaults()) {
        this.importingDefaults.set(false)
        this.busy.set(false)
      }
    }
  }

  private async monitorDefaultImport(progress: DefaultAgentPluginsImportProgress, sequence: number, refresh = true) {
    let unavailableSince: number | null = null
    while (sequence === this.defaultSequence) {
      this.defaultImportProgress.set(progress)
      this.defaultImportError.set(progress.error ?? null)
      if (progress.commit) this.defaultImportResult.set({ commit: progress.commit, items: progress.items })
      if (!['fetching', 'importing'].includes(progress.phase) || !progress.operationId) {
        if (refresh && progress.phase !== 'idle') await this.refresh()
        return
      }
      refresh = true
      this.importingDefaults.set(true)
      this.busy.set(true)
      await new Promise<void>((resolve) => {
        this.wakeDefaultPoll = resolve
        this.defaultPollTimer = setTimeout(resolve, 2000)
      })
      if (sequence !== this.defaultSequence) return
      try {
        // A resume request also recovers a worker lost during an API restart, without starting a new job.
        progress = await firstValueFrom(
          this.http.post<DefaultAgentPluginsImportProgress>(`${this.endpoint}/defaults`, {
            operationId: progress.operationId
          })
        )
        if (sequence !== this.defaultSequence) return
        this.defaultImportDisconnected.set(false)
        unavailableSince = null
      } catch (error) {
        if (!(error instanceof HttpErrorResponse) || ![0, 502, 503, 504].includes(error.status)) throw error
        unavailableSince ??= Date.now()
        if (Date.now() - unavailableSince > 180_000) throw error
        if (sequence === this.defaultSequence) this.defaultImportDisconnected.set(true)
      }
    }
  }

  private stopDefaultPolling() {
    this.defaultSequence++
    clearTimeout(this.defaultPollTimer)
    this.wakeDefaultPoll?.()
    this.wakeDefaultPoll = undefined
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

  private setUpdateBranch(pkg: PackageSummary) {
    const source = pkg.source
    const branch =
      source?.url === DEFAULT_AGENT_PLUGINS_SOURCE.url &&
      source.subdirectory?.startsWith(`${DEFAULT_AGENT_PLUGINS_SOURCE.subdirectory}/`)
        ? DEFAULT_AGENT_PLUGINS_SOURCE.ref
        : (source?.ref?.replace(/^refs\/heads\//, '') ?? '')
    this.updateBranch.setValue(/^[a-f\d]{40,64}$/i.test(branch) ? '' : branch)
  }

  async updatePlugin() {
    const pkg = this.selectedPackage()
    if (!pkg || pkg.source?.kind !== 'git' || this.updateBranch.invalid || this.busy() || this.updating()) return
    const sequence = ++this.updateSequence
    this.updating.set(true)
    this.error.set(null)
    this.cleanupPreview.set(null)
    try {
      const progress = await firstValueFrom(
        this.http.post<AgentPluginUpdateProgress>(`${this.endpoint}/packages/${pkg.id}/update`, {
          branch: this.updateBranch.value
        })
      )
      await this.monitorUpdate(progress, sequence)
    } catch (error) {
      if (sequence === this.updateSequence) this.error.set(getErrorMessage(error))
    } finally {
      if (sequence === this.updateSequence) this.updating.set(false)
    }
  }

  private async restoreUpdate() {
    const sequence = this.updateSequence
    try {
      const progress = await firstValueFrom(this.http.get<AgentPluginUpdateProgress>(`${this.endpoint}/updates`))
      if (progress.phase === 'updating') await this.monitorUpdate(progress, sequence)
    } catch (error) {
      if (sequence === this.updateSequence) this.error.set(getErrorMessage(error))
    } finally {
      if (sequence === this.updateSequence) this.updating.set(false)
    }
  }

  private async monitorUpdate(progress: AgentPluginUpdateProgress, sequence: number) {
    let unavailableSince: number | null = null
    while (sequence === this.updateSequence) {
      this.updateProgress.set(progress)
      if (progress.phase !== 'updating' || !progress.operationId || !progress.packageId) {
        if (progress.phase === 'failed') this.error.set(progress.error ?? '')
        if (progress.phase === 'completed') {
          await this.refresh()
          if (sequence === this.updateSequence && progress.result) this.selectVersion(progress.result.packageId)
        }
        return
      }
      this.updating.set(true)
      await new Promise<void>((resolve) => {
        this.wakeUpdate = resolve
        this.updateTimer = setTimeout(resolve, 2000)
      })
      if (sequence !== this.updateSequence) return
      try {
        progress = await firstValueFrom(
          this.http.post<AgentPluginUpdateProgress>(`${this.endpoint}/packages/${progress.packageId}/update`, {
            operationId: progress.operationId
          })
        )
        unavailableSince = null
      } catch (error) {
        if (!(error instanceof HttpErrorResponse) || ![0, 502, 503, 504].includes(error.status)) throw error
        unavailableSince ??= Date.now()
        if (Date.now() - unavailableSince > 180_000) throw error
      }
    }
  }

  private stopUpdatePolling() {
    this.updateSequence++
    clearTimeout(this.updateTimer)
    this.wakeUpdate?.()
    this.wakeUpdate = undefined
  }

  previewCleanup() {
    const pkg = this.selectedPackage()
    if (!pkg) return
    const generation = this.generation
    return this.run(async () => {
      const result = await firstValueFrom(
        this.http.get<AgentPluginCleanupResult>(`${this.endpoint}/packages/${pkg.id}/cleanup`)
      )
      if (generation === this.generation) {
        this.cleanupTargetId = result.targetPackageId
        this.cleanupPreview.set(result)
      }
    })
  }

  cleanupOldVersions() {
    const ids = this.cleanupCandidates().map((item) => item.packageId)
    if (!this.cleanupPreview() || !this.cleanupTargetId) return
    const generation = this.generation
    return this.run(async () => {
      const result = await firstValueFrom(
        this.http.post<AgentPluginCleanupResult>(`${this.endpoint}/packages/${this.cleanupTargetId}/cleanup`, {
          packageIds: ids
        })
      )
      if (generation === this.generation) {
        this.cleanupTargetId = result.targetPackageId
        this.cleanupPreview.set(result)
        if (result.deleted.includes(this.selectedPackageId())) {
          const newest = this.selectedGroup()?.packages[0]
          if (newest) this.selectVersion(newest.id)
          this.cleanupPreview.set(result)
        }
      }
    })
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
  openGroup(group: PluginGroup, tab: 'overview' | 'history' = 'overview') {
    if (this.busy() || this.updating()) return
    this.selectedName.set(group.name)
    this.notice.set(false)
    this.detailTab.set(tab)
    this.cleanupPreview.set(null)
    this.loadBinding(group.currentBindings.find((item) => item.enabled) ?? group.currentBindings[0])
  }
  closeDetails() {
    this.selectedName.set('')
    this.cleanupPreview.set(null)
    this.selectedPackageId.set('')
    this.replacesBindingId.set('')
    this.expertMappings.set({})
  }
  loadBinding(binding?: PluginBinding) {
    const group = this.selectedGroup()
    if (!group) return
    const pkg = group.packages.find((item) => item.id === binding?.definition.packageId) ?? group.packages[0]
    this.replacesBindingId.set(binding?.id ?? '')
    this.selectedPackageId.set(pkg.id)
    this.setUpdateBranch(pkg)
    this.expertMappings.set({ ...binding?.definition.experts })
    this.binding.reset({
      title: binding?.title || this.packageTitle(pkg),
      description: binding?.description ?? this.packageDescription(pkg)
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
    this.setUpdateBranch(pkg)
    this.cleanupPreview.set(null)
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
  mapExpert(reference: string, value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') {
      this.expertMappings.update((values) => ({ ...values, [reference]: value }))
    }
  }
  bindingVersion(binding: PluginBinding) {
    const pkg = this.selectedGroup()?.packages.find((item) => item.id === binding.definition.packageId)
    return pkg ? packageVersion(pkg) : ''
  }
  saveConfiguration() {
    const pkg = this.selectedPackage()
    if (!pkg || this.binding.invalid || this.missingMappings()) {
      this.binding.markAllAsTouched()
      return
    }
    const previous = this.selectedBinding()
    const definition: RuntimeResourceBindingInput['definition'] = {
      kind: 'agent_plugin',
      availability: 'scope',
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
      workspaceIds: [],
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
