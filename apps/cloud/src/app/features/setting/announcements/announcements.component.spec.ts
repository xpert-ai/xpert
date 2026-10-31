import { Dialog } from '@angular/cdk/dialog'
import { OverlayContainer } from '@angular/cdk/overlay'
import { DebugElement, getDebugNode } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import type { Announcement } from '@xpert-ai/contracts'
import { provideZard, ZardCalendarComponent } from '@xpert-ai/headless-ui'
import { UserNotificationsService } from '../../../@core/services/user-notifications.service'
import { AnnouncementEditorComponent } from './announcement-editor.component'
import { AnnouncementsComponent } from './announcements.component'

jest.mock('../../../@core/services/user-notifications.service', () => ({ UserNotificationsService: class {} }))
jest.mock('../../../@core/services/toastr.service', () => ({ injectToastr: () => ({ error: jest.fn() }) }))

const announcement: Announcement = {
  id: 'a1111111-1111-4111-8111-111111111111',
  title: 'Maintenance',
  body: 'Service maintenance',
  category: 'maintenance',
  severity: 'important',
  clients: ['desktop'],
  status: 'published',
  revision: 2,
  startsAt: new Date(2026, 9, 31, 17, 37).toISOString(),
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  dismissedAt: null,
  action: null
}
function debug(element: Element) {
  const node = getDebugNode(element)
  if (!(node instanceof DebugElement)) throw new Error('Expected a component view')
  return node
}
function action(element: Element, name: string) {
  const button = Array.from(element.querySelectorAll('button')).find((node) => node.textContent?.includes(name))
  if (!button) throw new Error(`Missing action ${name}`)
  return button
}

describe('Announcement editor Dialog and unified date/time field', () => {
  const service = { adminList: jest.fn(), save: jest.fn(), audit: jest.fn() }
  beforeEach(() => {
    jest.clearAllMocks()
    service.adminList.mockResolvedValue({ items: [], total: 0 })
    service.save.mockResolvedValue(announcement)
    TestBed.configureTestingModule({
      imports: [AnnouncementsComponent, TranslateModule.forRoot()],
      providers: [provideZard(), { provide: UserNotificationsService, useValue: service }]
    })
  })
  afterEach(() => TestBed.inject(Dialog).closeAll())
  async function create(item?: Announcement, copy = false) {
    const fixture = TestBed.createComponent(AnnouncementsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.componentInstance.edit(item, copy)
    const ref = TestBed.inject(Dialog).openDialogs[0]
    const editor = ref?.componentInstance
    if (!(editor instanceof AnnouncementEditorComponent) || !ref.componentRef) throw new Error('Editor did not open')
    const view = debug(ref.componentRef.location.nativeElement)
    const detect = () => {
      fixture.detectChanges()
      ref.componentRef?.changeDetectorRef.detectChanges()
    }
    detect()
    await fixture.whenStable()
    const picker = async (control: 'startsAt' | 'expiresAt') => {
      const field = view.query(By.css(`z-date-time-picker[formControlName="${control}"]`))
      field.nativeElement.querySelector('button').click()
      detect()
      await fixture.whenStable()
      const panel = TestBed.inject(OverlayContainer).getContainerElement().querySelector('z-popover')!
      expect(panel).not.toBeNull()
      return { panel, view: debug(panel), field }
    }
    return { fixture, editor, view, ref, detect, picker }
  }
  it('commits date and time together, clears optional expiry and refreshes the list after a successful save', async () => {
    const { fixture, editor, view, detect, picker } = await create()
    editor.form.patchValue({ title: 'Maintenance', body: 'Service maintenance', expiresAt: '2026-11-03T10:25' })
    detect()
    const category: HTMLInputElement = view.nativeElement.querySelector(
      'z-radio-group[formControlName="category"] input[value="maintenance"]'
    )
    const severity: HTMLInputElement = view.nativeElement.querySelector(
      'z-radio-group[formControlName="severity"] input[value="important"]'
    )
    category.click()
    severity.click()
    detect()
    expect(view.nativeElement.querySelectorAll('z-radio-group[formControlName="category"] input:checked')).toHaveLength(
      1
    )
    expect(view.nativeElement.querySelectorAll('z-radio-group[formControlName="severity"] input:checked')).toHaveLength(
      1
    )
    const previous = editor.form.controls.startsAt.value
    const start = await picker('startsAt')
    start.view
      .query(By.directive(ZardCalendarComponent))
      .injector.get(ZardCalendarComponent)
      .value.set(new Date(2026, 10, 2))
    detect()
    await fixture.whenStable()
    const clock = start.panel.querySelector<HTMLElement>('[role="slider"]')!
    const key = (value: string) => {
      clock.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
      detect()
    }
    key('Home')
    for (let i = 0; i < 8; i++) key('ArrowUp')
    key('Enter')
    key('Home')
    for (let i = 0; i < 7; i++) key('ArrowRight')
    detect()
    expect(start.panel.querySelector<HTMLInputElement>('input')!.value).toBe('08:07')
    expect(editor.form.controls.startsAt.value).toBe(previous)
    action(start.panel, 'Confirm').click()
    detect()
    expect(editor.form.controls.startsAt.value).toBe('2026-11-02T08:07')
    expect(editor.form.controls.startsAt.touched).toBe(true)
    const expiry = await picker('expiresAt')
    action(expiry.panel, 'XP.Notifications.ClearExpiry').click()
    const web: HTMLInputElement = view.nativeElement.querySelector('z-checkbox[formControlName="web"] input')
    web.click()
    detect()
    expect(editor.form.controls.expiresAt.value).toBe('')
    await editor.save()
    await fixture.whenStable()
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'maintenance',
        severity: 'important',
        clients: ['desktop'],
        startsAt: new Date(2026, 10, 2, 8, 7).toISOString(),
        expiresAt: null
      }),
      undefined
    )
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0)
    expect(service.adminList).toHaveBeenCalledTimes(2)
  })
  it('restores an existing timestamp and locks published audience controls inside the editor', async () => {
    const { editor, view } = await create(announcement)
    expect(editor.form.controls.startsAt.value).toBe('2026-10-31T17:37')
    const web: HTMLInputElement = view.nativeElement.querySelector('z-checkbox[formControlName="web"] input')
    const desktop: HTMLInputElement = view.nativeElement.querySelector('z-checkbox[formControlName="desktop"] input')
    expect(web.disabled).toBe(true)
    expect(desktop.disabled).toBe(true)
    web.click()
    desktop.click()
    expect(editor.form.getRawValue()).toMatchObject({ web: false, desktop: true })
    await editor.save()
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: announcement.startsAt, clients: ['desktop'] }),
      announcement
    )
  })
  it('keeps the editor open when expiry precedes the start', async () => {
    const { editor } = await create()
    editor.form.patchValue({
      title: 'Maintenance',
      body: 'Service maintenance',
      startsAt: '2026-11-02T08:07',
      expiresAt: '2026-11-01T08:07'
    })
    await editor.save()
    expect(service.save).not.toHaveBeenCalled()
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1)
  })
  it('rejects invalid time and Escape discards picker edits before closing the parent Dialog', async () => {
    const { fixture, editor, detect, picker } = await create(announcement)
    const start = await picker('startsAt')
    const time = start.panel.querySelector<HTMLInputElement>('input')!
    time.value = '25:99'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    detect()
    expect(action(start.panel, 'Confirm').disabled).toBe(true)
    time.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    detect()
    await fixture.whenStable()
    expect(TestBed.inject(OverlayContainer).getContainerElement().querySelector('z-popover')).toBeNull()
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1)
    expect(editor.form.controls.startsAt.value).toBe('2026-10-31T17:37')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    await fixture.whenStable()
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0)
    expect(service.save).not.toHaveBeenCalled()
  })
  it('blocks duplicate submission and closing during save, then retains the form on failure', async () => {
    const { editor, ref } = await create(announcement)
    let rejectSave: (error: Error) => void = () => {}
    service.save.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSave = reject
      })
    )
    const saving = editor.save()
    expect(ref.disableClose).toBe(true)
    editor.close()
    await editor.save()
    expect(service.save).toHaveBeenCalledTimes(1)
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1)
    rejectSave(new Error('Save failed'))
    await saving
    expect(editor.busy()).toBe(false)
    expect(ref.disableClose).toBe(false)
    expect(editor.form.controls.title.value).toBe(announcement.title)
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1)
  })
  it('copies an announcement into a new draft with an editable audience and no expiry', async () => {
    const { editor, view } = await create({ ...announcement, expiresAt: '2026-12-01T00:00:00Z' }, true)
    expect(editor.selected()).toBeNull()
    expect(editor.form.controls.expiresAt.value).toBe('')
    expect(editor.form.controls.title.value).toBe(announcement.title)
    const desktop: HTMLInputElement = view.nativeElement.querySelector('z-checkbox[formControlName="desktop"] input')
    expect(desktop.disabled).toBe(false)
    expect(Math.abs(Date.now() - new Date(editor.form.controls.startsAt.value).getTime())).toBeLessThan(60000)
  })
})
