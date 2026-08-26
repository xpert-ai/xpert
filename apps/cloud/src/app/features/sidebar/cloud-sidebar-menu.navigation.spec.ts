import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { Store } from '@cloud/app/@core/state'
import { BehaviorSubject, Subject } from 'rxjs'
import { CloudSidebarMenuComponent } from './cloud-sidebar-menu.component'
import { CloudMenuItem } from './cloud-sidebar-menu.types'
import { ClawXpertConversationStartIntentService } from '../chat/clawxpert/clawxpert-conversation-start-intent.service'

describe('CloudSidebarMenuComponent workspace navigation', () => {
  const router = {
    events: new Subject(),
    url: '/chat/clawxpert/c/thread-1',
    isActive: jest.fn(() => false),
    navigateByUrl: jest.fn(() => Promise.resolve(true))
  }
  const store = {
    selectedWorkspace$: new BehaviorSubject({ id: 'workspace-1' }),
    workspaceId$: new BehaviorSubject('workspace-1')
  }

  beforeEach(() => {
    router.navigateByUrl.mockClear()
    router.url = '/chat/clawxpert/c/thread-1'

    TestBed.configureTestingModule({
      imports: [CloudSidebarMenuComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: Store, useValue: store }
      ]
    }).overrideComponent(CloudSidebarMenuComponent, {
      set: {
        imports: [],
        template: ''
      }
    })
  })

  it.each([
    ['skills', '/xpert/w/workspace-1/clawxpert-skills'],
    ['connectors', '/xpert/w/workspace-1/clawxpert-connectors'],
    ['files', '/xpert/w/workspace-1/files'],
    ['knowledges', '/xpert/w/workspace-1/clawxpert-knowledges'],
    ['settings', '/xpert/w/workspace-1/settings']
  ] as const)('navigates the %s entry directly to its original workspace page', async (section, expectedUrl) => {
    const fixture = TestBed.createComponent(CloudSidebarMenuComponent)
    const component = fixture.componentInstance
    const item = {
      title: section,
      link: '/chat/clawxpert/c/thread-1',
      data: { workspaceSection: section }
    } as CloudMenuItem
    const event = new MouseEvent('click')
    const preventDefault = jest.spyOn(event, 'preventDefault')

    component.onMenuClick(event, item)
    await Promise.resolve()

    expect(preventDefault).toHaveBeenCalled()
    expect(router.navigateByUrl).toHaveBeenCalledWith(expectedUrl)
  })

  it('navigates nested more entries without opening a conversation', async () => {
    const fixture = TestBed.createComponent(CloudSidebarMenuComponent)
    const component = fixture.componentInstance
    const event = new MouseEvent('click')
    const preventDefault = jest.spyOn(event, 'preventDefault')

    component.onChildClick(event, {
      title: '资源库',
      data: { workspaceSection: 'files' }
    } as CloudMenuItem)
    await Promise.resolve()

    expect(preventDefault).toHaveBeenCalled()
    expect(router.navigateByUrl).toHaveBeenCalledWith('/xpert/w/workspace-1/files')
  })

  it('marks an explicit new conversation before navigating away from an existing thread', async () => {
    const fixture = TestBed.createComponent(CloudSidebarMenuComponent)
    const component = fixture.componentInstance
    const intent = TestBed.inject(ClawXpertConversationStartIntentService)
    const requestId = intent.requestId()
    const event = new MouseEvent('click')

    component.onMenuClick(event, {
      title: 'New task',
      link: '/chat/clawxpert/c',
      data: { action: 'newClawXpertConversation' }
    } as CloudMenuItem)
    await Promise.resolve()

    expect(intent.requestId()).toBe(requestId + 1)
    expect(router.navigateByUrl).toHaveBeenCalledWith('/chat/clawxpert/c')
  })
})
