import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import { ChatConversationService, IChatConversation } from '../../@core'
import { CloudSidebarConversationComponent } from './cloud-sidebar-conversation.component'
import { SidebarConversationEditComponent } from './conversation-edit.component'

describe('CloudSidebarConversationComponent', () => {
  const conversation = {
    id: 'conversation-1',
    threadId: 'thread-1',
    xpertId: 'assistant-1',
    title: 'Task',
    updatedAt: new Date(),
    sidebar: { pinned: false, archived: false }
  } as IChatConversation
  let api: { updateSidebarState: jest.Mock; update: jest.Mock; delete: jest.Mock; refreshSidebar: jest.Mock }
  let dialog: { open: jest.Mock }

  beforeEach(async () => {
    api = {
      updateSidebarState: jest.fn(() => of({})),
      update: jest.fn(() => of({})),
      delete: jest.fn(() => of({})),
      refreshSidebar: jest.fn()
    }
    dialog = { open: jest.fn(() => ({ closed: of(undefined) })) }
    await TestBed.configureTestingModule({
      imports: [CloudSidebarConversationComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ChatConversationService, useValue: api },
        { provide: Dialog, useValue: dialog }
      ]
    })
      .overrideProvider(Dialog, { useValue: dialog })
      .compileComponents()
  })

  function create() {
    const fixture = TestBed.createComponent(CloudSidebarConversationComponent)
    fixture.componentRef.setInput('conversation', conversation)
    fixture.componentRef.setInput('route', ['/chat/x', 'assistant', 'c', 'thread-1'])
    fixture.detectChanges()
    return fixture
  }

  it('keeps all action buttons outside the navigation link', () => {
    const fixture = create()
    expect(fixture.nativeElement.querySelector('a').querySelectorAll('button')).toHaveLength(0)
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(3)
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/chat/x/assistant/c/thread-1')
  })

  it('pins and archives the selected conversation without navigating', async () => {
    const fixture = create()
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigateByUrl')
    await fixture.componentInstance.togglePin()
    await fixture.componentInstance.toggleArchive()
    expect(api.updateSidebarState).toHaveBeenNthCalledWith(1, conversation, { pinned: true })
    expect(api.updateSidebarState).toHaveBeenNthCalledWith(2, conversation, { archived: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('supports undoing pin and archive', async () => {
    const fixture = create()
    const archived = { ...conversation, sidebar: { pinned: true, archived: true } }
    fixture.componentRef.setInput('conversation', archived)
    await fixture.componentInstance.togglePin()
    await fixture.componentInstance.toggleArchive()
    expect(api.updateSidebarState).toHaveBeenNthCalledWith(1, archived, { pinned: false })
    expect(api.updateSidebarState).toHaveBeenNthCalledWith(2, archived, { archived: false })
  })

  it('renames only after confirmation and refreshes both sidebar lists', async () => {
    const fixture = create()
    dialog.open.mockReturnValue({ closed: of('Renamed task') })
    await fixture.componentInstance.rename()
    expect(dialog.open).toHaveBeenCalledWith(
      SidebarConversationEditComponent,
      expect.objectContaining({ data: { mode: 'rename', title: 'Task' } })
    )
    expect(api.update).toHaveBeenCalledWith('conversation-1', { title: 'Renamed task' })
    expect(api.refreshSidebar).toHaveBeenCalledWith(conversation)
  })

  it('does not delete on cancellation', async () => {
    const fixture = create()
    await fixture.componentInstance.remove()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('deletes only the confirmed conversation and leaves a deleted active route', async () => {
    const fixture = create()
    fixture.componentRef.setInput('active', true)
    dialog.open.mockReturnValue({ closed: of(true) })
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    await fixture.componentInstance.remove()
    expect(api.delete).toHaveBeenCalledWith('conversation-1')
    expect(api.refreshSidebar).toHaveBeenCalledWith(conversation, true)
    expect(navigate).toHaveBeenCalledWith(['/chat/x', 'assistant', 'c'])
  })

  it('leaves the row usable and displays an error when persistence fails', async () => {
    const fixture = create()
    api.updateSidebarState.mockReturnValue(throwError(() => new Error('Save failed')))
    await fixture.componentInstance.togglePin()
    fixture.detectChanges()
    expect(fixture.componentInstance.busy()).toBe(false)
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Save failed')
  })
})
