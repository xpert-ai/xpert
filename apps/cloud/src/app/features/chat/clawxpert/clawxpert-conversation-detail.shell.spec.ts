import './clawxpert-conversation-detail.test-setup'
import { TestBed } from '@angular/core/testing'
import { of, Subject } from 'rxjs'
import { XpertWorkbenchInitialLayoutEnum, type XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import {
  buildFixedViewManifest,
  configureConversationDetailTests,
  getRuntimeInput,
  settle
} from './clawxpert-conversation-detail.test-setup'
import {
  getClawXpertChatkitPetStorageKey,
  getClawXpertWorkbenchLayoutStorageKey
} from './clawxpert-workbench-layout-storage.service'

const remoteView: XpertExtensionViewManifest['view'] = {
  type: 'remote_component',
  runtime: 'react',
  protocolVersion: 1,
  component: { isolation: 'iframe', entry: 'test-view' },
  dataSource: { mode: 'platform' }
}

describe('ChatKit-only conversation shell', () => {
  const setup = configureConversationDetailTests()

  it.each(Object.values(XpertWorkbenchInitialLayoutEnum))(
    'fills the page despite the configured %s layout and saved maximized/pet preferences',
    async (layout) => {
      const { facade } = setup()
      facade.initialLayout.set(layout)
      localStorage.setItem(getClawXpertWorkbenchLayoutStorageKey('user-1', 'assistant-1'), 'maximized')
      localStorage.setItem(getClawXpertChatkitPetStorageKey('user-1', 'assistant-1'), 'true')
      const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
      await settle(fixture)
      const root: HTMLElement = fixture.nativeElement
      expect(root.querySelectorAll('xpert-chatkit')).toHaveLength(1)
      expect(root.querySelectorAll('section')).toHaveLength(1)
      expect(root.querySelector('[data-workbench-chat-shell]')?.classList).toContain('w-full')
      expect(root.querySelector('[data-workbench-chat-shell]')?.getAttribute('aria-hidden')).toBeNull()
      expect(
        root.querySelector('[data-chatkit-resize-handle], [data-show-workbench-panel], [data-chat-sidebar-backdrop]')
      ).toBeNull()
      expect(getRuntimeInput().displayMode).toBe('chat')
      expect(getRuntimeInput().workbench?.()).toMatchObject({ enabled: true, sideChat: { enabled: true } })
    }
  )

  it('keeps one ChatKit element through loading, route and Project changes', async () => {
    const { facade } = setup()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const frame = fixture.nativeElement.querySelector('xpert-chatkit')
    facade.loading.set(true)
    await settle(fixture)
    expect(frame.hasAttribute('inert')).toBe(true)
    expect(fixture.nativeElement.querySelector('xp-workbench-loading-indicator')).not.toBeNull()
    facade.projectId.set('project-b')
    facade.threadId.set('thread-b')
    facade.loading.set(false)
    await settle(fixture)
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBe(frame)
    expect(frame.hasAttribute('inert')).toBe(false)
    expect(fixture.nativeElement.querySelector('xp-workbench-loading-indicator')).toBeNull()
  })

  it('restores supported View selection after refresh and history changes without an outer panel', async () => {
    const { facade, viewExtensionApi, workbenchViewUrlState: url } = setup()
    const embedded = buildFixedViewManifest('embedded', { view: remoteView })
    viewExtensionApi.getSlotViews.mockReturnValue(of([embedded, buildFixedViewManifest('legacy')]))
    facade.defaultViewKey.set(embedded.key)
    url.viewKey.set(embedded.key)
    url.viewQuery.set({ selectionId: 'record-a' })
    let fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const frame = fixture.nativeElement.querySelector('xpert-chatkit')
    expect(getRuntimeInput().workbench?.().navigation?.view).toEqual({ viewKey: 'embedded', selectionId: 'record-a' })
    await expect(fixture.componentInstance.openWorkbenchView({ viewKey: 'legacy' })).rejects.toThrow('not available')
    url.viewQuery.set({ selectionId: 'record-b' })
    await settle(fixture)
    expect(getRuntimeInput().workbench?.().navigation?.view?.selectionId).toBe('record-b')
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBe(frame)
    fixture.destroy()
    fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    expect(getRuntimeInput().workbench?.().navigation?.view?.selectionId).toBe('record-b')
    expect(fixture.nativeElement.querySelectorAll('section')).toHaveLength(1)
  })

  it('authorizes a legacy Project deep link before selecting its embedded destination', async () => {
    const { facade, viewExtensionApi, workbenchViewUrlState: url } = setup()
    viewExtensionApi.getSlotViews.mockReturnValue(of([buildFixedViewManifest('embedded', { view: remoteView })]))
    url.projectId.set('project-b')
    url.viewKey.set('embedded')
    url.viewQuery.set({ selectionId: 'record-b' })
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    expect(viewExtensionApi.getSlotViews).toHaveBeenCalledWith('agent', 'assistant-1', 'agent.workbench', {
      runtimeScope: { projectId: 'project-b' }
    })
    expect(facade.onChatProjectChange).toHaveBeenCalledWith('project-b', {
      viewKey: 'embedded',
      selectionId: 'record-b'
    })
  })

  it('never restores a previous Project manifest after its delayed discovery completes', async () => {
    const { facade, viewExtensionApi } = setup()
    const oldViews = new Subject<XpertExtensionViewManifest[]>()
    facade.projectId.set('project-a')
    viewExtensionApi.getSlotViews.mockReturnValue(oldViews)
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    viewExtensionApi.getSlotViews.mockReturnValue(of([buildFixedViewManifest('current', { view: remoteView })]))
    facade.projectId.set('project-b')
    await settle(fixture)
    oldViews.next([buildFixedViewManifest('stale', { view: remoteView })])
    await settle(fixture)
    expect(fixture.componentInstance.availableWorkbenchViews().map((view) => view.viewKey)).toEqual(['current'])
  })
})
