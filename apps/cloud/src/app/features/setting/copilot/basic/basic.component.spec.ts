import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, IAiProviderEntity, ICopilot } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { CopilotProviderService, CopilotServerService, Store, ToastrService } from '../../../../@core'
import { CopilotBasicComponent } from './basic.component'
import { PluginAPIService } from '../../../../@core/state'

describe('model provider overview', () => {
  const schema = { provider: 'provider', label: { en_US: 'Provider' } } as IAiProviderEntity
  const connection = {
    id: 'connection',
    name: 'Production',
    enabled: true,
    modelProvider: { id: 'provider-id', providerName: 'provider' }
  } as ICopilot
  function setup() {
    const server = {
      refreshAiProviders: jest.fn().mockResolvedValue([schema]),
      getAllInOrg: jest.fn().mockReturnValue(of({ items: [connection] })),
      update: jest.fn().mockReturnValue(of(connection))
    }
    const providers = {
      getModels: jest
        .fn()
        .mockReturnValue(of({ builtin: [{ model: 'chat', model_type: AiModelTypeEnum.LLM }], custom: [] }))
    }
    const dialog = { open: jest.fn().mockReturnValue({ closed: of(undefined) }) }
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        {
          provide: PluginAPIService,
          useValue: {
            getByNames: jest.fn().mockReturnValue(of([])),
            getLatestVersions: jest.fn().mockReturnValue(of([]))
          }
        },
        { provide: CopilotServerService, useValue: server },
        { provide: CopilotProviderService, useValue: providers },
        { provide: Dialog, useValue: dialog },
        { provide: Store, useValue: { selectOrganizationId: () => of('org') } },
        { provide: ToastrService, useValue: {} }
      ]
    })
    return { component: TestBed.runInInjectionContext(() => new CopilotBasicComponent()), server, providers, dialog }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('searches connection names and model IDs within a provider group', async () => {
    const { component } = setup()
    await component.load()
    component.search.set('production')
    expect(component.filtered()).toHaveLength(1)
    component.search.set('CHAT')
    expect(component.filtered()).toHaveLength(1)
    component.search.set('missing')
    expect(component.filtered()).toHaveLength(0)
  })
  it('marks catalog failures as errors without dropping the editable connection', async () => {
    const { component, providers } = setup()
    providers.getModels.mockReturnValue(throwError(() => new Error('Unavailable')))
    await component.load()
    expect(component.count('error')).toBe(1)
    expect(component.connections()).toEqual([connection])
    expect(component.loading()).toBe(false)
  })
  it('ignores late responses from an earlier organization load', async () => {
    const { component, server } = setup()
    const earlier = new Subject<{ items: ICopilot[] }>()
    server.getAllInOrg.mockReturnValueOnce(earlier)
    const pending = component.load()
    server.getAllInOrg.mockReturnValue(of({ items: [] }))
    await component.load()
    earlier.next({ items: [connection] })
    earlier.complete()
    await pending
    expect(component.connections()).toEqual([])
    expect(component.catalogs()).toEqual({})
  })
  it('switches only the viewed connection without persisting a default or enabled state', async () => {
    const { component, server, dialog } = setup()
    await component.load()
    const group = component.groups()[0]
    const other = { ...connection, id: 'test-connection', name: 'Test' }
    group.connections.push(other)
    component.search.set('production')
    component.choose(group, other.id)
    expect(component.active(group)).toBe(other)
    expect(server.update).not.toHaveBeenCalled()
    expect(dialog.open).not.toHaveBeenCalled()
    component.search.set('chat')
    expect(component.active(group)).toBe(connection)
  })
  it('edits the requested row even when another connection is being viewed', async () => {
    const { component, dialog } = setup()
    component.selected.set({ provider: connection.id })
    const other = {
      ...connection,
      id: 'test-connection',
      modelProvider: { ...connection.modelProvider, id: 'test-provider' }
    }
    await component.editConnection(schema, other)
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: { provider: schema, providerId: 'test-provider', copilot: other }
      })
    )
    expect(component.selected()).toEqual({ provider: connection.id })
  })
  it('does not disable a connection when its impact dialog is cancelled', async () => {
    const { component, server, dialog } = setup()
    await component.toggleConnection(connection)
    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: connection }))
    expect(server.update).not.toHaveBeenCalled()
  })
})
