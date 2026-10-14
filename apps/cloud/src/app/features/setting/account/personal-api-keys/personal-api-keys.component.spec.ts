import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { PersonalApiKeySummary } from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { of, Subject, throwError } from 'rxjs'
import { PersonalApiKeysService } from '../../../../@core/services/personal-api-keys.service'
import { ToastrService } from '../../../../@core/services/toastr.service'
import { PersonalApiKeysComponent } from './personal-api-keys.component'

describe('PersonalApiKeysComponent', () => {
  const key: PersonalApiKeySummary = {
    id: 'key',
    name: 'My CLI',
    prefix: 'sk-user-abcdef12',
    createdAt: '2026-10-01T00:00:00.000Z',
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null
  }
  let fixture: ComponentFixture<PersonalApiKeysComponent>
  let component: PersonalApiKeysComponent
  let root: HTMLElement
  const service = { list: jest.fn(), create: jest.fn(), revoke: jest.fn() }
  const dialog = { open: jest.fn() }
  const clipboard = { copy: jest.fn() }
  const confirm = { confirm: jest.fn() }
  const toastr = { error: jest.fn() }

  beforeEach(async () => {
    jest.resetAllMocks()
    service.list.mockReturnValue(of([key]))
    service.create.mockReturnValue(of({ key: { ...key, id: 'new-key' }, token: 'one-time-secret' }))
    service.revoke.mockReturnValue(of(undefined))
    dialog.open.mockReturnValue({ closed: of({ name: 'My CLI', lifetime: '90' }) })
    clipboard.copy.mockReturnValue(true)
    confirm.confirm.mockReturnValue(of(true))
    await TestBed.configureTestingModule({
      imports: [PersonalApiKeysComponent, TranslateModule.forRoot()],
      providers: [
        { provide: PersonalApiKeysService, useValue: service },
        { provide: Dialog, useValue: dialog },
        { provide: Clipboard, useValue: clipboard },
        { provide: ZardAlertDialogService, useValue: confirm },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(PersonalApiKeysComponent)
    component = fixture.componentInstance
    root = fixture.nativeElement
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  })
  afterEach(() => TestBed.resetTestingModule())

  it('loads metadata, filters names and displays expired/revoked states', () => {
    expect(root.textContent).toContain('My CLI')
    expect(root.textContent).toContain('sk-user-abcdef12')
    expect(root.textContent).not.toContain('one-time-secret')
    component.searchControl.setValue('missing')
    fixture.detectChanges()
    expect(root.textContent).toContain('XP.PersonalApiKeys.NoMatches')
    expect(component.status({ ...key, expiresAt: '2020-01-01' })).toBe('Expired')
    expect(component.status({ ...key, revokedAt: '2020-01-01' })).toBe('Revoked')
  })

  it('shows the secret only after creation, copies on the first click and clears it when dismissed', async () => {
    await component.create()
    fixture.detectChanges()
    expect(service.create).toHaveBeenCalledWith({ name: 'My CLI', lifetime: '90' })
    expect(root.textContent).toContain('one-time-secret')
    const copyButton = Array.from(root.querySelectorAll('button')).find((button) =>
      button.textContent.includes('XP.PersonalApiKeys.Copy')
    )
    copyButton.click()
    fixture.detectChanges()
    expect(clipboard.copy).toHaveBeenCalledWith('one-time-secret')
    expect(root.textContent).toContain('XP.PersonalApiKeys.Copied')
    await component.create()
    expect(service.create).toHaveBeenCalledTimes(1)
    component.dismissSecret()
    fixture.detectChanges()
    expect(root.textContent).not.toContain('one-time-secret')
  })

  it('keeps the secret visible on clipboard failure and reports an actionable error', async () => {
    await component.create()
    clipboard.copy.mockReturnValue(false)
    component.copy()
    expect(component.copied()).toBe(false)
    expect(toastr.error).toHaveBeenCalled()
    expect(component.created()?.token).toBe('one-time-secret')
  })

  it('does not revoke after cancellation and updates status after confirmed revocation', async () => {
    confirm.confirm.mockReturnValueOnce(of(false))
    await component.revoke(key)
    expect(service.revoke).not.toHaveBeenCalled()
    await component.revoke(key)
    fixture.detectChanges()
    expect(service.revoke).toHaveBeenCalledWith(key.id)
    expect(component.status(component.keys()[0])).toBe('Revoked')
    expect(root.querySelector('tbody button')).toBeNull()
  })

  it('shows load errors, allows retry and prevents duplicate creation during pending requests', async () => {
    service.list.mockReturnValueOnce(throwError(() => new Error('network')))
    await component.load()
    fixture.detectChanges()
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
    await component.load()
    expect(component.failed()).toBe(false)
    const pending = new Subject<{ key: PersonalApiKeySummary; token: string }>()
    service.create.mockReturnValue(pending)
    const create = component.create()
    await Promise.resolve()
    await component.create()
    expect(service.create).toHaveBeenCalledTimes(1)
    pending.next({ key, token: 'secret' })
    pending.complete()
    await create
    expect(component.creating()).toBe(false)
  })
})
