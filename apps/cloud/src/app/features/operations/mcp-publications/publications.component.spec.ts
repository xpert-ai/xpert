import { Clipboard } from '@angular/cdk/clipboard'
import { TestBed } from '@angular/core/testing'
import type {
  IMcpCapabilityCatalog,
  IMcpInvocationAudit,
  IMcpPublication,
  IMcpPublicationSummary,
  McpCapabilityDescriptor
} from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { of } from 'rxjs'
import { environment } from '../../../../environments/environment'

jest.mock('../../../@core', () => {
  const { inject } = require('@angular/core')

  class McpPublicationService {}
  class Store {}
  class ToastrService {}
  class XpertToolsetService {}

  return {
    McpPublicationService,
    Store,
    ToastrService,
    XpertToolsetService,
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    injectToastr: () => inject(ToastrService)
  }
})

import { McpPublicationService, Store, ToastrService, XpertToolsetService } from '../../../@core'
import { XpertMcpPublicationsComponent } from './publications.component'

async function setup(options?: { oauthEnabled?: boolean }) {
  const originalOAuthEnabled = environment.mcpOAuthEnabled
  environment.mcpOAuthEnabled = options?.oauthEnabled ?? false
  const publicationService = {
    list: jest.fn(() => of([publicationSummary('publication-1')])),
    get: jest.fn(() => of(publication('publication-1'))),
    create: jest.fn(() => of(publication('publication-2'))),
    availableCapabilitySources: jest.fn(() =>
      of([
        {
          toolsetId: 'toolset-generic',
          name: 'Generic organization tools',
          pluginName: '@example/plugin-generic',
          capabilityCount: 1
        }
      ])
    ),
    availableCapabilities: jest.fn(() => of([genericCapability()])),
    listApiKeys: jest.fn(() => of([])),
    getOAuthPolicy: jest.fn(() => of(null)),
    audit: jest.fn(() => of({ items: [] as IMcpInvocationAudit[], total: 0 })),
    connectionInfo: jest.fn(() =>
      of({
        protocolVersion: '2026-07-28',
        transport: 'streamable-http',
        endpoint: 'https://xpert.example/api/mcp/p/generic-service',
        authorization: 'Bearer'
      })
    ),
    replaceCapabilities: jest.fn((publicationId: string, input: unknown[]) =>
      of(
        input.map((item, index) => ({
          ...item,
          id: `binding-${index}`,
          publicationId
        }))
      )
    ),
    createApiKey: jest.fn(() =>
      of({
        apiKey: {
          id: 'key-1',
          publicationId: 'publication-1',
          name: 'Codex',
          keyPrefix: 'xpert_mcp_visible',
          subjectType: 'user',
          subjectId: 'user-1',
          scopes: ['tools:list', 'tools:call']
        },
        secret: 'xpert_mcp_one_time_secret'
      })
    ),
    upsertOAuthPolicy: jest.fn((_publicationId: string, input: Record<string, unknown>) =>
      of({
        id: 'oauth-1',
        publicationId: 'publication-1',
        issuer: 'https://issuer.example',
        audience: 'xpert-mcp',
        requiredScopes: ['tools:list'],
        subjectMapping: { subjectClaim: 'sub' },
        introspectionEnabled: true,
        introspectionEndpoint: 'https://issuer.example/introspect',
        introspectionClientId: 'resource-server',
        introspectionClientSecretConfigured: true,
        enabled: true,
        ...input
      })
    )
  }
  const toastr = { success: jest.fn(), error: jest.fn() }
  const clipboard = { copy: jest.fn(() => true) }
  const toolsetService = {
    getAllInOrg: jest.fn(() =>
      of({
        items: [
          {
            id: 'toolset-generic',
            name: 'Generic organization tools',
            category: 'builtin',
            workspaceId: null
          },
          {
            id: 'toolset-workspace',
            name: 'Workspace-only tools',
            category: 'builtin',
            workspaceId: 'workspace-1'
          }
        ]
      })
    ),
    importMcpCapabilities: jest.fn(() => of([genericCapability()]))
  }

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [XpertMcpPublicationsComponent],
    providers: [
      { provide: McpPublicationService, useValue: publicationService },
      { provide: XpertToolsetService, useValue: toolsetService },
      {
        provide: Store,
        useValue: { organizationId: 'organization-1', selectOrganizationId: jest.fn(() => of('organization-1')) }
      },
      { provide: ToastrService, useValue: toastr },
      { provide: Clipboard, useValue: clipboard },
      {
        provide: ZardDialogService,
        useValue: { open: jest.fn(() => ({ close: jest.fn(), closed: of(undefined) })) }
      }
    ]
  })
    .overrideComponent(XpertMcpPublicationsComponent, { set: { template: '', imports: [] } })
    .compileComponents()

  try {
    const fixture = TestBed.createComponent(XpertMcpPublicationsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    await fixture.componentInstance.loadScope()
    fixture.detectChanges()

    return { component: fixture.componentInstance, publicationService, toolsetService, clipboard }
  } finally {
    environment.mcpOAuthEnabled = originalOAuthEnabled
  }
}

describe('XpertMcpPublicationsComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('ships MCP publication translations for every supported locale', () => {
    const locales = ['en', 'zh-Hans', 'zh-Hant']
    const requiredPaths = [
      'Title',
      'Description',
      'Create',
      'CreateDialogTitle',
      'CreateDialogDescription',
      'CreateDraft',
      'Empty',
      'OpenCapabilities',
      'NoCapabilities',
      'LoadingCapabilities',
      'CapabilityGroupEmpty',
      'SlugImmutableHint',
      'SelectScopes',
      'Scope.ToolsList',
      'Scope.ToolsCall',
      'OAuthSetupTitle',
      'OAuthSetupDescription',
      'InvocationPolicy',
      'Section.Basic',
      'Section.Capabilities',
      'Section.Authentication',
      'Status.draft',
      'Status.active',
      'Status.disabled',
      'CapabilityType.tool',
      'CapabilityType.resource',
      'CapabilityType.resource_template',
      'CapabilityType.prompt',
      'Approval.deny',
      'Approval.allow',
      'Approval.confirm',
      'ApprovalAriaLabel',
      'ApprovalDescription.deny',
      'ApprovalDescription.allow',
      'ApprovalDescription.confirm',
      'ApiKeyStatus.active',
      'ApiKeyStatus.inactive',
      'AuditStatus.started',
      'AuditStatus.succeeded',
      'AuditStatus.failed',
      'Pagination',
      'AuditPageSummary',
      'PreviousPage',
      'NextPage',
      'CheckStatus.passed',
      'CheckStatus.warning',
      'CheckStatus.failed',
      'Ready',
      'NotReady',
      'ConnectionConfigurations'
    ]

    for (const locale of locales) {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const publicationMessages = messages.XP?.McpPublication

      for (const path of requiredPaths) {
        expect(readTranslationPath(publicationMessages, path)).toEqual(expect.any(String))
      }
      expect(readTranslationPath(publicationMessages, 'InstructionsHint')).toContain('server/discover')
    }
  })

  it('loads one MCP source capability group only when the group is opened', async () => {
    const { component, publicationService } = await setup()

    expect(publicationService.availableCapabilitySources).toHaveBeenCalledWith('publication-1')
    expect(component.capabilityGroups()).toEqual([
      expect.objectContaining({
        toolsetId: 'toolset-generic',
        label: 'Generic organization tools',
        pluginName: '@example/plugin-generic'
      })
    ])
    expect(component.capabilityDrafts()).toEqual([])
    expect(component.capabilityCountLabel()).toBe('0 / 1')
    expect(publicationService.availableCapabilities).not.toHaveBeenCalled()

    await component.loadCapabilityGroup('toolset-generic')

    expect(publicationService.availableCapabilities).toHaveBeenCalledWith('publication-1', 'toolset-generic')
    expect(component.capabilityDrafts()[0]).toMatchObject({ selected: false, publicName: 'echo' })
    expect(component.capabilityCountLabel()).toBe('0 / 1')
  })

  it('keeps OAuth unavailable in the open-source distribution', async () => {
    const { component, publicationService } = await setup()

    expect(component.oauthAvailable).toBe(false)
    expect(component.oauthForm.disabled).toBe(true)
    expect(component.basicForm.controls.oauth.value).toBe(false)
    expect(publicationService.getOAuthPolicy).not.toHaveBeenCalled()
  })

  it('uses a dialog, lazy accordion groups, multi-select scopes, and select-based approval policies', () => {
    const template = readFileSync(join(__dirname, 'publications.component.html'), 'utf8')

    expect(template).toContain("'XP.McpPublication.Title'")
    expect(template).toContain("'XP.McpPublication.Description'")
    expect(template).toContain("'XP.Operations.SuperAdminOnly'")
    expect(template).toContain('#createServiceDialog')
    expect(template).toContain('(click)="openCreateServiceDialog()"')
    expect(template).not.toContain('XP.McpPublication.InstalledMcpSource')
    expect(template).not.toContain('(zSelectionChange)="selectMcpSource($event)"')
    expect(template).toContain('<z-accordion')
    expect(template).toContain('<ng-template zAccordionContent>')
    expect(template).toContain('(opened)="loadCapabilityGroup(group.toolsetId)"')
    expect(template.match(/\[zMultiple\]="true"/g)).toHaveLength(2)
    expect(template).toContain('[zValue]="apiKeyForm.controls.scopes.value"')
    expect(template).toContain('(zSelectionChange)="selectApiKeyScopes($event)"')
    expect(template).toContain('[zValue]="oauthForm.controls.requiredScopes.value"')
    expect(template).toContain('(zSelectionChange)="selectOAuthScopes($event)"')
    expect(template).toContain('[disabled]="!oauthAvailable"')
    expect(template).toContain('(zSelectionChange)="selectApprovalMode(draft, $event)"')
    expect(template).not.toContain('XP.McpPublication.ApiKeyScopesHint')
    expect(template).not.toContain('XP.McpPublication.ApprovalDescription.')
    expect(template.match(/\(click\)="copy\(revealed\.secret\)"/g)).toHaveLength(2)
    expect(template).toContain('class="mt-4 grid w-full items-end gap-4 lg:grid-cols-2"')
    expect(template).toContain('<div class="flex lg:col-span-2">')
    expect(template).not.toContain('<button z-button class="w-full" type="submit"')
    expect(template).toContain('<form class="mt-4 w-full space-y-4" [formGroup]="oauthForm"')
    expect(template).not.toContain('max-w-4xl')
    expect(template).toContain('<form class="w-full space-y-4" [formGroup]="basicForm"')
    expect(template).toContain('<form class="w-full" [formGroup]="instructionsForm"')
    expect(template).not.toContain('role="radiogroup"')
    expect(template).toContain('<z-pagination')
  })

  it('creates a custom draft without importing an installed MCP source', async () => {
    const { component, publicationService, toolsetService } = await setup()

    component.createForm.setValue({
      name: 'Developer tools',
      slug: 'developer-tools',
      instructions: 'Use approved capabilities.'
    })

    await component.createPublication()

    expect(toolsetService.importMcpCapabilities).not.toHaveBeenCalled()
    expect(publicationService.create).toHaveBeenCalledWith({
      name: 'Developer tools',
      slug: 'developer-tools',
      instructions: 'Use approved capabilities.',
      authMethods: ['api_key']
    })
    expect(publicationService.replaceCapabilities).not.toHaveBeenCalled()
  })

  it('finishes scope loading after automatically selecting the first publication', async () => {
    const { component } = await setup()
    component.selectedPublicationId.set(null)
    component.publication.set(null)

    await component.loadScope()

    expect(component.selectedPublicationId()).toBe('publication-1')
    expect(component.loading()).toBe(false)
    expect(component.detailLoading()).toBe(false)
  })

  it('refreshes invocation audit when the audit section is opened', async () => {
    const { component, publicationService } = await setup()
    publicationService.audit.mockClear()
    publicationService.audit.mockReturnValue(of({ items: [invocationAudit()], total: 11 }))

    await component.setSection('audit')

    expect(publicationService.audit).toHaveBeenCalledWith('publication-1', { skip: 0, take: 10 })
    expect(component.auditEntries()).toEqual([invocationAudit()])
    expect(component.auditTotal()).toBe(11)
    expect(component.auditPageCount()).toBe(2)
    expect(component.selectedSummary()).toEqual(
      expect.objectContaining({
        recentInvocationAt: new Date('2026-08-24T06:00:00.000Z'),
        recentErrorAt: new Date('2026-08-24T06:00:00.000Z')
      })
    )
  })

  it('loads ten audit records at a time when the page changes', async () => {
    const { component, publicationService } = await setup()
    const secondPageEntry = { ...invocationAudit(), id: 'audit-11' }
    publicationService.audit.mockClear()
    publicationService.audit
      .mockReturnValueOnce(of({ items: [invocationAudit()], total: 11 }))
      .mockReturnValueOnce(of({ items: [secondPageEntry], total: 11 }))

    await component.setSection('audit')
    publicationService.audit.mockClear()

    await component.setAuditPage(2)

    expect(publicationService.audit).toHaveBeenCalledWith('publication-1', { skip: 10, take: 10 })
    expect(component.auditPageIndex()).toBe(1)
    expect(component.auditEntries()).toEqual([secondPageEntry])
  })

  it('publishes a selected generic capability with its policy', async () => {
    const { component, publicationService } = await setup()
    await component.loadCapabilityGroup('toolset-generic')
    const draft = component.capabilityDrafts()[0]
    component.toggleCapability(draft, { checked: true })
    component.setApprovalMode(component.capabilityDrafts()[0], 'confirm')

    await component.saveCapabilities()

    expect(publicationService.replaceCapabilities).toHaveBeenCalledWith('publication-1', [
      expect.objectContaining({
        toolsetId: 'toolset-generic',
        capabilityType: 'tool',
        capabilityKey: 'echo',
        publicName: 'echo',
        policy: expect.objectContaining({ approvalMode: 'confirm' })
      })
    ])
  })

  it('refreshes native plugin declarations from every publishable toolset in scope', async () => {
    const { component, toolsetService, publicationService } = await setup()

    await component.refreshCapabilityCatalog()

    expect(toolsetService.importMcpCapabilities).toHaveBeenCalledWith('toolset-generic')
    expect(toolsetService.importMcpCapabilities).not.toHaveBeenCalledWith('toolset-workspace')
    expect(publicationService.availableCapabilities).not.toHaveBeenCalled()
  })

  it('does not allow a dangerous tool to bypass approval', async () => {
    const { component } = await setup()
    await component.loadCapabilityGroup('toolset-generic')
    component.setApprovalMode(component.capabilityDrafts()[0], 'confirm')
    const draft = component.capabilityDrafts()[0]
    if (draft.catalog.descriptor.capabilityType !== 'tool') throw new Error('Expected a tool capability')
    draft.catalog.descriptor.behavior.risk = 'dangerous'

    expect(component.canUseApprovalMode(draft, 'allow')).toBe(false)
    component.setApprovalMode(draft, 'allow')

    expect(component.capabilityDrafts()[0].approvalMode).toBe('confirm')
  })

  it('keeps a new secret only in one-time view state and never places it in client configuration', async () => {
    const { component, clipboard } = await setup()
    component.apiKeyForm.setValue({ name: 'Codex', scopes: ['tools:list', 'tools:call'], expiresAt: '' })

    await component.createApiKey()

    expect(component.revealedApiKey()?.secret).toBe('xpert_mcp_one_time_secret')
    expect(component.codexConfiguration()).toContain('bearer_token_env_var = "XPERT_MCP_API_KEY"')
    expect(component.codexConfiguration()).not.toContain('xpert_mcp_one_time_secret')

    component.copy(component.revealedApiKey()!.secret)

    expect(clipboard.copy).toHaveBeenCalledWith('xpert_mcp_one_time_secret')
  })

  it('normalizes a scalar scope selection before creating an API key', async () => {
    const { component, publicationService } = await setup()
    component.apiKeyForm.controls.name.setValue('Codex')
    component.selectApiKeyScopes('prompts:get')

    await component.createApiKey()

    expect(publicationService.createApiKey).toHaveBeenCalledWith('publication-1', {
      name: 'Codex',
      scopes: ['prompts:get'],
      expiresAt: null
    })
  })

  it('sends token introspection credentials only while rotating the secret', async () => {
    const { component, publicationService } = await setup({ oauthEnabled: true })
    component.oauthForm.setValue({
      issuer: 'https://issuer.example',
      audience: 'xpert-mcp',
      requiredScopes: ['tools:list'],
      subjectClaim: 'sub',
      emailClaim: 'email',
      clientIdClaim: 'azp',
      introspectionEnabled: true,
      introspectionEndpoint: 'https://issuer.example/introspect',
      introspectionClientId: 'resource-server',
      introspectionClientSecret: 'rotate-once',
      enabled: true
    })

    await component.saveOAuthPolicy()

    expect(publicationService.upsertOAuthPolicy).toHaveBeenCalledWith(
      'publication-1',
      expect.objectContaining({
        introspection: {
          enabled: true,
          endpoint: 'https://issuer.example/introspect',
          clientId: 'resource-server',
          clientSecret: 'rotate-once'
        }
      })
    )
    expect(component.oauthForm.controls.introspectionClientSecret.value).toBe('')
  })
})

function readTranslationPath(value: unknown, path: string): unknown {
  let current = value
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = Reflect.get(current, segment)
  }
  return current
}

function publicationSummary(id: string): IMcpPublicationSummary {
  return {
    id,
    name: 'Generic service',
    slug: 'generic-service',
    status: 'draft',
    authMethods: ['api_key'],
    protocolVersion: '2026-07-28',
    reviewStatus: 'current',
    capabilityCount: 0,
    apiKeyCount: 0,
    oauthEnabled: false,
    recentInvocationAt: null,
    recentErrorAt: null
  }
}

function publication(id: string): IMcpPublication & { capabilities: [] } {
  return {
    ...publicationSummary(id),
    capabilities: []
  }
}

function invocationAudit(): IMcpInvocationAudit {
  return {
    id: 'audit-1',
    publicationId: 'publication-1',
    authMethod: 'api_key',
    subjectType: 'user',
    subjectId: 'user-1',
    requestId: 'request-1',
    status: 'failed',
    createdAt: new Date('2026-08-24T06:00:00.000Z')
  }
}

function genericCapability(): IMcpCapabilityCatalog {
  const descriptor: McpCapabilityDescriptor = {
    descriptorVersion: 1,
    capabilityType: 'tool',
    capabilityKey: 'echo',
    title: 'Echo',
    description: 'Echo a value without a provider-specific dependency.',
    source: {
      toolsetId: 'toolset-generic',
      pluginName: '@example/plugin-generic',
      pluginVersion: '1.0.0'
    },
    requiredContext: ['workspace'],
    visibility: ['model'],
    inputSchema: { type: 'object' },
    behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' }
  }
  return {
    id: 'catalog-1',
    toolsetId: 'toolset-generic',
    capabilityType: 'tool',
    capabilityKey: 'echo',
    descriptorHash: 'hash',
    descriptor,
    enabled: true
  }
}
