import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SidebarConversationEditComponent } from './conversation-edit.component'

describe('SidebarConversationEditComponent', () => {
  const dialog = { close: jest.fn() }

  async function create(mode: 'rename' | 'delete') {
    dialog.close.mockReset()
    await TestBed.configureTestingModule({
      imports: [SidebarConversationEditComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { mode, title: 'Task' } },
        { provide: DialogRef, useValue: dialog }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(SidebarConversationEditComponent)
    fixture.detectChanges()
    return fixture
  }

  it('confirms deletion and prevents the browser from submitting the page', async () => {
    const fixture = await create('delete')
    const event = new Event('submit', { bubbles: true, cancelable: true })

    fixture.nativeElement.querySelector('form').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dialog.close).toHaveBeenCalledTimes(1)
    expect(dialog.close).toHaveBeenCalledWith(true)
  })

  it('submits a trimmed title without a page navigation', async () => {
    const fixture = await create('rename')
    fixture.componentInstance.title.setValue('  Renamed task  ')
    const event = new Event('submit', { bubbles: true, cancelable: true })

    fixture.nativeElement.querySelector('form').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dialog.close).toHaveBeenCalledWith('Renamed task')
  })

  it('keeps the dialog open and prevents page submission for a blank title', async () => {
    const fixture = await create('rename')
    fixture.componentInstance.title.setValue('   ')
    const event = new Event('submit', { bubbles: true, cancelable: true })

    fixture.nativeElement.querySelector('form').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dialog.close).not.toHaveBeenCalled()
  })
})
