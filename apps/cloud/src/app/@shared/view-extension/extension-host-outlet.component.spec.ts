jest.mock('@cloud/app/@core', () => {
  const { inject } = jest.requireActual('@angular/core')

  class ViewExtensionApiService {}

  return {
    ViewExtensionApiService,
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error ?? '')),
    injectViewExtensionApi: () => inject(ViewExtensionApiService)
  }
})

jest.mock('./view-renderer.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-view-renderer',
    template: '<div data-view-renderer></div>'
  })
  class ViewRendererComponent {
    @Input() hostType?: string
    @Input() hostId?: string
    @Input() manifest?: XpertExtensionViewManifest
    @Input() runtimeScope?: XpertViewRuntimeScopeInput | null
    @Input() runtimeUserId?: string | null
    @Input() initialQuery?: object
    @Input() active?: boolean
    @Input() fillAvailableHeight?: boolean
  }

  return { ViewRendererComponent }
})

import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { ViewExtensionApiService } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import type {
  XpertExtensionViewManifest,
  XpertViewActionDefinition,
  XpertViewRuntimeScopeInput
} from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { ExtensionHostOutletComponent } from './extension-host-outlet.component'
import { ViewRendererComponent } from './view-renderer.component'

const actions: XpertViewActionDefinition[] = [
  { key: 'read', label: { en_US: 'Read' }, actionType: 'refresh', requiredHostAccess: 'read' },
  { key: 'edit', label: { en_US: 'Edit' }, actionType: 'invoke', requiredHostAccess: 'edit' },
  { key: 'manage', label: { en_US: 'Manage' }, actionType: 'invoke', requiredHostAccess: 'manage' }
]

function buildManifest(visibleActions: XpertViewActionDefinition[]): XpertExtensionViewManifest {
  return {
    key: 'docx-editor',
    title: { en_US: 'DOCX Editor' },
    hostType: 'agent',
    slot: 'agent.workbench.fixed',
    source: { provider: 'docx-editor' },
    view: {
      type: 'remote_component',
      runtime: 'esm',
      protocolVersion: 1,
      component: { isolation: 'iframe', entry: 'docx-editor' },
      dataSource: { mode: 'platform' }
    },
    dataSource: { mode: 'platform' },
    actions: visibleActions
  }
}

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  fixture.detectChanges()
}

describe('ExtensionHostOutletComponent runtime scope discovery', () => {
  let api: { getSlotViews: jest.Mock }

  beforeEach(async () => {
    api = { getSlotViews: jest.fn() }
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExtensionHostOutletComponent],
      providers: [{ provide: ViewExtensionApiService, useValue: api }]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('refreshes role-filtered manifests by Project scope without replacing the mounted renderer', async () => {
    const memberManifest = buildManifest([actions[0]])
    const memberResponse = new Subject<XpertExtensionViewManifest[]>()
    api.getSlotViews
      .mockReturnValueOnce(of([buildManifest(actions)]))
      .mockReturnValueOnce(memberResponse)
      .mockReturnValueOnce(throwError(() => new Error('forbidden')))

    const fixture = TestBed.createComponent(ExtensionHostOutletComponent)
    fixture.componentRef.setInput('mode', 'single-view')
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('slot', 'agent.workbench.fixed')
    fixture.componentRef.setInput('viewKey', 'docx-editor')
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-editor', conversationId: null })
    fixture.componentRef.setInput('runtimeUserId', 'user-1')
    await settle(fixture)

    expect(api.getSlotViews).toHaveBeenLastCalledWith('agent', 'assistant-1', 'agent.workbench.fixed', {
      runtimeScope: { projectId: 'project-editor', conversationId: null }
    })
    const renderer = fixture.debugElement.query(By.directive(ViewRendererComponent))
      .componentInstance as ViewRendererComponent
    expect(renderer.runtimeUserId).toBe('user-1')
    expect(renderer.manifest?.actions?.map((action) => action.key)).toEqual(['read', 'edit', 'manage'])

    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-member', conversationId: null })
    fixture.detectChanges()
    await Promise.resolve()
    fixture.detectChanges()

    expect(api.getSlotViews).toHaveBeenLastCalledWith('agent', 'assistant-1', 'agent.workbench.fixed', {
      runtimeScope: { projectId: 'project-member', conversationId: null }
    })
    const pendingRenderer = fixture.debugElement.query(By.directive(ViewRendererComponent)).componentInstance
    expect(pendingRenderer).toBe(renderer)
    expect(renderer.manifest?.actions?.map((action) => action.key)).toEqual(['read'])

    memberResponse.next([memberManifest])
    memberResponse.complete()
    await settle(fixture)

    const memberRenderer = fixture.debugElement.query(By.directive(ViewRendererComponent)).componentInstance
    expect(memberRenderer).toBe(renderer)
    expect(renderer.manifest?.actions?.map((action) => action.key)).toEqual(['read'])

    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-forbidden', conversationId: null })
    await settle(fixture)

    expect(fixture.componentInstance.error()).toBe('forbidden')
    expect(fixture.debugElement.query(By.directive(ViewRendererComponent)).componentInstance).toBe(renderer)
    expect(renderer.manifest?.actions?.map((action) => action.key)).toEqual(['read'])
  })
})
