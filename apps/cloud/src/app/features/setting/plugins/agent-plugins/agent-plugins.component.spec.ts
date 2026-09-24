import { ComponentFixture, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TranslateModule } from '@ngx-translate/core'
import { AgentPluginsComponent } from './agent-plugins.component'
import { BindingSummary, PackageSummary } from './agent-plugins.model'

const mockScope = signal('organization-one')
jest.mock('@cloud/app/@core/state', () => ({ injectActiveScope: () => mockScope }))
jest.mock('@cloud/app/@core', () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
  injectToastr: () => ({ error: jest.fn() })
}))

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

describe('AgentPluginsComponent publishing', () => {
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
    mockScope.set('organization-one')
    TestBed.configureTestingModule({
      imports: [AgentPluginsComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    fixture = TestBed.createComponent(AgentPluginsComponent)
    component = fixture.componentInstance
    http = TestBed.inject(HttpTestingController)
    fixture.detectChanges()
    flushCatalog()
    await fixture.whenStable()
  })
  afterEach(() => {
    http.verify()
    TestBed.resetTestingModule()
  })

  it('loads the current binding and keeps scope and title while choosing another imported version', () => {
    component.openGroup(component.groups()[0])
    expect(component.selectedPackageId()).toBe('old')
    expect(component.workspaceIds()).toEqual(['workspace'])
    component.selectVersion('new')
    expect(component.replacesBindingId()).toBe('binding')
    expect(component.workspaceIds()).toEqual(['workspace'])
    expect(component.binding.controls.title.value).toBe('Documents')
    http.expectNone((request) => request.method === 'POST')
  })
  it('publishes only an agent_plugin binding and explicitly replaces the chosen configuration', async () => {
    component.openGroup(component.groups()[0])
    component.selectVersion('new')
    component.toggleWorkspace('second')
    const pending = component.publish()
    const request = http.expectOne((request) => request.method === 'POST')
    expect(request.request.body).toEqual({
      replacesBindingId: 'binding',
      title: 'Documents',
      description: '',
      workspaceIds: ['workspace', 'second'],
      definition: { kind: 'agent_plugin', packageId: 'new', experts: {} }
    })
    request.flush({
      ...currentBinding,
      id: 'replacement',
      definition: { kind: 'agent_plugin', packageId: 'new', experts: {} }
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
    expect(component.workspaceIds()).toEqual([])
    expect(component.selectedPackageId()).toBe('new')
  })
  it('blocks publishing when existing workspace access is no longer manageable', () => {
    component.openGroup(component.groups()[0])
    component.options.set({ ...options, workspaces: [] })
    component.publish()
    expect(component.unavailableWorkspaceCount()).toBe(1)
    http.expectNone((request) => request.method === 'POST')
  })
  it('ignores an earlier scope response when the active organization changes', async () => {
    const pending = component.refresh()
    const staleData = http.expectOne((request) => request.url.endsWith('/agent-plugins'))
    const staleOptions = http.expectOne((request) => request.url.endsWith('/agent-plugins/options'))
    mockScope.set('organization-two')
    fixture.detectChanges()
    http.expectOne((request) => request.url.endsWith('/agent-plugins')).flush({ packages: [], bindings: [] })
    http.expectOne((request) => request.url.endsWith('/agent-plugins/options')).flush({ workspaces: [], experts: [] })
    staleData.flush({ packages: [oldPackage], bindings: [currentBinding] })
    staleOptions.flush(options)
    await pending
    expect(component.packages()).toEqual([])
    expect(component.selectedName()).toBe('')
  })
})
