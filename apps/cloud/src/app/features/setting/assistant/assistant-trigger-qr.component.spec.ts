import { Clipboard } from '@angular/cdk/clipboard'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'
import { AssistantTriggerConnectionService } from './assistant-trigger-connection.service'
import { AssistantTriggerQrComponent } from './assistant-trigger-qr.component'

jest.mock('../../../@core', () => ({ getErrorMessage: (error: Error) => error.message }))
jest.mock('../../chat/clawxpert/clawxpert.facade', () => ({ ClawXpertFacade: class {} }))

describe('Assistant QR quick connection', () => {
  const session = {
    id: 'session',
    authorizationUrl: 'https://open-dev.dingtalk.com/authorize',
    expiresAt: Date.now() + 600000,
    intervalSeconds: 3
  }
  let component: AssistantTriggerQrComponent

  function setup() {
    const api = {
      begin: jest.fn(async () => session),
      poll: jest.fn(async () => ({ status: 'authorized' })),
      complete: jest.fn(async () => ({ provider: 'dingtalk', enabled: true, connected: true, state: 'connected' })),
      cancel: jest.fn(async () => undefined)
    }
    const ref = { close: jest.fn(), disableClose: false }
    const clipboard = { copy: jest.fn(() => true) }
    const facade = { organizationId: signal('org'), xpertId: signal('xpert') }
    TestBed.configureTestingModule({
      providers: [
        { provide: AssistantTriggerConnectionService, useValue: api },
        { provide: DialogRef, useValue: ref },
        { provide: Clipboard, useValue: clipboard },
        { provide: ClawXpertFacade, useValue: facade },
        {
          provide: DIALOG_DATA,
          useValue: { organizationId: 'org', xpertId: 'xpert', card: { provider: { name: 'dingtalk' } } }
        }
      ]
    })
    component = TestBed.runInInjectionContext(() => new AssistantTriggerQrComponent())
    return { api, ref, facade, clipboard }
  }

  afterEach(() => {
    component?.ngOnDestroy()
    TestBed.resetTestingModule()
  })

  it('automatically activates an authorized robot and closes only after runtime confirmation', async () => {
    const { api, ref } = setup()
    await component.start()
    expect(component.state()).toBe('waiting')
    await component.poll()
    expect(api.complete).toHaveBeenCalledWith('xpert', 'dingtalk', 'session')
    expect(ref.close).toHaveBeenCalledWith(true)
  })

  it('does not activate a code that was scanned but is still waiting for approval', async () => {
    const { api, ref } = setup()
    api.poll.mockResolvedValue({ status: 'waiting' })
    await component.start()
    await component.poll()
    expect(api.complete).not.toHaveBeenCalled()
    expect(ref.close).not.toHaveBeenCalled()
  })

  it('retries activation with the same authorized session after a failure', async () => {
    const { api, ref } = setup()
    api.complete.mockRejectedValueOnce(new Error('connection failed'))
    await component.start()
    await component.poll()
    expect(component.state()).toBe('failed')
    expect(ref.close).not.toHaveBeenCalled()
    await component.activate()
    expect(api.begin).toHaveBeenCalledTimes(1)
    expect(api.complete).toHaveBeenCalledTimes(2)
    expect(ref.close).toHaveBeenCalledWith(true)
  })

  it('cancels the pending session when the dialog closes', async () => {
    const { api } = setup()
    await component.start()
    component.ngOnDestroy()
    await component.poll()
    expect(api.cancel).toHaveBeenCalledWith('xpert', 'dingtalk', 'session')
    expect(api.complete).not.toHaveBeenCalled()
  })

  it('refuses activation after switching organizations and copies through the CDK clipboard', async () => {
    const { api, facade, clipboard } = setup()
    await component.start()
    component.copyLink()
    expect(clipboard.copy).toHaveBeenCalledWith(session.authorizationUrl)
    facade.organizationId.set('other')
    await component.activate()
    expect(api.complete).not.toHaveBeenCalled()
  })
})
