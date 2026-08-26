import { Clipboard } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  IMcpApiKey,
  IMcpCapabilityCatalog,
  IMcpInvocationAudit,
  IMcpOAuthPolicy,
  IMcpPublication,
  IMcpPublicationCapability,
  IMcpPublicationSummary,
  McpCapabilityApprovalMode,
  McpCapabilityType
} from '@xpert-ai/contracts'
import {
  ZardAccordionImports,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
  ZardDialogService,
  ZardEmptyComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardPaginationImports,
  ZardSelectImports,
  ZardSwitchComponent,
  ZardTableImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import {
  CreatedMcpApiKey,
  getErrorMessage,
  injectToastr,
  McpCapabilityBindingInput,
  McpConnectionInfo,
  McpPublicationService,
  McpPublicationTestResult,
  Store,
  XpertToolsetService
} from '../../../@core'

type PublicationSection = 'basic' | 'capabilities' | 'authentication' | 'policy' | 'instructions' | 'audit' | 'test'

interface CapabilityDraft {
  catalog: IMcpCapabilityCatalog
  selected: boolean
  publicName: string
  approvalMode: McpCapabilityApprovalMode
  timeoutMs: number | null
  rateRequests: number | null
  rateWindowSeconds: number | null
}

interface CapabilityGroup {
  toolsetId: string
  label: string
  pluginName?: string
  capabilityCount?: number
  capabilities: CapabilityDraft[]
}

interface CapabilityGroupSource {
  toolsetId: string
  label: string
  pluginName?: string
  capabilityCount: number
}

const DEFAULT_MCP_API_KEY_SCOPES = [
  'tools:list',
  'tools:call',
  'resources:list',
  'resources:read',
  'prompts:list',
  'prompts:get'
]

@Component({
  selector: 'xp-mcp-publications',
  standalone: true,
  templateUrl: './publications.component.html',
  host: {
    class: 'flex min-h-0 min-w-0 w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardAccordionImports,
    ...ZardFormImports,
    ...ZardPaginationImports,
    ...ZardSelectImports,
    ...ZardTableImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMcpPublicationsComponent {
  readonly #publicationService = inject(McpPublicationService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #store = inject(Store)
  readonly #formBuilder = inject(FormBuilder)
  readonly #dialog = inject(ZardDialogService)
  readonly #toastr = injectToastr()
  readonly #clipboard = inject(Clipboard)

  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly canManageMcp = computed(() => true)
  readonly oauthAvailable = environment.mcpOAuthEnabled
  readonly mcpScopeOptions = [
    { value: 'tools:list', key: 'ToolsList', defaultLabel: 'List tools' },
    { value: 'tools:call', key: 'ToolsCall', defaultLabel: 'Call tools' },
    { value: 'resources:list', key: 'ResourcesList', defaultLabel: 'List resources' },
    { value: 'resources:read', key: 'ResourcesRead', defaultLabel: 'Read resources' },
    { value: 'prompts:list', key: 'PromptsList', defaultLabel: 'List prompts' },
    { value: 'prompts:get', key: 'PromptsGet', defaultLabel: 'Get prompts' }
  ] as const

  readonly sections: Array<{ id: PublicationSection; key: string; defaultLabel: string }> = [
    { id: 'basic', key: 'Basic', defaultLabel: 'Basic information' },
    { id: 'capabilities', key: 'Capabilities', defaultLabel: 'Capabilities' },
    { id: 'authentication', key: 'Authentication', defaultLabel: 'Authentication' },
    { id: 'policy', key: 'Policy', defaultLabel: 'Permission policy' },
    { id: 'instructions', key: 'Instructions', defaultLabel: 'Instructions' },
    { id: 'audit', key: 'Audit', defaultLabel: 'Audit' },
    { id: 'test', key: 'Test', defaultLabel: 'Test' }
  ]
  readonly approvalModes: McpCapabilityApprovalMode[] = ['deny', 'allow', 'confirm']

  readonly loading = signal(false)
  readonly detailLoading = signal(false)
  readonly auditLoading = signal(false)
  readonly saving = signal(false)
  readonly publications = signal<IMcpPublicationSummary[]>([])
  readonly selectedPublicationId = signal<string | null>(null)
  readonly publication = signal<(IMcpPublication & { capabilities?: IMcpPublicationCapability[] }) | null>(null)
  readonly capabilityDrafts = signal<CapabilityDraft[]>([])
  readonly apiKeys = signal<Array<Omit<IMcpApiKey, 'keyHash'>>>([])
  readonly oauthPolicy = signal<IMcpOAuthPolicy | null>(null)
  readonly auditEntries = signal<IMcpInvocationAudit[]>([])
  readonly auditTotal = signal(0)
  readonly auditPageIndex = signal(0)
  readonly auditPageSize = 10
  readonly connectionInfo = signal<McpConnectionInfo | null>(null)
  readonly testResult = signal<McpPublicationTestResult | null>(null)
  readonly revealedApiKey = signal<CreatedMcpApiKey | null>(null)
  readonly activeSection = signal<PublicationSection>('basic')
  readonly toolsetNames = signal<Record<string, string>>({})
  readonly publishableToolsetIds = signal<string[]>([])
  readonly capabilityGroupSources = signal<CapabilityGroupSource[]>([])
  readonly loadedCapabilityGroupIds = signal<string[]>([])
  readonly capabilityGroupLoading = signal<Record<string, boolean>>({})
  readonly createServiceDialog = viewChild<TemplateRef<void>>('createServiceDialog')
  #createServiceDialogRef: ZardDialogRef<void> | null = null
  #scopeLoadSequence = 0
  #detailLoadSequence = 0
  #auditLoadSequence = 0

  readonly selectedSummary = computed(
    () => this.publications().find(({ id }) => id === this.selectedPublicationId()) ?? null
  )
  readonly selectedCapabilityCount = computed(() => this.capabilityDrafts().filter(({ selected }) => selected).length)
  readonly capabilityGroups = computed<CapabilityGroup[]>(() => {
    const groups = new Map<string, CapabilityGroup>()
    for (const source of this.capabilityGroupSources()) {
      groups.set(source.toolsetId, { ...source, capabilities: [] })
    }
    for (const capability of this.capabilityDrafts()) {
      const toolsetId = capability.catalog.toolsetId
      let group = groups.get(toolsetId)
      if (!group) {
        const pluginName = capability.catalog.descriptor.source.pluginName
        group = {
          toolsetId,
          label: this.toolsetNames()[toolsetId] ?? pluginName ?? toolsetId,
          ...(pluginName ? { pluginName } : {}),
          capabilities: []
        }
        groups.set(toolsetId, group)
      }
      group.capabilities.push(capability)
    }
    return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label))
  })
  readonly capabilityCountLabel = computed(() => {
    const groups = this.capabilityGroups()
    const available = groups.reduce((total, group) => total + (group.capabilityCount ?? group.capabilities.length), 0)
    return `${this.selectedCapabilityCount()} / ${available}`
  })
  readonly selectedCapabilityDrafts = computed(() => this.capabilityDrafts().filter(({ selected }) => selected))
  readonly auditPageCount = computed(() => Math.max(1, Math.ceil(this.auditTotal() / this.auditPageSize)))
  readonly auditPageNumber = computed(() => Math.min(this.auditPageIndex() + 1, this.auditPageCount()))
  readonly auditPaginationPages = computed(() => {
    const pageCount = this.auditPageCount()
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
    const current = this.auditPageNumber()
    const middleStart = Math.max(2, Math.min(current - 1, pageCount - 3))
    return [1, middleStart, middleStart + 1, middleStart + 2, pageCount].filter(
      (page, index, pages) => pages.indexOf(page) === index
    )
  })

  readonly createForm = this.#formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    instructions: ['']
  })
  readonly basicForm = this.#formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    slug: this.#formBuilder.nonNullable.control({ value: '', disabled: true }, [
      Validators.required,
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    ]),
    apiKey: true,
    oauth: false
  })
  readonly instructionsForm = this.#formBuilder.nonNullable.group({ instructions: [''] })
  readonly apiKeyForm = this.#formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    scopes: this.#formBuilder.nonNullable.control<string[]>([...DEFAULT_MCP_API_KEY_SCOPES], Validators.required),
    expiresAt: ['']
  })
  readonly oauthForm = this.#formBuilder.nonNullable.group({
    issuer: ['', Validators.required],
    audience: ['', Validators.required],
    requiredScopes: this.#formBuilder.nonNullable.control<string[]>([]),
    subjectClaim: ['sub', Validators.required],
    emailClaim: ['email'],
    clientIdClaim: ['azp'],
    introspectionEnabled: false,
    introspectionEndpoint: ['', Validators.maxLength(2048)],
    introspectionClientId: ['', Validators.maxLength(500)],
    introspectionClientSecret: ['', Validators.maxLength(4096)],
    enabled: false
  })

  readonly codexConfiguration = computed(() => {
    const endpoint = this.connectionInfo()?.endpoint ?? 'https://YOUR_XPERT_HOST/api/mcp/p/SERVICE_SLUG'
    return `[mcp_servers.xpert]\nurl = "${endpoint}"\nbearer_token_env_var = "XPERT_MCP_API_KEY"`
  })
  readonly workBuddyConfiguration = computed(() => {
    const endpoint = this.connectionInfo()?.endpoint ?? 'https://YOUR_XPERT_HOST/api/mcp/p/SERVICE_SLUG'
    return JSON.stringify(
      {
        mcpServers: {
          xpert: {
            type: 'streamableHttp',
            url: endpoint,
            headers: { Authorization: 'Bearer ${XPERT_MCP_API_KEY}' }
          }
        }
      },
      null,
      2
    )
  })
  readonly genericConfiguration = computed(() => {
    const endpoint = this.connectionInfo()?.endpoint ?? 'https://YOUR_XPERT_HOST/api/mcp/p/SERVICE_SLUG'
    return `Transport: Streamable HTTP\nProtocol: 2026-07-28\nURL: ${endpoint}\nAuthorization: Bearer $XPERT_MCP_API_KEY`
  })

  constructor() {
    if (!this.oauthAvailable) this.oauthForm.disable({ emitEvent: false })

    effect(() => {
      this.organizationId()
      void this.loadScope()
    })
  }

  async loadScope() {
    const sequence = ++this.#scopeLoadSequence
    ++this.#detailLoadSequence
    this.loading.set(true)
    this.detailLoading.set(false)
    try {
      const [publications, toolsetsResponse] = await Promise.all([
        firstValueFrom(this.#publicationService.list()),
        firstValueFrom(this.#toolsetService.getAllInOrg({ take: 1_000 }))
      ])
      if (sequence !== this.#scopeLoadSequence) return
      this.publications.set(publications)
      this.toolsetNames.set(
        Object.fromEntries(toolsetsResponse.items.filter(({ id }) => !!id).map((toolset) => [toolset.id, toolset.name]))
      )
      const publishableToolsets = toolsetsResponse.items.filter(
        (toolset) =>
          !!toolset.id && !toolset.workspaceId && (toolset.category === 'builtin' || toolset.category === 'mcp')
      )
      this.publishableToolsetIds.set(publishableToolsets.flatMap(({ id }) => (id ? [id] : [])))
      const selectedId = publications.some(({ id }) => id === this.selectedPublicationId())
        ? this.selectedPublicationId()
        : (publications[0]?.id ?? null)
      if (selectedId) {
        await this.selectPublication(selectedId)
      } else {
        this.clearSelectedPublication()
      }
    } catch (error) {
      if (sequence === this.#scopeLoadSequence) this.#toastr.error(getErrorMessage(error))
    } finally {
      if (sequence === this.#scopeLoadSequence) this.loading.set(false)
    }
  }

  async refreshPublicationList() {
    try {
      this.publications.set(await firstValueFrom(this.#publicationService.list()))
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async createPublication() {
    if (!this.canManageMcp()) return
    this.createForm.markAllAsTouched()
    if (this.createForm.invalid) return
    this.saving.set(true)
    try {
      const input = this.createForm.getRawValue()
      const publication = await firstValueFrom(
        this.#publicationService.create({
          name: input.name,
          slug: input.slug,
          instructions: input.instructions || null,
          authMethods: ['api_key']
        })
      )
      this.createForm.reset({ name: '', slug: '', instructions: '' })
      await this.refreshPublicationList()
      if (publication.id) await this.selectPublication(publication.id)
      this.closeCreateServiceDialog()
      this.#toastr.success('XP.Messages.CreatedSuccessfully', { Default: 'Created successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  selectApiKeyScopes(value: ZardSelectValue | ZardSelectValue[]) {
    this.apiKeyForm.controls.scopes.setValue(normalizeMcpScopes(value))
    this.apiKeyForm.controls.scopes.markAsDirty()
  }

  selectOAuthScopes(value: ZardSelectValue | ZardSelectValue[]) {
    this.oauthForm.controls.requiredScopes.setValue(normalizeMcpScopes(value))
    this.oauthForm.controls.requiredScopes.markAsDirty()
  }

  openCreateServiceDialog() {
    const template = this.createServiceDialog()
    if (!template) return
    this.createForm.reset({ name: '', slug: '', instructions: '' })
    this.#createServiceDialogRef = this.#dialog.open(template, {
      width: 'min(92vw, 680px)',
      maxHeight: 'min(90vh, 48rem)',
      panelClass: 'overflow-hidden'
    })
    this.#createServiceDialogRef.closed.subscribe(() => {
      this.#createServiceDialogRef = null
    })
  }

  closeCreateServiceDialog() {
    this.#createServiceDialogRef?.close()
  }

  async selectPublication(publicationId: string, force = false) {
    if (!force && publicationId === this.selectedPublicationId() && this.publication()) return
    const sequence = ++this.#detailLoadSequence
    this.selectedPublicationId.set(publicationId)
    this.revealedApiKey.set(null)
    this.testResult.set(null)
    this.auditPageIndex.set(0)
    this.auditTotal.set(0)
    this.detailLoading.set(true)
    try {
      const [publication, capabilitySources, apiKeys, oauthPolicy, auditPage, connectionInfo] = await Promise.all([
        firstValueFrom(this.#publicationService.get(publicationId)),
        firstValueFrom(this.#publicationService.availableCapabilitySources(publicationId)),
        firstValueFrom(this.#publicationService.listApiKeys(publicationId)),
        this.oauthAvailable
          ? firstValueFrom(this.#publicationService.getOAuthPolicy(publicationId))
          : Promise.resolve(null),
        firstValueFrom(this.#publicationService.audit(publicationId, { skip: 0, take: this.auditPageSize })),
        firstValueFrom(this.#publicationService.connectionInfo(publicationId))
      ])
      if (sequence !== this.#detailLoadSequence) return
      this.publication.set(publication)
      this.capabilityGroupSources.set(
        capabilitySources.map(({ toolsetId, name, pluginName, capabilityCount }) => ({
          toolsetId,
          label: name,
          ...(pluginName ? { pluginName } : {}),
          capabilityCount
        }))
      )
      this.toolsetNames.update((names) => ({
        ...names,
        ...Object.fromEntries(capabilitySources.map(({ toolsetId, name }) => [toolsetId, name]))
      }))
      const bindings = publication.capabilities ?? []
      this.capabilityDrafts.set(this.buildCapabilityDrafts(bindings.map(catalogFromBinding), bindings))
      this.loadedCapabilityGroupIds.set([])
      this.capabilityGroupLoading.set({})
      this.apiKeys.set(apiKeys)
      this.oauthPolicy.set(oauthPolicy)
      this.auditEntries.set(auditPage.items)
      this.auditTotal.set(auditPage.total)
      this.connectionInfo.set(connectionInfo)
      this.patchForms(publication, oauthPolicy)
    } catch (error) {
      if (sequence === this.#detailLoadSequence) this.#toastr.error(getErrorMessage(error))
    } finally {
      if (sequence === this.#detailLoadSequence) this.detailLoading.set(false)
    }
  }

  async setSection(section: PublicationSection) {
    this.activeSection.set(section)
    if (section === 'audit') await this.refreshAudit(0)
  }

  async refreshAudit(pageIndex = this.auditPageIndex()) {
    const publicationId = this.selectedPublicationId()
    if (!publicationId) return
    const sequence = ++this.#auditLoadSequence
    this.auditLoading.set(true)
    try {
      const auditPage = await firstValueFrom(
        this.#publicationService.audit(publicationId, {
          skip: pageIndex * this.auditPageSize,
          take: this.auditPageSize
        })
      )
      if (sequence === this.#auditLoadSequence && publicationId === this.selectedPublicationId()) {
        this.auditEntries.set(auditPage.items)
        this.auditTotal.set(auditPage.total)
        this.auditPageIndex.set(pageIndex)
        if (pageIndex === 0) {
          const recentInvocationAt = auditPage.items[0]?.createdAt
          const recentErrorAt = auditPage.items.find(
            ({ status }) => status === 'failed' || status === 'denied'
          )?.createdAt
          this.publications.update((publications) =>
            publications.map((publication) =>
              publication.id === publicationId
                ? {
                    ...publication,
                    recentInvocationAt: recentInvocationAt ?? publication.recentInvocationAt ?? null,
                    recentErrorAt: recentErrorAt ?? publication.recentErrorAt ?? null
                  }
                : publication
            )
          )
        }
      }
    } catch (error) {
      if (sequence === this.#auditLoadSequence) this.#toastr.error(getErrorMessage(error))
    } finally {
      if (sequence === this.#auditLoadSequence) this.auditLoading.set(false)
    }
  }

  async setAuditPage(pageNumber: number) {
    if (
      this.auditLoading() ||
      pageNumber < 1 ||
      pageNumber > this.auditPageCount() ||
      pageNumber === this.auditPageNumber()
    ) {
      return
    }
    await this.refreshAudit(pageNumber - 1)
  }

  async loadCapabilityGroup(toolsetId: string) {
    const publicationId = this.selectedPublicationId()
    if (
      !publicationId ||
      this.loadedCapabilityGroupIds().includes(toolsetId) ||
      this.capabilityGroupLoading()[toolsetId]
    ) {
      return
    }
    this.capabilityGroupLoading.update((state) => ({ ...state, [toolsetId]: true }))
    try {
      const catalog = await firstValueFrom(this.#publicationService.availableCapabilities(publicationId, toolsetId))
      if (publicationId !== this.selectedPublicationId()) return
      const bindings = (this.publication()?.capabilities ?? []).filter((binding) => binding.toolsetId === toolsetId)
      const groupDrafts = this.buildCapabilityDrafts(catalog, bindings)
      this.capabilityDrafts.update((drafts) => [
        ...drafts.filter(({ catalog: current }) => current.toolsetId !== toolsetId),
        ...groupDrafts
      ])
      this.loadedCapabilityGroupIds.update((ids) => [...ids, toolsetId])
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.capabilityGroupLoading.update((state) => ({ ...state, [toolsetId]: false }))
    }
  }

  isCapabilityGroupLoading(toolsetId: string) {
    return this.capabilityGroupLoading()[toolsetId] === true
  }

  isCapabilityGroupLoaded(toolsetId: string) {
    return this.loadedCapabilityGroupIds().includes(toolsetId)
  }

  capabilityGroupCountLabel(group: CapabilityGroup) {
    const selected = group.capabilities.filter(({ selected }) => selected).length
    return `${selected} / ${
      this.isCapabilityGroupLoaded(group.toolsetId) ? group.capabilities.length : (group.capabilityCount ?? '—')
    }`
  }

  async saveBasicInformation() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId || !this.canManageMcp()) return
    this.basicForm.markAllAsTouched()
    if (this.basicForm.invalid) return
    const values = this.basicForm.getRawValue()
    const authMethods = [values.apiKey ? 'api_key' : null, this.oauthAvailable && values.oauth ? 'oauth' : null].filter(
      (method): method is 'api_key' | 'oauth' => !!method
    )
    if (!authMethods.length) {
      this.#toastr.error('XP.McpPublication.AuthMethodRequired', 'XP.TOASTR.TITLE.ERROR', {
        Default: 'Enable at least one authentication method.'
      })
      return
    }
    await this.runSaving(async () => {
      const publication = await firstValueFrom(
        this.#publicationService.update(publicationId, {
          name: values.name,
          authMethods
        })
      )
      this.publication.update((current) => (current ? { ...current, ...publication } : current))
      await Promise.all([this.refreshPublicationList(), this.reloadConnectionInfo(publicationId)])
    })
  }

  async saveInstructions() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId || !this.canManageMcp()) return
    const instructions = this.instructionsForm.getRawValue().instructions
    await this.runSaving(async () => {
      const publication = await firstValueFrom(
        this.#publicationService.update(publicationId, { instructions: instructions || null })
      )
      this.publication.update((current) => (current ? { ...current, ...publication } : current))
      await this.reloadConnectionInfo(publicationId)
    })
  }

  toggleCapability(draft: CapabilityDraft, change: { checked: boolean }) {
    this.updateCapabilityDraft(draft, { selected: change.checked })
  }

  updateCapabilityText(draft: CapabilityDraft, field: 'publicName', event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement) this.updateCapabilityDraft(draft, { [field]: target.value })
  }

  updateCapabilityNumber(
    draft: CapabilityDraft,
    field: 'timeoutMs' | 'rateRequests' | 'rateWindowSeconds',
    event: Event
  ) {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    const value = target.value ? Number(target.value) : null
    this.updateCapabilityDraft(draft, { [field]: value !== null && Number.isFinite(value) ? value : null })
  }

  setApprovalMode(draft: CapabilityDraft, approvalMode: McpCapabilityApprovalMode) {
    if (!this.canUseApprovalMode(draft, approvalMode)) return
    this.updateCapabilityDraft(draft, { approvalMode })
  }

  selectApprovalMode(draft: CapabilityDraft, value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string' && isApprovalMode(value)) this.setApprovalMode(draft, value)
  }

  canUseApprovalMode(draft: CapabilityDraft, approvalMode: McpCapabilityApprovalMode) {
    return !(
      approvalMode === 'allow' &&
      draft.catalog.descriptor.capabilityType === 'tool' &&
      draft.catalog.descriptor.behavior.risk === 'dangerous'
    )
  }

  async saveCapabilities() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId || !this.canManageMcp()) return
    const payload = this.selectedCapabilityDrafts().map<McpCapabilityBindingInput>((draft) => ({
      toolsetId: draft.catalog.toolsetId,
      capabilityType: draft.catalog.capabilityType,
      capabilityKey: draft.catalog.capabilityKey,
      publicName: draft.publicName.trim(),
      enabled: true,
      policy: {
        approvalMode: draft.approvalMode,
        ...(draft.timeoutMs ? { timeoutMs: draft.timeoutMs } : {}),
        ...(draft.rateRequests && draft.rateWindowSeconds
          ? { rateLimit: { requests: draft.rateRequests, windowSeconds: draft.rateWindowSeconds } }
          : {})
      }
    }))
    if (payload.some(({ publicName }) => !/^[a-zA-Z0-9_-]+$/.test(publicName))) {
      this.#toastr.error('XP.McpPublication.InvalidPublicName', 'XP.TOASTR.TITLE.ERROR', {
        Default: 'Public names may contain only letters, numbers, underscores, and hyphens.'
      })
      return
    }
    await this.runSaving(async () => {
      const capabilities = await firstValueFrom(this.#publicationService.replaceCapabilities(publicationId, payload))
      this.publication.update((current) => (current ? { ...current, capabilities } : current))
      await this.refreshPublicationList()
    })
  }

  async refreshCapabilityCatalog() {
    const publicationId = this.selectedPublicationId()
    const toolsetIds = this.publishableToolsetIds()
    if (!publicationId || !toolsetIds.length || !this.canManageMcp()) return
    this.saving.set(true)
    try {
      const results = await Promise.allSettled(
        toolsetIds.map((toolsetId) => firstValueFrom(this.#toolsetService.importMcpCapabilities(toolsetId)))
      )
      await this.selectPublication(publicationId, true)
      const failed = results.filter((result) => result.status === 'rejected').length
      if (failed) {
        this.#toastr.error('XP.McpPublication.CapabilityRefreshPartial', 'XP.TOASTR.TITLE.ERROR', {
          count: failed,
          Default: `${failed} toolsets could not refresh their MCP capability declarations.`
        })
      } else {
        this.#toastr.success('XP.McpPublication.CapabilityRefreshComplete', {
          Default: 'MCP capability declarations were refreshed for the current management scope.'
        })
      }
    } finally {
      this.saving.set(false)
    }
  }

  async createApiKey() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId || !this.canManageMcp()) return
    this.apiKeyForm.markAllAsTouched()
    if (this.apiKeyForm.invalid) return
    const values = this.apiKeyForm.getRawValue()
    await this.runSaving(async () => {
      const created = await firstValueFrom(
        this.#publicationService.createApiKey(publicationId, {
          name: values.name,
          scopes: normalizeMcpScopes(values.scopes),
          expiresAt: values.expiresAt || null
        })
      )
      this.revealedApiKey.set(created)
      this.apiKeys.update((keys) => [created.apiKey, ...keys])
      this.apiKeyForm.reset({ name: '', scopes: [...DEFAULT_MCP_API_KEY_SCOPES], expiresAt: '' })
      await this.refreshPublicationList()
    })
  }

  async revokeApiKey(apiKey: Omit<IMcpApiKey, 'keyHash'>) {
    if (!apiKey.id || !this.canManageMcp()) return
    await this.runSaving(async () => {
      const revoked = await firstValueFrom(this.#publicationService.revokeApiKey(apiKey.id))
      this.apiKeys.update((keys) => keys.map((item) => (item.id === revoked.id ? revoked : item)))
      if (this.revealedApiKey()?.apiKey.id === apiKey.id) this.revealedApiKey.set(null)
      await this.refreshPublicationList()
    })
  }

  async rotateApiKey(apiKey: Omit<IMcpApiKey, 'keyHash'>) {
    if (!apiKey.id || !this.canManageMcp()) return
    await this.runSaving(async () => {
      const rotated = await firstValueFrom(this.#publicationService.rotateApiKey(apiKey.id))
      this.revealedApiKey.set(rotated)
      this.apiKeys.update((keys) => [
        rotated.apiKey,
        ...keys.map((item) => (item.id === apiKey.id ? { ...item, revokedAt: new Date() } : item))
      ])
      await this.refreshPublicationList()
    })
  }

  async saveOAuthPolicy() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId || !this.canManageMcp() || !this.oauthAvailable) return
    this.oauthForm.markAllAsTouched()
    if (this.oauthForm.invalid) return
    const values = this.oauthForm.getRawValue()
    const clearIntrospectionSecret =
      this.oauthPolicy()?.introspectionClientSecretConfigured && !values.introspectionClientId
    await this.runSaving(async () => {
      const policy = await firstValueFrom(
        this.#publicationService.upsertOAuthPolicy(publicationId, {
          issuer: values.issuer,
          audience: values.audience,
          requiredScopes: normalizeMcpScopes(values.requiredScopes),
          subjectMapping: {
            subjectClaim: values.subjectClaim,
            ...(values.emailClaim ? { emailClaim: values.emailClaim } : {}),
            ...(values.clientIdClaim ? { clientIdClaim: values.clientIdClaim } : {})
          },
          introspection: {
            enabled: values.introspectionEnabled,
            ...(values.introspectionEndpoint ? { endpoint: values.introspectionEndpoint } : {}),
            ...(values.introspectionClientId ? { clientId: values.introspectionClientId } : {}),
            ...(values.introspectionClientSecret
              ? { clientSecret: values.introspectionClientSecret }
              : clearIntrospectionSecret
                ? { clientSecret: null }
                : {})
          },
          enabled: values.enabled
        })
      )
      this.oauthPolicy.set(policy)
      this.oauthForm.controls.introspectionClientSecret.reset('')
      await this.refreshPublicationList()
    })
  }

  async testOAuthPolicy() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId || !this.oauthAvailable) return
    await this.runSaving(
      async () => {
        await firstValueFrom(this.#publicationService.testOAuthPolicy(publicationId))
      },
      'XP.McpPublication.OAuthTestPassed',
      'OAuth discovery configuration passed.'
    )
  }

  async togglePublicationStatus() {
    const publication = this.publication()
    if (!publication?.id || !this.canManageMcp()) return
    await this.runSaving(async () => {
      const updated = await firstValueFrom(
        publication.status === 'active'
          ? this.#publicationService.disable(publication.id)
          : this.#publicationService.enable(publication.id)
      )
      this.publication.update((current) => (current ? { ...current, ...updated } : current))
      await this.refreshPublicationList()
    })
  }

  async runTest() {
    const publicationId = this.selectedPublicationId()
    if (!publicationId) return
    this.saving.set(true)
    try {
      this.testResult.set(await firstValueFrom(this.#publicationService.test(publicationId)))
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  copy(value: string) {
    if (this.#clipboard.copy(value)) {
      this.#toastr.success('XP.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
    } else {
      this.#toastr.error('XP.Messages.CopyFailed', 'XP.TOASTR.TITLE.ERROR', { Default: 'Could not copy.' })
    }
  }

  capabilityTitle(draft: CapabilityDraft) {
    return draft.catalog.descriptor.title ?? draft.catalog.capabilityKey
  }

  capabilityDescription(draft: CapabilityDraft) {
    return draft.catalog.descriptor.description ?? ''
  }

  capabilityTypeLabel(type: McpCapabilityType) {
    return type.replace('_', ' ')
  }

  isApiKeyActive(apiKey: Omit<IMcpApiKey, 'keyHash'>) {
    if (apiKey.revokedAt) return false
    return !apiKey.expiresAt || new Date(apiKey.expiresAt).getTime() > Date.now()
  }

  private async runSaving(
    action: () => Promise<void>,
    successKey = 'XP.Messages.UpdatedSuccessfully',
    successDefault = 'Updated successfully'
  ) {
    this.saving.set(true)
    try {
      await action()
      this.#toastr.success(successKey, { Default: successDefault })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  private async reloadConnectionInfo(publicationId: string) {
    this.connectionInfo.set(await firstValueFrom(this.#publicationService.connectionInfo(publicationId)))
  }

  private patchForms(publication: IMcpPublication, oauthPolicy: IMcpOAuthPolicy | null) {
    this.basicForm.reset({
      name: publication.name,
      slug: publication.slug,
      apiKey: publication.authMethods.includes('api_key'),
      oauth: this.oauthAvailable && publication.authMethods.includes('oauth')
    })
    this.basicForm.controls.slug.disable({ emitEvent: false })
    this.instructionsForm.reset({ instructions: publication.instructions ?? '' })
    this.oauthForm.reset({
      issuer: oauthPolicy?.issuer ?? '',
      audience: oauthPolicy?.audience ?? this.connectionInfo()?.endpoint ?? '',
      requiredScopes: oauthPolicy?.requiredScopes ?? [],
      subjectClaim: oauthPolicy?.subjectMapping.subjectClaim ?? 'sub',
      emailClaim: oauthPolicy?.subjectMapping.emailClaim ?? 'email',
      clientIdClaim: oauthPolicy?.subjectMapping.clientIdClaim ?? 'azp',
      introspectionEnabled: oauthPolicy?.introspectionEnabled ?? false,
      introspectionEndpoint: oauthPolicy?.introspectionEndpoint ?? '',
      introspectionClientId: oauthPolicy?.introspectionClientId ?? '',
      introspectionClientSecret: '',
      enabled: oauthPolicy?.enabled ?? false
    })
  }

  private buildCapabilityDrafts(catalog: IMcpCapabilityCatalog[], bindings: IMcpPublicationCapability[]) {
    const bindingsByKey = new Map(bindings.map((binding) => [capabilityBindingKey(binding), binding]))
    const usedNames = new Set(bindings.map(({ publicName }) => publicName))
    return catalog.map<CapabilityDraft>((item) => {
      const binding = bindingsByKey.get(capabilityBindingKey(item))
      return {
        catalog: item,
        selected: binding?.enabled ?? false,
        publicName: binding?.publicName ?? uniquePublicName(item.capabilityKey, item.toolsetId, usedNames),
        approvalMode: binding?.policy?.approvalMode ?? defaultApprovalMode(item),
        timeoutMs: binding?.policy?.timeoutMs ?? null,
        rateRequests: binding?.policy?.rateLimit?.requests ?? null,
        rateWindowSeconds: binding?.policy?.rateLimit?.windowSeconds ?? null
      }
    })
  }

  private updateCapabilityDraft(draft: CapabilityDraft, patch: Partial<Omit<CapabilityDraft, 'catalog'>>) {
    this.capabilityDrafts.update((drafts) => drafts.map((item) => (item === draft ? { ...item, ...patch } : item)))
  }

  private clearSelectedPublication() {
    this.selectedPublicationId.set(null)
    this.publication.set(null)
    this.capabilityDrafts.set([])
    this.capabilityGroupSources.set([])
    this.loadedCapabilityGroupIds.set([])
    this.capabilityGroupLoading.set({})
    this.apiKeys.set([])
    this.oauthPolicy.set(null)
    this.auditEntries.set([])
    this.auditTotal.set(0)
    this.auditPageIndex.set(0)
    this.connectionInfo.set(null)
    this.testResult.set(null)
    this.revealedApiKey.set(null)
  }
}

function capabilityBindingKey(
  capability: Pick<IMcpCapabilityCatalog, 'toolsetId' | 'capabilityType' | 'capabilityKey'>
) {
  return `${capability.toolsetId}\u0000${capability.capabilityType}\u0000${capability.capabilityKey}`
}

function catalogFromBinding(binding: IMcpPublicationCapability): IMcpCapabilityCatalog {
  return {
    id: binding.id,
    tenantId: binding.tenantId,
    organizationId: binding.organizationId,
    toolsetId: binding.toolsetId,
    capabilityType: binding.capabilityType,
    capabilityKey: binding.capabilityKey,
    descriptorHash: binding.descriptorHash,
    descriptor: binding.descriptorSnapshot,
    enabled: binding.enabled
  }
}

function isApprovalMode(value: string): value is McpCapabilityApprovalMode {
  return value === 'deny' || value === 'allow' || value === 'confirm'
}

function normalizeMcpScopes(value: ZardSelectValue | ZardSelectValue[]) {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0))]
}

function uniquePublicName(capabilityKey: string, toolsetId: string, usedNames: Set<string>) {
  const base = capabilityKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 160) || `capability_${toolsetId.slice(0, 8)}`
  let candidate = base
  let suffix = 1
  while (usedNames.has(candidate)) {
    candidate = `${base.slice(0, 175)}_${suffix++}`
  }
  usedNames.add(candidate)
  return candidate
}

function defaultApprovalMode(capability: IMcpCapabilityCatalog): McpCapabilityApprovalMode {
  if (capability.descriptor.capabilityType !== 'tool') return 'allow'
  return capability.descriptor.behavior.risk === 'read' ? 'allow' : 'confirm'
}
