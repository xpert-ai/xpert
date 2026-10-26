import { of } from 'rxjs'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { AgentPluginsComponent } from './agent-plugins.component'
import { BindingSummary, PackageSummary } from './agent-plugins.model'

const mockScope = signal({ level: 'organization', organizationId: 'organization-one' })
const mockRoute = { queryParamMap: of(convertToParamMap({})), snapshot: { queryParamMap: convertToParamMap({}) } }
jest.mock('@cloud/app/@core/state', () => ({ injectActiveScope: () => mockScope }))
jest.mock('@cloud/app/@core', () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
  injectToastr: () => ({ error: jest.fn() })
}))

const settle = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}
const idleImport = {
  operationId: null,
  phase: 'idle',
  commit: null,
  total: 0,
  currentId: null,
  items: [],
  updatedAt: new Date().toISOString()
}
const importing = {
  ...idleImport,
  operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  phase: 'importing',
  commit: 'official',
  total: 110
}

const pkg = (id: string, version: string): PackageSummary => ({
  id,
  digest: id.padEnd(64, '0'),
  descriptor: { name: 'documents', version, diagnostics: [], skills: [], servers: [] }
})
const oldPackage = pkg('old', '1.0.0')
const newPackage = pkg('new', '2.0.0')
const currentBinding: BindingSummary = {
  id: 'binding',
  title: 'Documents',
  version: 'version-token',
  enabled: true,
  workspaceIds: ['workspace'],
  definition: { kind: 'agent_plugin', packageId: 'old', experts: {} }
}

describe('AgentPluginsComponent installation configuration', () => {
  let fixture: ComponentFixture<AgentPluginsComponent>
  let component: AgentPluginsComponent
  let http: HttpTestingController
  const options = {
    workspaces: [
      { id: 'workspace', name: 'Workspace' },
      { id: 'second', name: 'Second' }
    ],
    experts: []
  }
  const flushCatalog = () => {
    http
      .expectOne((request) => request.url.endsWith('/agent-plugins'))
      .flush({ packages: [newPackage, oldPackage], bindings: [currentBinding] })
    http.expectOne((request) => request.url.endsWith('/agent-plugins/options')).flush(options)
  }
  beforeEach(async () => {
    mockScope.set({ level: 'organization', organizationId: 'organization-one' })
    mockRoute.snapshot.queryParamMap = convertToParamMap({})
    TestBed.configureTestingModule({
      imports: [AgentPluginsComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: mockRoute }]
    })
    fixture = TestBed.createComponent(AgentPluginsComponent)
    component = fixture.componentInstance
    http = TestBed.inject(HttpTestingController)
    fixture.detectChanges()
    flushCatalog()
    http.expectOne((request) => request.url.endsWith('/agent-plugins/defaults')).flush(idleImport)
    http.expectOne((request) => request.url.endsWith('/agent-plugins/updates')).flush({ phase: 'idle' })
    await fixture.whenStable()
  })
  afterEach(() => {
    http.verify()
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })

  it('loads the current binding and keeps scope and title while choosing another imported version', () => {
    component.openGroup(component.groups()[0])
    expect(component.selectedPackageId()).toBe('old')
    component.selectVersion('new')
    expect(component.replacesBindingId()).toBe('binding')
    expect(component.binding.controls.title.value).toBe('Documents')
    http.expectNone((request) => request.method === 'POST')
  })
  it('saves scope configuration without selecting workspaces and preserves the chosen replacement', async () => {
    component.openGroup(component.groups()[0])
    component.selectVersion('new')
    const pending = component.saveConfiguration()
    const request = http.expectOne((request) => request.method === 'POST')
    expect(request.request.body).toEqual({
      replacesBindingId: 'binding',
      title: 'Documents',
      description: '',
      workspaceIds: [],
      definition: { kind: 'agent_plugin', availability: 'scope', packageId: 'new', experts: {} }
    })
    request.flush({
      ...currentBinding,
      id: 'replacement',
      definition: { kind: 'agent_plugin', availability: 'scope', packageId: 'new', experts: {} }
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    flushCatalog()
    await pending
    expect(component.notice()).toBe(true)
  })

  it('opens an imported plugin while the import request is still busy', async () => {
    component.git.setValue({ url: 'https://github.com/team/plugin', ref: 'v2.0.0', subdirectory: '.' })
    const pending = component.importGit()
    http.expectOne((request) => request.url.endsWith('/agent-plugins/git')).flush(newPackage)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(component.selectedName()).toBe('documents')
    expect(component.selectedPackageId()).toBe('new')
    expect(component.detailTab()).toBe('overview')
    expect(component.replacesBindingId()).toBe('binding')
    flushCatalog()
    await pending
  })

  it('starts an independent configuration only when explicitly requested', () => {
    component.openGroup(component.groups()[0])
    component.loadBinding()
    expect(component.replacesBindingId()).toBe('')
    expect(component.selectedPackageId()).toBe('new')
  })
  it('does not render workspace publication or addition controls', () => {
    component.openGroup(component.groups()[0])
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('XP.AgentPlugins.SelectWorkspaces')
    expect(fixture.nativeElement.textContent).toContain('XP.AgentPlugins.SaveConfiguration')
  })
  it('ignores an earlier scope response when the active organization changes', async () => {
    const pending = component.refresh()
    const staleData = http.expectOne((request) => request.url.endsWith('/agent-plugins'))
    const staleOptions = http.expectOne((request) => request.url.endsWith('/agent-plugins/options'))
    mockScope.set({ level: 'organization', organizationId: 'organization-two' })
    fixture.detectChanges()
    http.expectOne((request) => request.url.endsWith('/agent-plugins')).flush({ packages: [], bindings: [] })
    http.expectOne((request) => request.url.endsWith('/agent-plugins/options')).flush({ workspaces: [], experts: [] })
    http
      .expectOne((request) => request.url.endsWith('/agent-plugins/defaults') && request.method === 'GET')
      .flush(idleImport)
    http.expectOne((request) => request.url.endsWith('/agent-plugins/updates')).flush({ phase: 'idle' })
    staleData.flush({ packages: [oldPackage], bindings: [currentBinding] })
    staleOptions.flush(options)
    await pending
    expect(component.packages()).toEqual([])
    expect(component.selectedName()).toBe('')
  })
  it('opens a Desktop package without publishing or changing existing workspace selections', async () => {
    mockRoute.snapshot.queryParamMap = convertToParamMap({
      organizationId: 'organization-one',
      workspaceId: 'second',
      packageId: 'new'
    })
    const refresh = component.refresh()
    flushCatalog()
    await refresh
    expect(component.selectedName()).toBe('documents')
    http.expectNone((request) => request.method !== 'GET')
  })

  it('does not apply a Desktop target from another organization', async () => {
    mockRoute.snapshot.queryParamMap = convertToParamMap({
      organizationId: 'other',
      workspaceId: 'workspace',
      packageId: 'old'
    })
    const refresh = component.refresh()
    flushCatalog()
    await refresh
    expect(component.desktopScopeMismatch()).toBe(true)
    expect(component.selectedName()).toBe('')
    http.expectNone((request) => request.method !== 'GET')
  })
  it('imports defaults with one button request and shows partial results without publishing', async () => {
    const pending = component.importDefaults()
    expect(component.importingDefaults()).toBe(true)
    const request = http.expectOne((request) => request.url.endsWith('/agent-plugins/defaults'))
    expect(request.request.body).toEqual({})
    const result = {
      commit: 'official',
      items: [
        { id: 'documents', status: 'imported' },
        { id: 'pdf', status: 'failed', error: 'Invalid package' }
      ]
    }
    request.flush({ ...importing, ...result, phase: 'completed' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    flushCatalog()
    await pending
    expect(component.defaultImportResult()).toEqual(result)
    expect(component.importingDefaults()).toBe(false)
    http.expectNone((request) => request.url.endsWith('/bindings') && request.method === 'POST')
  })
  it('discards a completed default import response after switching organizations', async () => {
    const pending = component.importDefaults()
    const request = http.expectOne((request) => request.url.endsWith('/agent-plugins/defaults'))
    mockScope.set({ level: 'organization', organizationId: 'organization-two' })
    fixture.detectChanges()
    http.expectOne((request) => request.url.endsWith('/agent-plugins')).flush({ packages: [], bindings: [] })
    http.expectOne((request) => request.url.endsWith('/agent-plugins/options')).flush({ workspaces: [], experts: [] })
    http
      .expectOne((request) => request.url.endsWith('/agent-plugins/defaults') && request.method === 'GET')
      .flush(idleImport)
    http.expectOne((request) => request.url.endsWith('/agent-plugins/updates')).flush({ phase: 'idle' })
    request.flush({ ...importing, commit: 'other-org' })
    await pending
    expect(component.defaultImportResult()).toBeNull()
    expect(component.packages()).toEqual([])
    expect(component.importingDefaults()).toBe(false)
  })
  it('polls the same receipt, preserves partial progress and recovers a transient gateway failure', async () => {
    jest.useFakeTimers()
    let finished = false
    void component.importDefaults().then(() => {
      finished = true
    })
    http.expectOne((request) => request.url.endsWith('/defaults')).flush(importing)
    await settle()
    expect(component.defaultImportProgress().total).toBe(110)
    expect(finished).toBe(false)
    await jest.advanceTimersByTimeAsync(2000)
    const retry = http.expectOne((request) => request.url.endsWith('/defaults'))
    expect(retry.request.body).toEqual({ operationId: importing.operationId })
    retry.flush('Timeout', { status: 504, statusText: 'Gateway Timeout' })
    await settle()
    expect(component.defaultImportDisconnected()).toBe(true)
    expect(component.importingDefaults()).toBe(true)
    await jest.advanceTimersByTimeAsync(2000)
    const items = [{ id: 'documents', status: 'imported' }]
    http.expectOne((request) => request.url.endsWith('/defaults')).flush({ ...importing, items })
    await settle()
    expect(component.defaultImportProgress().items).toEqual(items)
    expect(component.defaultImportDisconnected()).toBe(false)
    await jest.advanceTimersByTimeAsync(2000)
    http.expectOne((request) => request.url.endsWith('/defaults')).flush({ ...importing, phase: 'completed', items })
    await settle()
    flushCatalog()
    await settle()
    expect(finished).toBe(true)
    expect(component.importingDefaults()).toBe(false)
    await jest.advanceTimersByTimeAsync(4000)
    http.expectNone((request) => request.url.endsWith('/defaults'))
  })

  it('restores a running import after navigation and stops polling on destruction', async () => {
    jest.useFakeTimers()
    mockScope.set({ level: 'organization', organizationId: 'organization-two' })
    fixture.detectChanges()
    flushCatalog()
    http.expectOne((request) => request.url.endsWith('/agent-plugins/updates')).flush({ phase: 'idle' })
    http.expectOne((request) => request.url.endsWith('/defaults')).flush(importing)
    await settle()
    expect(component.importingDefaults()).toBe(true)
    await jest.advanceTimersByTimeAsync(2000)
    const resumed = http.expectOne((request) => request.url.endsWith('/defaults'))
    expect(resumed.request.body).toEqual({ operationId: importing.operationId })
    resumed.flush(importing)
    await settle()
    fixture.destroy()
    await settle()
    await jest.advanceTimersByTimeAsync(4000)
    http.expectNone((request) => request.url.endsWith('/defaults'))
  })

  it('does not submit duplicate imports and displays a failed receipt', async () => {
    jest.useFakeTimers()
    void component.importDefaults()
    void component.importDefaults()
    const request = http.expectOne((request) => request.url.endsWith('/defaults'))
    request.flush({ ...importing, phase: 'failed', error: 'Repository unavailable' })
    await settle()
    flushCatalog()
    await settle()
    expect(component.defaultImportError()).toBe('Repository unavailable')
    expect(component.busy()).toBe(false)
    await jest.advanceTimersByTimeAsync(4000)
    http.expectNone((request) => request.url.endsWith('/defaults'))
  })

  it('ignores an in-flight progress response after switching organizations', async () => {
    jest.useFakeTimers()
    const pending = component.importDefaults()
    http.expectOne((request) => request.url.endsWith('/defaults')).flush(importing)
    await settle()
    await jest.advanceTimersByTimeAsync(2000)
    const previousScope = http.expectOne((request) => request.url.endsWith('/defaults'))
    mockScope.set({ level: 'organization', organizationId: 'organization-two' })
    fixture.detectChanges()
    flushCatalog()
    http.expectOne((request) => request.url.endsWith('/agent-plugins/updates')).flush({ phase: 'idle' })
    http.expectOne((request) => request.url.endsWith('/defaults')).flush(idleImport)
    await settle()
    previousScope.flush({ ...importing, items: [{ id: 'private-plugin', status: 'imported' }] })
    await pending
    expect(component.defaultImportProgress()).toEqual(idleImport)
    expect(component.defaultImportResult()).toBeNull()
    expect(component.busy()).toBe(false)
    await jest.advanceTimersByTimeAsync(4000)
    http.expectNone((request) => request.url.endsWith('/defaults'))
  })
  it('previews cleanup without deleting and submits only unused version identities', async () => {
    component.openGroup(component.groups()[0])
    const preview = component.previewCleanup()
    const items = [
      { packageId: 'new', version: '2', reason: 'current' },
      { packageId: 'old', version: '1', reason: 'configured' },
      { packageId: 'unused', version: '0', reason: 'unreferenced' }
    ]
    http
      .expectOne((request) => request.url.endsWith('/packages/old/cleanup'))
      .flush({ targetPackageId: 'new', items, deleted: [], pendingFileCleanup: 0 })
    await settle()
    flushCatalog()
    await preview
    http.expectNone((request) => request.method === 'POST')
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('XP.AgentPlugins.Cleanup_configured')
    const pending = component.cleanupOldVersions()
    const request = http.expectOne((request) => request.url.endsWith('/packages/new/cleanup'))
    expect(request.request.body).toEqual({ packageIds: ['unused'] })
    request.flush({
      targetPackageId: 'new',
      items: items.map((item) => ({ ...item, reason: item.packageId === 'unused' ? 'referenced' : item.reason })),
      deleted: [],
      pendingFileCleanup: 0
    })
    await settle()
    flushCatalog()
    await pending
    expect(component.cleanupCandidates()).toEqual([])
  })
  it('polls one background update and never rewrites existing configuration', async () => {
    jest.useFakeTimers()
    component.packages.set([
      { ...oldPackage, source: { kind: 'git', ref: 'main', url: 'https://example.test/plugin' } }
    ])
    component.openGroup(component.groups()[0])
    const receipt = {
      phase: 'updating',
      packageId: 'old',
      operationId: importing.operationId,
      branch: 'main',
      commit: null
    }
    const pending = component.updatePlugin()
    http.expectOne((request) => request.url.endsWith('/packages/old/update')).flush(receipt)
    await settle()
    expect(component.updating()).toBe(true)
    await component.updatePlugin()
    http.expectNone((request) => request.method === 'POST')
    await jest.advanceTimersByTimeAsync(2000)
    const poll = http.expectOne((request) => request.url.endsWith('/packages/old/update'))
    expect(poll.request.body).toEqual({ operationId: receipt.operationId })
    poll.flush({ ...receipt, phase: 'completed', result: { packageId: 'new', status: 'imported' } })
    await settle()
    flushCatalog()
    await pending
    expect(component.selectedPackageId()).toBe('new')
    expect(component.bindings()).toEqual([currentBinding])
    http.expectNone((request) => request.url.endsWith('/bindings'))
  })
  it('ignores an update response from a previous organization', async () => {
    component.packages.set([
      { ...oldPackage, source: { kind: 'git', ref: 'main', url: 'https://example.test/plugin' } }
    ])
    component.openGroup(component.groups()[0])
    const pending = component.updatePlugin()
    const request = http.expectOne((request) => request.url.endsWith('/packages/old/update'))
    mockScope.set({ level: 'organization', organizationId: 'organization-two' })
    fixture.detectChanges()
    flushCatalog()
    http.expectOne((request) => request.url.endsWith('/defaults')).flush(idleImport)
    http.expectOne((request) => request.url.endsWith('/updates')).flush({ phase: 'idle' })
    request.flush({ phase: 'completed', result: { packageId: 'private-old-scope', status: 'imported' } })
    await pending
    expect(component.updateProgress()).toBeNull()
    expect(component.selectedPackageId()).toBe('')
    expect(component.updating()).toBe(false)
  })
  it('offers ZIP reupload instead of a Git update for ZIP packages', () => {
    component.packages.set([{ ...oldPackage, source: { kind: 'zip' } }])
    component.openGroup(component.groups()[0])
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('XP.AgentPlugins.ZipUpdateHint')
    expect(fixture.nativeElement.textContent).not.toContain('XP.AgentPlugins.UpdateLatest')
  })
})
