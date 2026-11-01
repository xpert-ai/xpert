import { Clipboard } from '@angular/cdk/clipboard'
import { DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ConversationShareList } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { ConversationSharingService } from '../../../../@core/services/conversation-sharing.service'
import { SharedLinksDialogComponent } from './shared-links-dialog.component'

jest.mock('../../../../@core/services/conversation-sharing.service', () => ({ ConversationSharingService: class {} }))
const page: ConversationShareList = {
  asOf: '2026-10-27T00:00:00.000Z',
  total: 1,
  totalAll: 3,
  items: [
    {
      id: 'share-1',
      url: 'https://app.example/s/Abc234Def567',
      title: 'Shared conversation',
      type: 'conversation',
      audience: 'organization',
      status: 'active',
      createdAt: '2026-10-26T00:00:00Z',
      expiresAt: '2026-11-02T00:00:00Z'
    }
  ]
}
describe('personal shared links dialog', () => {
  let fixture: ComponentFixture<SharedLinksDialogComponent>
  const api = { listMine: jest.fn(), revokeMine: jest.fn(), revokeAllMine: jest.fn() }
  const clipboard = { copy: jest.fn() }
  const dialog = { close: jest.fn(), disableClose: false }
  beforeEach(async () => {
    jest.clearAllMocks()
    clipboard.copy.mockReturnValue(true)
    api.listMine.mockReturnValue(of(page))
    api.revokeMine.mockReturnValue(of(undefined))
    api.revokeAllMine.mockReturnValue(of({ revoked: 3 }))
    await TestBed.configureTestingModule({
      imports: [SharedLinksDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ConversationSharingService, useValue: api },
        { provide: DialogRef, useValue: dialog },
        { provide: Clipboard, useValue: clipboard }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(SharedLinksDialogComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  })
  afterEach(() => TestBed.resetTestingModule())

  it('opens names directly in the share page and copies the persisted link without a request', async () => {
    const root: HTMLElement = fixture.nativeElement
    const link = root.querySelector('[data-share-id="share-1"] a')
    expect(link?.getAttribute('href')).toBe(page.items[0].url)
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(root.querySelector('button[type="submit"]')?.getAttribute('data-dialog-action')).toBe('inline')
    const copy = root.querySelector<HTMLButtonElement>('button[aria-label^="ConversationShare.CopyLink:"]')!
    copy.click()
    expect(clipboard.copy).toHaveBeenCalledWith(page.items[0].url)
    expect(fixture.componentInstance.notice()).toBe('ConversationShare.Copied')
    expect(api.listMine).toHaveBeenCalledTimes(1)
    await fixture.componentInstance.load(0, true)
    copy.click()
    expect(clipboard.copy).toHaveBeenLastCalledWith(page.items[0].url)
  })
  it('does not report clipboard failure as success', () => {
    clipboard.copy.mockReturnValue(false)
    fixture.componentInstance.copy(page.items[0])
    expect(fixture.componentInstance.error()).toBe('ConversationShare.CopyFailed')
    expect(fixture.componentInstance.notice()).toBe('')
  })
  it('disables navigation and copying unavailable links', async () => {
    const item = { ...page.items[0], url: undefined }
    api.listMine.mockReturnValue(of({ ...page, items: [item] }))
    await fixture.componentInstance.load(0, true)
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelector('[data-share-id] a')).toBeNull()
    expect(root.querySelector<HTMLButtonElement>('button[aria-label^="ConversationShare.CopyLink:"]')?.disabled).toBe(
      true
    )
    fixture.componentInstance.copy(item)
    expect(clipboard.copy).not.toHaveBeenCalled()
  })
  it('requires confirmation, then revokes only the chosen link and reloads the list', async () => {
    const component = fixture.componentInstance
    component.confirmRevoke(page.items[0])
    expect(api.revokeMine).not.toHaveBeenCalled()
    component.pending.set(null)
    await component.revoke()
    expect(api.revokeMine).not.toHaveBeenCalled()
    component.confirmRevoke(page.items[0])
    await component.revoke()
    expect(api.revokeMine).toHaveBeenCalledWith('share-1')
    expect(api.revokeAllMine).not.toHaveBeenCalled()
    expect(api.listMine).toHaveBeenCalledTimes(2)
    expect(component.pending()).toBeNull()
  })
  it('bulk revocation retains the server cutoff and prevents closing while it is in flight', async () => {
    const pending = new Subject<{ revoked: number }>()
    api.revokeAllMine.mockReturnValue(pending)
    const component = fixture.componentInstance
    component.confirmRevoke('all')
    const work = component.revoke()
    expect(dialog.disableClose).toBe(true)
    component.close()
    expect(dialog.close).not.toHaveBeenCalled()
    expect(api.revokeAllMine).toHaveBeenCalledWith({ confirmation: 'revoke-all', before: page.asOf })
    pending.next({ revoked: 3 })
    pending.complete()
    await work
    expect(dialog.disableClose).toBe(false)
  })
  it('preserves confirmation and the list on a revoke failure and supports retry', async () => {
    api.revokeMine.mockReturnValue(throwError(() => new Error('network')))
    const component = fixture.componentInstance
    component.confirmRevoke(page.items[0])
    await component.revoke()
    expect(component.pending()).toEqual(page.items[0])
    expect(component.error()).toBe('ConversationShare.ManagementRevokeFailed')
    expect(component.page()?.items).toEqual(page.items)
    expect(component.busy()).toBe(false)
  })
  it('uses server search and preserves the cutoff across pages', async () => {
    const component = fixture.componentInstance
    component.search = '  Shared  '
    component.find()
    await fixture.whenStable()
    expect(api.listMine).toHaveBeenLastCalledWith({ limit: 20, offset: 0, search: 'Shared' })
    await component.load(20)
    expect(api.listMine).toHaveBeenLastCalledWith({ limit: 20, offset: 20, search: 'Shared', before: page.asOf })
  })
})
