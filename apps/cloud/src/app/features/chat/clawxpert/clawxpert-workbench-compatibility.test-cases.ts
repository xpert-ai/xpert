import type { WritableSignal } from '@angular/core'
import type { ComponentFixture } from '@angular/core/testing'
import { TestBed } from '@angular/core/testing'
import type { ChatKitWorkbenchOptions } from '@xpert-ai/chatkit-types'
import {
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type XpertExtensionViewManifest,
  type XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import type { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'

const remoteView: XpertExtensionViewManifest['view'] = {
  type: 'remote_component',
  runtime: 'react',
  protocolVersion: 1,
  component: { isolation: 'iframe', entry: 'test-view' },
  dataSource: { mode: 'platform' }
}

type Harness = {
  manifests: (views: XpertExtensionViewManifest[]) => void
  manifest: (key: string, overrides?: Partial<XpertExtensionViewManifest>) => XpertExtensionViewManifest
  projectId: WritableSignal<string | null>
  defaultViewKey: WritableSignal<string | null>
  viewKey: WritableSignal<string | null>
  viewQuery: WritableSignal<XpertViewQuery | null>
  workbench: () => ChatKitWorkbenchOptions | undefined
  selectProject: jest.Mock
  create: () => ComponentFixture<ClawXpertConversationDetailComponent>
  settle: (fixture: ComponentFixture<ClawXpertConversationDetailComponent>) => Promise<void>
}

/** Run with the component suite's actual host wiring and existing service fixtures. */
export function registerWorkbenchCompatibilityTests(setup: () => Harness) {
  describe('ChatKit-first navigation with legacy host compatibility', () => {
    it('retains outer menus and tabs while routing every supported Remote View to ChatKit', async () => {
      const h = setup()
      const embedded = h.manifest('embedded-plugin', { view: remoteView })
      // Placement depends on renderer support, never a plugin name or added setting.
      const legacy = h.manifest('bid.studio')
      h.manifests([embedded, legacy])
      h.defaultViewKey.set(embedded.key)
      h.viewKey.set(embedded.key)
      h.viewQuery.set({ selectionId: 'case-a' })
      const fixture = h.create()
      await h.settle(fixture)
      const component = fixture.componentInstance
      expect(h.workbench()?.navigation?.view).toEqual({ viewKey: embedded.key, selectionId: 'case-a' })
      expect(component.fixedViewTabs().map((tab) => tab.viewKey)).toEqual([legacy.key])
      expect(component.fixedViewMenuItems().map((item) => item.viewKey)).toEqual([legacy.key])
      expect(component.showDetailPanel()).toBe(false)
      const outerTabId = component.fixedViewTabs()[0].id

      component.openWorkbenchView({ viewKey: legacy.key, selectionId: 'outer-document' })
      await h.settle(fixture)
      expect(component.activeFixedViewTab()?.viewKey).toBe(legacy.key)
      expect(component.showDetailPanel()).toBe(true)
      expect(h.workbench()?.navigation?.view).toBeNull()
      await h.workbench()?.onNavigationChange?.({ projectId: null, view: null })
      expect(h.viewKey()).toBe(legacy.key)
      expect(h.viewQuery()).toEqual({ selectionId: 'outer-document' })

      await component.openWorkbenchView({ viewKey: embedded.key, selectionId: 'case-b' })
      await h.settle(fixture)
      expect(component.showDetailPanel()).toBe(false)
      expect(component.fixedViewTabs().map((tab) => tab.id)).toEqual([outerTabId])
      expect(h.workbench()?.navigation?.view).toEqual({ viewKey: embedded.key, selectionId: 'case-b' })
    })

    it('opens and closes native outer tools without erasing the embedded View location', async () => {
      const h = setup()
      const embedded = h.manifest('bid.studio', { view: remoteView })
      h.manifests([embedded])
      h.viewKey.set(embedded.key)
      h.viewQuery.set({ selectionId: 'bid-a', parameters: { section: 'authoring' } })
      const fixture = h.create()
      await h.settle(fixture)
      const component = fixture.componentInstance
      const browser = component.addBrowserTab()
      await h.settle(fixture)
      expect(component.showDetailPanel()).toBe(true)
      expect(h.viewKey()).toBe(embedded.key)
      expect(h.viewQuery()?.selectionId).toBe('bid-a')
      component.closeWorkspaceTab(new Event('click'), browser.id)
      await h.settle(fixture)
      expect(h.viewKey()).toBe(embedded.key)
      expect(h.workbench()?.navigation?.view?.selectionId).toBe('bid-a')
    })

    it('preserves both surfaces and their queries through refresh and Back/Forward', async () => {
      const h = setup()
      const embedded = h.manifest('bid.studio', { view: remoteView })
      const legacy = h.manifest('documents')
      h.manifests([embedded, legacy])
      h.projectId.set('project-a')
      h.viewKey.set(embedded.key)
      const bidQuery = { selectionId: 'bid-a', parameters: { section: 'authoring', writingMode: 'directory' } }
      h.viewQuery.set(bidQuery)
      let fixture = h.create()
      await h.settle(fixture)
      const frame = fixture.nativeElement.querySelector('xpert-chatkit')
      h.viewKey.set(legacy.key)
      h.viewQuery.set({ selectionId: 'document-b' })
      await h.settle(fixture)
      expect(fixture.componentInstance.activeFixedViewTab()?.query).toEqual({ selectionId: 'document-b' })
      h.viewKey.set(embedded.key)
      h.viewQuery.set(bidQuery)
      await h.settle(fixture)
      expect(h.workbench()?.navigation?.view).toEqual({ viewKey: embedded.key, ...bidQuery })
      expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBe(frame)
      fixture.destroy()
      fixture = h.create()
      await h.settle(fixture)
      expect(h.workbench()?.navigation?.view).toEqual({ viewKey: embedded.key, ...bidQuery })
      expect(fixture.componentInstance.fixedViewTabs().map((tab) => tab.viewKey)).toEqual([legacy.key])
    })

    it.each(['new-project', 'project-b'])(
      'routes embedded %s with its complete query while outer projects stay independent',
      async (projectId) => {
        const h = setup()
        const embedded = h.manifest('bid.studio', { view: remoteView })
        const legacy = h.manifest('other-plugin')
        h.manifests([embedded, legacy])
        h.projectId.set('project-a')
        const fixture = h.create()
        await h.settle(fixture)
        const registry = TestBed.inject(ViewClientCommandRegistry)
        const view = {
          viewKey: embedded.key,
          selectionId: 'bid-b',
          parameters: { section: 'authoring', writingMode: 'directory' }
        }
        const result = await registry.execute(
          WORKBENCH_NAVIGATION_OPEN_COMMAND,
          { target: 'assistant.project', projectId, ...view },
          { hostType: 'agent', hostId: 'assistant-1', viewKey: embedded.key, manifest: embedded }
        )
        expect(result).toMatchObject({ success: true })
        expect(h.selectProject).toHaveBeenCalledWith(projectId, view)
        expect(fixture.componentInstance.fixedViewTabs().some((tab) => tab.viewKey === embedded.key)).toBe(false)
        h.selectProject.mockClear()
        const outerResult = await registry.execute(
          WORKBENCH_NAVIGATION_OPEN_COMMAND,
          { target: 'assistant.project', projectId: 'outer-project', viewKey: legacy.key, selectionId: 'document' },
          { hostType: 'agent', hostId: 'assistant-1', viewKey: legacy.key, manifest: legacy }
        )
        expect(outerResult).toMatchObject({ success: true })
        expect(h.selectProject).not.toHaveBeenCalled()
        expect(fixture.componentInstance.activeFixedViewTab()).toMatchObject({
          viewKey: legacy.key,
          projectScope: { projectId: 'outer-project' },
          query: { selectionId: 'document' }
        })
      }
    )
  })
}
