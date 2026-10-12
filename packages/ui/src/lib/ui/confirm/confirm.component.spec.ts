import { Dialog } from '@angular/cdk/dialog'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { defer, of } from 'rxjs'
import { injectConfirm } from './confirm.component'

describe('generic confirmation', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll())

  it.each(['cancel', 'escape', 'backdrop', 'action'])(
    'runs the supplied operation only after approval (%s)',
    fakeAsync((action: string) => {
      TestBed.configureTestingModule({})
      const execute = jest.fn(() => of('saved'))
      const received = jest.fn()
      const complete = jest.fn()
      const confirm = TestBed.runInInjectionContext(() => injectConfirm())
      confirm({ information: 'Apply this change?' }, defer(execute)).subscribe({ next: received, complete })
      TestBed.tick()
      tick()
      expect(execute).not.toHaveBeenCalled()
      const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
      expect(dialog.textContent).toContain('Apply this change?')
      expect(dialog.querySelector('[xpDialogHeading]')?.textContent).toBe('Confirm')
      if (action === 'escape') {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
      } else if (action === 'backdrop') {
        document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click()
      } else {
        dialog.querySelector<HTMLButtonElement>(`[data-testid="z-alert-dialog-${action}"]`)!.click()
      }
      tick()
      expect(execute).toHaveBeenCalledTimes(action === 'action' ? 1 : 0)
      expect(received.mock.calls).toEqual(action === 'action' ? [['saved']] : [])
      expect(complete).toHaveBeenCalledTimes(1)
    })
  )
})
