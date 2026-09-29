import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert, TXpertTeamDraft, WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { AssistantBindingService, ToastrService, XpertAPIService } from '../../../@core'
import type { TWorkflowTriggerMeta } from '../../../@core'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'
import { AssistantPersonalizationComponent } from './assistant-personalization.component'
import { AssistantTriggerDialogComponent, AssistantTriggerDialogData } from './assistant-trigger-dialog.component'
import { AssistantTriggersComponent } from './assistant-triggers.component'
import { AssistantTriggerConnectionService } from './assistant-trigger-connection.service'
import { buildEditableXpertDraft } from '../../xpert/draft'
import { buildAssistantTriggerCards, isAssistantTriggerConnected } from './assistant-trigger.utils'

jest.mock('../../../@core', () => ({
  AssistantBindingService: class AssistantBindingService {},
  XpertAPIService: class XpertAPIService {},
  ToastrService: class ToastrService {},
  AssistantBindingScope: { USER: 'user' },
  AssistantCode: { CLAWXPERT: 'clawxpert' },
  genXpertTriggerKey: () => 'new-trigger',
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : '')
}))
jest.mock('../../chat/clawxpert/clawxpert.facade', () => ({ ClawXpertFacade: class ClawXpertFacade {} }))
jest.mock('../../../@shared/forms', () => ({
  JSONSchemaFormComponent: class JSONSchemaFormComponent {},
  ParameterFormComponent: class ParameterFormComponent {}
}))
jest.mock('../../../@shared/avatar', () => ({ IconComponent: class IconComponent {} }))
jest.mock('../../../@shared/workflow', () =>
  jest.requireActual('../../../@shared/workflow/trigger-config/trigger-config.util')
)
jest.mock('@xpert-ai/headless-ui', () => ({
  ZardButtonComponent: class ZardButtonComponent {},
  ZardInputDirective: class ZardInputDirective {},
  ZardIconComponent: class ZardIconComponent {},
  XpI18nPipe: class XpI18nPipe {
    transform(value: { en_US: string }) {
      return value.en_US
    }
  },
  ZardCardImports: []
}))

function provider(name: string): TWorkflowTriggerMeta {
  return {
    name,
    label: { en_US: name },
    icon: { type: 'svg', value: '' },
    configSchema: {
      type: 'object',
      properties: { enabled: { type: 'boolean', default: true }, integrationId: { type: 'string' } },
      required: ['enabled', 'integrationId']
    }
  }
}

function facadeMock() {
  return {
    organizationId: signal('org-1'),
    xpertId: signal('xpert-1'),
    resolvedPreference: signal({ assistantId: 'xpert-1' }),
    currentWorkspaceId: signal('workspace-1'),
    viewState: signal('ready'),
    loading: signal(false),
    savingUserPreference: signal(false),
    savingTriggerDraft: signal(false),
    triggerDraftSource: signal<IXpert | null>(null),
    triggerDraft: signal<TXpertTeamDraft | null>(null),
    triggerDraftErrorMessage: signal<string | null>(null),
    triggerEditorItems: signal<import('../../xpert/draft').XpertDraftTriggerEditorItem[]>([
      { nodeKey: 'other', provider: provider('other'), config: { integrationId: 'keep' } }
    ]),
    saveUserPreference: jest.fn(),
    saveTriggerDraft: jest.fn()
  }
}

async function personalization(
  api = { getPreference: jest.fn(() => of({ soul: '# Existing rules\n', profile: '# User\nKeep this verbatim.' })) }
) {
  const facade = facadeMock()
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), AssistantPersonalizationComponent],
    providers: [
      { provide: ClawXpertFacade, useValue: facade },
      { provide: AssistantBindingService, useValue: api },
      { provide: ToastrService, useValue: { error: jest.fn() } }
    ]
  })
    .overrideComponent(AssistantPersonalizationComponent, { set: { imports: [], template: '' } })
    .compileComponents()
  const fixture = TestBed.createComponent(AssistantPersonalizationComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  return { fixture, component: fixture.componentInstance, facade }
}

async function trigger(
  data: AssistantTriggerDialogData = {
    card: { key: 'wecom', provider: provider('wecom'), available: true },
    organizationId: 'org-1',
    xpertId: 'xpert-1'
  }
) {
  const facade = facadeMock()
  const dialogRef = { close: jest.fn(), disableClose: false }
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), AssistantTriggerDialogComponent],
    providers: [
      { provide: ClawXpertFacade, useValue: facade },
      { provide: DialogRef, useValue: dialogRef },
      { provide: DIALOG_DATA, useValue: data },
      { provide: ToastrService, useValue: { error: jest.fn() } }
    ]
  })
    .overrideComponent(AssistantTriggerDialogComponent, { set: { imports: [], template: '' } })
    .compileComponents()
  const fixture = TestBed.createComponent(AssistantTriggerDialogComponent)
  fixture.detectChanges()
  return { component: fixture.componentInstance, facade, dialogRef }
}

async function triggers(availableProviders = [provider('wecom')]) {
  const facade = facadeMock()
  const closed = new Subject<boolean>()
  const dialogRef = { closed, close: jest.fn(() => closed.next(false)) }
  const dialog = { open: jest.fn(() => dialogRef) }
  const toastr = { error: jest.fn() }
  const api = {
    getTriggerProviders: () => of(availableProviders),
    getTeam: jest.fn(() => of({ id: 'xpert-1' } as IXpert))
  }
  const connections = {
    statuses: jest.fn().mockResolvedValue([]),
    disconnect: jest.fn().mockResolvedValue({ enabled: false, connected: false })
  }
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), AssistantTriggersComponent],
    providers: [
      { provide: ClawXpertFacade, useValue: facade },
      { provide: Dialog, useValue: dialog },
      { provide: XpertAPIService, useValue: api },
      { provide: AssistantTriggerConnectionService, useValue: connections },
      { provide: ToastrService, useValue: toastr }
    ]
  })
    .overrideComponent(AssistantTriggersComponent, { set: { imports: [], template: '' } })
    .compileComponents()
  const fixture = TestBed.createComponent(AssistantTriggersComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  await fixture.componentInstance.refresh()
  return { component: fixture.componentInstance, facade, closed, dialog, toastr, api, connections, fixture }
}

function quickProvider(): TWorkflowTriggerMeta {
  return {
    ...provider('dingtalk'),
    quickConnect: { method: 'qr', integrationProvider: 'dingtalk_long', configField: 'integrationId' }
  }
}

function connectionXpert(enabled: boolean, integrationId: string): IXpert {
  const graph: IXpert['graph'] = {
    nodes: [
      {
        key: 'dingtalk-node',
        type: 'workflow',
        position: { x: 0, y: 0 },
        entity: {
          key: 'dingtalk-node',
          type: WorkflowNodeTypeEnum.TRIGGER,
          from: 'dingtalk',
          config: { enabled, integrationId }
        }
      }
    ],
    connections: []
  }
  return {
    id: 'xpert-1',
    name: 'Assistant',
    type: XpertTypeEnum.Agent,
    graph,
    draft: { ...graph, team: { id: 'xpert-1', title: 'Unpublished title' } }
  }
}

describe('Assistant settings integration', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('discovers new providers, excludes chat and retains unavailable and duplicate draft instances', () => {
    const p = provider('wecom')
    const cards = buildAssistantTriggerCards(
      [provider('chat'), p, provider('new-plugin')],
      [
        { nodeKey: 'a', provider: p },
        { nodeKey: 'b', provider: p },
        { nodeKey: 'c', provider: provider('removed') }
      ]
    )
    expect(cards.map((card) => card.key)).toEqual(['a', 'b', 'c', 'new-plugin'])
    expect(cards[2].available).toBe(false)
  })

  it('saves both documents without rewriting the unchanged Markdown', async () => {
    const { component, facade } = await personalization()
    component.form.controls.soul.setValue('# Updated rules\n\n- Be concise.\n')
    facade.saveUserPreference.mockResolvedValue(component.form.getRawValue())
    await component.save()
    expect(facade.saveUserPreference).toHaveBeenCalledWith({
      soul: '# Updated rules\n\n- Be concise.\n',
      profile: '# User\nKeep this verbatim.'
    })
    expect(component.dirty).toBe(false)
    expect(component.saved()).toBe(true)
  })

  it('keeps unsaved documents after a save failure and restores the server version on reset', async () => {
    const { component, facade } = await personalization()
    component.form.controls.soul.setValue('unsaved')
    facade.saveUserPreference.mockResolvedValue(null)
    await component.save()
    expect(component.form.controls.soul.value).toBe('unsaved')
    expect(component.dirty).toBe(true)
    expect(component.saveError()).toBeTruthy()
    component.reset()
    expect(component.form.controls.soul.value).toBe('# Existing rules\n')
  })

  it('blocks saving after a load failure so existing documents cannot be overwritten with empty values', async () => {
    const { component, facade } = await personalization({
      getPreference: jest.fn(() => throwError(() => new Error('offline')))
    })
    component.form.controls.soul.setValue('new')
    await component.save()
    expect(component.loadError()).toBe('offline')
    expect(facade.saveUserPreference).not.toHaveBeenCalled()
  })

  it('ignores a stale document request after the binding changes', async () => {
    const pending = new Subject<{ soul: string; profile: string }>()
    const { component, facade, fixture } = await personalization({
      getPreference: jest
        .fn()
        .mockReturnValueOnce(pending)
        .mockReturnValue(of({ soul: 'new binding', profile: '' }))
    })
    facade.resolvedPreference.set({ assistantId: 'xpert-2' })
    fixture.detectChanges()
    await fixture.whenStable()
    pending.next({ soul: 'stale', profile: 'stale' })
    pending.complete()
    await Promise.resolve()
    expect(component.form.controls.soul.value).toBe('new binding')
  })

  it('uses schema defaults and prevents saving a trigger with missing required fields', async () => {
    const { component, facade } = await trigger()
    expect(component.config()).toEqual({ enabled: true })
    await component.save()
    expect(facade.saveTriggerDraft).not.toHaveBeenCalled()
  })

  it('adds one trigger while preserving the latest configuration of other triggers', async () => {
    const { component, facade, dialogRef } = await trigger()
    component.config.set({ enabled: false, integrationId: 'integration-1' })
    facade.saveTriggerDraft.mockResolvedValue({ nodes: [] })
    await component.save()
    expect(facade.saveTriggerDraft).toHaveBeenCalledWith([
      expect.objectContaining({ nodeKey: 'other', config: { integrationId: 'keep' } }),
      expect.objectContaining({ nodeKey: 'new-trigger', config: { enabled: true, integrationId: 'integration-1' } })
    ])
    expect(dialogRef.close).toHaveBeenCalledWith(true)
  })

  it('keeps the trigger dialog open and preserves config when saving fails', async () => {
    const { component, facade, dialogRef } = await trigger()
    component.config.set({ enabled: true, integrationId: 'integration-1' })
    facade.saveTriggerDraft.mockResolvedValue(null)
    await component.save()
    expect(dialogRef.close).not.toHaveBeenCalled()
    expect(component.config().integrationId).toBe('integration-1')
    expect(component.error()).toBeTruthy()
    expect(dialogRef.disableClose).toBe(false)
  })

  it('refuses to save after switching organizations', async () => {
    const { component, facade } = await trigger()
    component.config.set({ enabled: true, integrationId: 'integration-1' })
    facade.organizationId.set('org-2')
    await component.save()
    expect(facade.saveTriggerDraft).not.toHaveBeenCalled()
  })

  it('does not overwrite concurrent edits to the same trigger', async () => {
    const p = provider('other')
    const { component, facade } = await trigger({
      card: {
        key: 'other',
        provider: p,
        available: true,
        item: { nodeKey: 'other', provider: p, config: { enabled: true, integrationId: 'original' } }
      },
      organizationId: 'org-1',
      xpertId: 'xpert-1'
    })
    component.config.set({ enabled: true, integrationId: 'my-edit' })
    await component.save()
    expect(facade.saveTriggerDraft).not.toHaveBeenCalled()
    expect(component.error()).toBe('XP.AssistantSettings.TriggerChanged')
  })
  it('shows connecting only while the configuration dialog is open', async () => {
    const { component, closed, dialog } = await triggers()
    const card = component.cards().find((card) => card.key === 'wecom')
    expect(component.actionLabel(card)).toBe('XP.AssistantSettings.Connect')
    await component.toggleConnection(card)
    expect(component.actionLabel(card)).toBe('XP.AssistantSettings.Connecting')
    await component.toggleConnection(card)
    expect(dialog.open).toHaveBeenCalledTimes(1)
    closed.next(false)
    expect(component.actionLabel(card)).toBe('XP.AssistantSettings.Connect')
  })

  it('persists disconnection while retaining settings and returns to connect only on success', async () => {
    const { component, facade } = await triggers()
    const p = provider('wecom')
    facade.triggerEditorItems.set([
      { nodeKey: 'configured', provider: p, config: { enabled: true, integrationId: 'existing' } }
    ])
    const card = component.cards()[0]
    expect(component.actionLabel(card)).toBe('XP.AssistantSettings.Disconnect')
    facade.saveTriggerDraft.mockImplementation(async (items) => {
      facade.triggerEditorItems.set(items)
      return { nodes: [] }
    })
    await component.toggleConnection(card)
    expect(facade.triggerEditorItems()[0].config).toEqual({ enabled: false, integrationId: 'existing' })
    expect(component.actionLabel(component.cards()[0])).toBe('XP.AssistantSettings.Connect')
  })

  it('retains the connected state after a failed disconnect', async () => {
    const { component, facade, toastr } = await triggers()
    facade.triggerEditorItems.set([
      { nodeKey: 'configured', provider: provider('wecom'), config: { enabled: true, integrationId: 'existing' } }
    ])
    facade.saveTriggerDraft.mockResolvedValue(null)
    await component.toggleConnection(component.cards()[0])
    expect(component.actionLabel(component.cards()[0])).toBe('XP.AssistantSettings.Disconnect')
    expect(toastr.error).toHaveBeenCalled()
  })

  it('reconnects a disabled trigger with the same integration and node', async () => {
    const p = provider('wecom')
    const item = { nodeKey: 'disabled', provider: p, config: { enabled: false, integrationId: 'existing' } }
    const { component, facade } = await trigger({
      card: { key: 'disabled', provider: p, item, available: true },
      organizationId: 'org-1',
      xpertId: 'xpert-1'
    })
    facade.triggerEditorItems.set([item])
    expect(component.config()).toEqual({ enabled: true, integrationId: 'existing' })
    expect(component.dirty()).toBe(true)
    facade.saveTriggerDraft.mockResolvedValue({ nodes: [] })
    await component.save()
    expect(facade.saveTriggerDraft).toHaveBeenCalledWith([
      expect.objectContaining({ nodeKey: 'disabled', config: { enabled: true, integrationId: 'existing' } })
    ])
  })

  it('does not classify an incomplete saved draft as connected', () => {
    const p = provider('wecom')
    expect(
      isAssistantTriggerConnected({
        key: 'a',
        provider: p,
        available: true,
        item: { nodeKey: 'a', provider: p, config: { enabled: true } }
      })
    ).toBe(false)
  })

  it('refreshes the shared workspace draft after QR connection succeeds', async () => {
    const { component, facade, closed, api } = await triggers([quickProvider()])
    const previous = connectionXpert(false, 'old-integration')
    facade.triggerDraftSource.set(previous)
    facade.triggerDraft.set(buildEditableXpertDraft(previous))
    const saved = connectionXpert(true, 'authorized-integration')
    api.getTeam.mockReturnValue(of(saved))
    component.configure(component.cards().find((card) => card.provider.name === 'dingtalk'))
    const refresh = jest.spyOn(component, 'refresh')
    closed.next(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    await refresh.mock.results[0].value
    expect(facade.triggerDraft()?.nodes).toEqual(saved.draft.nodes)
    expect(facade.triggerDraft()?.team.title).toBe('Unpublished title')
    expect(facade.triggerDraftSource()?.graph).toEqual(saved.graph)
    expect(facade.saveTriggerDraft).not.toHaveBeenCalled()
  })

  it('refreshes the workspace draft after immediate disconnection', async () => {
    const { component, facade, api, connections } = await triggers([quickProvider()])
    const previous = connectionXpert(true, 'existing-integration')
    facade.triggerDraftSource.set(previous)
    facade.triggerDraft.set(buildEditableXpertDraft(previous))
    component.connectionStatuses.set([{ provider: 'dingtalk', enabled: true, connected: true, state: 'connected' }])
    const saved = connectionXpert(false, 'existing-integration')
    api.getTeam.mockReturnValue(of(saved))
    await component.toggleConnection(component.cards().find((card) => card.provider.name === 'dingtalk'))
    expect(connections.disconnect).toHaveBeenCalledWith('xpert-1', 'dingtalk')
    expect(facade.triggerDraft()?.nodes).toEqual(saved.draft.nodes)
    expect(facade.triggerDraftSource()?.draft).toEqual(saved.draft)
    expect(facade.saveTriggerDraft).not.toHaveBeenCalled()
  })

  it('uses the latest published graph when no persisted draft exists', async () => {
    const { component, facade, api } = await triggers([quickProvider()])
    const previous = connectionXpert(true, 'existing-integration')
    facade.triggerDraftSource.set(previous)
    facade.triggerDraft.set(buildEditableXpertDraft(previous))
    const saved = { ...connectionXpert(false, 'existing-integration'), draft: null }
    api.getTeam.mockReturnValue(of(saved))
    await component.refresh()
    expect(facade.triggerDraftSource()?.draft).toBeNull()
    expect(facade.triggerDraft()?.nodes).toEqual(saved.graph.nodes)
  })

  it('updates the shared draft when navigating away while the refresh is pending', async () => {
    const { component, facade, api } = await triggers([quickProvider()])
    const previous = connectionXpert(true, 'existing-integration')
    facade.triggerDraftSource.set(previous)
    facade.triggerDraft.set(buildEditableXpertDraft(previous))
    const pending = new Subject<IXpert>()
    api.getTeam.mockReturnValue(pending)
    const refresh = component.refresh()
    await Promise.resolve()
    component.ngOnDestroy()
    const saved = connectionXpert(false, 'existing-integration')
    pending.next(saved)
    await refresh
    expect(facade.triggerDraft()?.nodes).toEqual(saved.draft.nodes)
  })

  it('ignores a draft response after switching organizations', async () => {
    const { component, facade, api } = await triggers([quickProvider()])
    const previous = connectionXpert(true, 'existing-integration')
    facade.triggerDraftSource.set(previous)
    facade.triggerDraft.set(buildEditableXpertDraft(previous))
    const pending = new Subject<IXpert>()
    api.getTeam.mockReturnValue(pending)
    const refresh = component.refresh()
    await Promise.resolve()
    facade.organizationId.set('org-2')
    pending.next(connectionXpert(false, 'existing-integration'))
    await refresh
    expect(facade.triggerDraftSource()).toBe(previous)
  })
})
