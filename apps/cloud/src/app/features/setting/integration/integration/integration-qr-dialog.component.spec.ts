import { Clipboard } from '@angular/cdk/clipboard'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { IntegrationService, Store } from '../../../../@core'
import { IntegrationQrDialogComponent } from './integration-qr-dialog.component'

jest.mock('../../../../@core', () => ({
  IntegrationService: class {},
  Store: class {},
  getErrorMessage: (error: Error) => error.message
}))

describe('System integration QR creation', () => {
  const session = {
    id: 'session',
    authorizationUrl: 'https://open-dev.dingtalk.com/authorize',
    expiresAt: Date.now() + 600000,
    intervalSeconds: 3
  }
  const result = { id: 'integration', name: 'Robot', slug: 'robot', provider: 'dingtalk_long', outcome: 'created' }
  let component: IntegrationQrDialogComponent

  function setup() {
    const api = {
      beginQrAuthorization: jest.fn(() => of(session)),
      pollQrAuthorization: jest.fn(() => of({ status: 'authorized' })),
      completeQrAuthorization: jest.fn(() => of(result)),
      cancelQrAuthorization: jest.fn(() => of(undefined))
    }
    const organization = new BehaviorSubject('org')
    const store = {
      get organizationId() {
        return organization.value
      },
      userId: 'user',
      user$: of({ id: 'user' }),
      selectOrganizationId: () => organization
    }
    const ref = { close: jest.fn(), disableClose: false }
    const clipboard = { copy: jest.fn(() => true) }
    const input = { name: 'Robot', description: 'For the team', avatar: { emoji: { id: 'robot_face' } } }
    TestBed.configureTestingModule({
      providers: [
        { provide: IntegrationService, useValue: api },
        { provide: Store, useValue: store },
        { provide: Clipboard, useValue: clipboard },
        { provide: DialogRef, useValue: ref },
        {
          provide: DIALOG_DATA,
          useValue: { provider: { name: 'dingtalk_long' }, input, organizationId: 'org', userId: 'user' }
        }
      ]
    })
    component = TestBed.runInInjectionContext(() => new IntegrationQrDialogComponent())
    return { api, ref, organization, clipboard, input }
  }

  afterEach(() => {
    component?.ngOnDestroy()
    TestBed.resetTestingModule()
  })

  it('passes metadata to the server and automatically saves an authorized integration', async () => {
    const { api, ref, input } = setup()
    await component.start()
    expect(api.beginQrAuthorization).toHaveBeenCalledWith('dingtalk_long', input)
    await component.poll()
    expect(api.completeQrAuthorization).toHaveBeenCalledWith('session')
    expect(ref.close).toHaveBeenCalledWith(result)
  })

  it('waits for authorization and copies the link through the CDK clipboard', async () => {
    const { api, ref, clipboard } = setup()
    api.pollQrAuthorization.mockReturnValue(of({ status: 'waiting' }))
    await component.start()
    component.copyLink()
    await component.poll()
    expect(clipboard.copy).toHaveBeenCalledWith(session.authorizationUrl)
    expect(component.state()).toBe('waiting')
    expect(api.completeQrAuthorization).not.toHaveBeenCalled()
    expect(ref.close).not.toHaveBeenCalled()
  })

  it('returns the existing integration after a reused authorization', async () => {
    const { api, ref } = setup()
    const reused = { ...result, id: 'existing', outcome: 'reused' }
    api.completeQrAuthorization.mockReturnValue(of(reused))
    await component.start()
    await component.poll()
    expect(ref.close).toHaveBeenCalledWith(reused)
  })

  it('retries a failed save with the same authorized session', async () => {
    const { api, ref } = setup()
    api.completeQrAuthorization.mockReturnValueOnce(throwError(() => new Error('save failed')))
    await component.start()
    await component.poll()
    expect(component.state()).toBe('failed')
    expect(ref.close).not.toHaveBeenCalled()
    await component.complete()
    expect(api.beginQrAuthorization).toHaveBeenCalledTimes(1)
    expect(api.completeQrAuthorization).toHaveBeenCalledTimes(2)
    expect(ref.close).toHaveBeenCalledWith(result)
  })

  it('requires a new QR code if the authorized session expires before saving', async () => {
    const { api } = setup()
    api.completeQrAuthorization.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })))
    await component.start()
    await component.poll()
    expect(component.state()).toBe('expired')
    expect(component.authorized).toBe(false)
    expect(component.dialogRef.disableClose).toBe(false)
  })

  it('cancels on close without saving and ignores late authorization responses', async () => {
    const { api, ref } = setup()
    const pending = new Subject<{ status: string }>()
    api.pollQrAuthorization.mockReturnValue(pending)
    await component.start()
    const poll = component.poll()
    component.ngOnDestroy()
    pending.next({ status: 'authorized' })
    await poll
    expect(api.cancelQrAuthorization).toHaveBeenCalledWith('session')
    expect(api.completeQrAuthorization).not.toHaveBeenCalled()
    expect(ref.close).not.toHaveBeenCalled()
  })

  it('does not save after switching organizations', async () => {
    const { api, organization } = setup()
    await component.start()
    organization.next('other')
    await component.poll()
    expect(api.completeQrAuthorization).not.toHaveBeenCalled()
  })
})
