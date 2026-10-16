import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import type { IMcpPublication, McpPublicationConfiguration, McpPublicationConfigurationTab } from '@xpert-ai/contracts'

jest.mock('../../../@core', () => {
  const { inject } = require('@angular/core')
  class McpPublicationService {}
  class ViewExtensionApiService {}
  class ToastrService {}
  return {
    McpPublicationService,
    ViewExtensionApiService,
    ToastrService,
    injectToastr: () => inject(ToastrService),
    getErrorMessage: (error: Error) => error.message
  }
})
import { McpPublicationService, ViewExtensionApiService, ToastrService } from '../../../@core'
import { McpPublicationPluginTabsComponent } from './mcp-publication-plugin-tabs'

const tab: McpPublicationConfigurationTab = {
  toolsetId: 'source-1',
  name: 'Existing connection',
  provider: 'example',
  pluginName: '@example/plugin',
  title: { en_US: 'Configure connection' },
  canEdit: true,
  schema: { type: 'object', properties: { mode: { type: 'string', enum: ['manual', 'platform'] } } }
}
const saved: McpPublicationConfiguration = {
  values: { mode: 'manual', host: 'localhost', enabled: false },
  revision: '2026-10-16T00:00:00.000Z'
}

async function setup(configurations = [tab]) {
  const service = {
    configurationTabs: jest.fn(() => of(configurations)),
    sourceConfiguration: jest.fn(() => of(saved)),
    updateSourceConfiguration: jest.fn(() => of(saved))
  }
  const views = { getSlotViews: jest.fn(() => of([])) }
  await TestBed.configureTestingModule({
    imports: [McpPublicationPluginTabsComponent],
    providers: [
      { provide: McpPublicationService, useValue: service },
      { provide: ViewExtensionApiService, useValue: views },
      { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
    ]
  })
    .overrideComponent(McpPublicationPluginTabsComponent, {
      set: { template: '<ng-template #content />', imports: [] }
    })
    .compileComponents()
  const fixture = TestBed.createComponent(McpPublicationPluginTabsComponent)
  fixture.componentRef.setInput('publication', { id: 'publication-1' } as IMcpPublication)
  fixture.detectChanges()
  await fixture.whenStable()
  return { fixture, component: fixture.componentInstance, service, views }
}

describe('MCP plugin tabs', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('opens and saves the existing source configuration without creating or selecting a provider', async () => {
    const { component, service } = await setup()
    await component.select(component.tabs()[0])
    expect(service.sourceConfiguration).toHaveBeenCalledWith('publication-1', 'source-1')
    expect(component.configuration()).toEqual(saved)
    component.updateValues({ ...saved.values, mode: 'platform', dataSourceId: 'source-id' })
    await component.save()
    expect(service.updateSourceConfiguration).toHaveBeenCalledWith('publication-1', 'source-1', {
      ...saved,
      values: { ...saved.values, mode: 'platform', dataSourceId: 'source-id' }
    })
  })

  it('shows all configuration sources and explicit extension views, including views without config fields', async () => {
    const { component, views } = await setup([tab, { ...tab, toolsetId: 'source-2', pluginName: '@example/second' }])
    views.getSlotViews.mockReturnValue(of([{ key: 'custom:help', title: { en_US: 'Help' } }]))
    await component.loadTabs('publication-1')
    expect(component.tabs().map(({ key }) => key)).toEqual([
      'configuration:source-1',
      'configuration:source-2',
      'view:custom:help'
    ])
    expect(views.getSlotViews).toHaveBeenCalledWith('mcp-publication', 'publication-1', 'detail.main_tabs')
    await component.select(component.tabs()[2])
    expect(component.selectedTab()?.kind).toBe('view')
  })

  it('adds no tab when neither configuration nor explicit views exist', async () => {
    const { component } = await setup([])
    expect(component.tabs()).toEqual([])
  })

  it('ignores an old source response after changing service and clears the selection', async () => {
    const { component, service, fixture } = await setup()
    const pending = new Subject<McpPublicationConfiguration>()
    service.sourceConfiguration.mockReturnValue(pending)
    const selected = component.select(component.tabs()[0])
    fixture.componentRef.setInput('publication', { id: 'publication-2' })
    fixture.detectChanges()
    pending.next(saved)
    pending.complete()
    await selected
    await fixture.whenStable()
    expect(component.configuration()).toBeNull()
    expect(component.selectedKey()).toBeNull()
  })

  it('supports explicit reload after a failed read', async () => {
    const { component, service } = await setup()
    service.sourceConfiguration.mockReturnValueOnce(throwError(() => new Error('unavailable')))
    const selected = component.tabs()[0]
    await component.select(selected)
    expect(component.error()).toBe('unavailable')
    await component.select(selected, true)
    expect(component.configuration()).toEqual(saved)
    expect(component.error()).toBeNull()
  })
})
