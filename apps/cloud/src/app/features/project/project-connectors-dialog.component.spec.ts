import { TestBed } from '@angular/core/testing'
import type { ConnectorBinding, ConnectorStrategyDefinition } from '@xpert-ai/plugin-sdk/connector'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { ToastrService, XpertConnectorService } from '../../@core'
import { XpertProjectConnectorsDialogComponent } from './project-connectors-dialog.component'

const sharedDefinition = {
  provider: 'shared-provider',
  label: { en_US: 'Shared provider' },
  auth: { type: 'oauth2' },
  authorizationModes: ['shared', 'personal']
} satisfies ConnectorStrategyDefinition

const personalBinding = {
  id: 'personal-binding',
  provider: 'shared-provider',
  status: 'active',
  scopeType: 'project',
  scope: { type: 'project', projectId: 'project-1' },
  authorizationMode: 'personal'
} satisfies ConnectorBinding

const sharedBinding = {
  ...personalBinding,
  id: 'shared-binding',
  authorizationMode: 'shared'
} satisfies ConnectorBinding

describe('XpertProjectConnectorsDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('loads definitions and bindings from the selected Project scope', async () => {
    const { component, connectorService } = await createComponent({
      canManage: true,
      definitions: [sharedDefinition],
      bindings: [sharedBinding]
    })

    expect(connectorService.scopedDefinitions).toHaveBeenCalledWith('project', 'project-1')
    expect(connectorService.listBindings).toHaveBeenCalledWith('project', 'project-1')
    expect(component.definitions()).toEqual([sharedDefinition])
    expect(component.bindings()).toEqual([sharedBinding])
    expect(component.availableDefinitions()).toEqual([])
  })

  it('creates a manager-owned binding in the selected Project scope', async () => {
    const { component, connectorService } = await createComponent({
      canManage: true,
      definitions: [sharedDefinition],
      bindings: []
    })

    component.selectProvider(sharedDefinition.provider)
    component.selectMode('personal')
    await component.createBinding()

    expect(connectorService.createBinding).toHaveBeenCalledWith({
      scope: { type: 'project', projectId: 'project-1' },
      provider: sharedDefinition.provider,
      authorizationMode: 'personal'
    })
  })

  it('keeps binding administration manager-only while allowing a member to consent personally', async () => {
    const { component, connectorService } = await createComponent({
      canManage: false,
      definitions: [sharedDefinition],
      bindings: [sharedBinding, personalBinding]
    })

    component.selectProvider(sharedDefinition.provider)
    await component.createBinding()
    await component.deleteBinding(sharedBinding)

    expect(connectorService.createBinding).not.toHaveBeenCalled()
    expect(connectorService.deleteBinding).not.toHaveBeenCalled()
    expect(component.canConnect(sharedBinding)).toBe(false)
    expect(component.canConnect(personalBinding)).toBe(true)

    await component.consent(personalBinding)

    expect(connectorService.consentToBinding).toHaveBeenCalledWith(personalBinding.id)
  })
})

async function createComponent(input: {
  canManage: boolean
  definitions: ConnectorStrategyDefinition[]
  bindings: ConnectorBinding[]
}) {
  const connectorService = {
    scopedDefinitions: jest.fn(() => of(input.definitions)),
    listBindings: jest.fn(() => of(input.bindings)),
    createBinding: jest.fn(() => of(sharedBinding)),
    deleteBinding: jest.fn(() => of(undefined)),
    consentToBinding: jest.fn(() => of(personalBinding)),
    connectBinding: jest.fn(),
    bindingAuthorizationStatus: jest.fn()
  }

  await TestBed.configureTestingModule({
    imports: [XpertProjectConnectorsDialogComponent],
    providers: [
      { provide: XpertConnectorService, useValue: connectorService },
      { provide: ToastrService, useValue: { error: jest.fn() } },
      { provide: ZardDialogRef, useValue: { close: jest.fn() } },
      { provide: Z_MODAL_DATA, useValue: { projectId: 'project-1', canManage: input.canManage } }
    ]
  })
    .overrideComponent(XpertProjectConnectorsDialogComponent, { set: { template: '', imports: [] } })
    .compileComponents()

  const fixture = TestBed.createComponent(XpertProjectConnectorsDialogComponent)
  await fixture.whenStable()

  return { component: fixture.componentInstance, connectorService }
}
