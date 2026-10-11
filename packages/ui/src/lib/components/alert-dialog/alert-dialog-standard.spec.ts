import { Dialog } from '@angular/cdk/dialog'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { ZardAlertDialogService } from './alert-dialog.service'

describe('standard confirmation dialogs', () => {
  afterEach(() => {
    TestBed.inject(Dialog).closeAll()
    document.querySelectorAll('.cdk-overlay-container').forEach((element) => element.remove())
  })

  function open(options = {}) {
    const result = jest.fn()
    TestBed.inject(ZardAlertDialogService)
      .confirm({ layout: 'standard', title: 'Approve candidate?', description: 'Approval is recorded.', ...options })
      .subscribe(result)
    TestBed.tick()
    return result
  }

  it('exposes an accessible alert dialog, focuses cancel, and returns approval once', fakeAsync(() => {
    const result = open()
    tick()
    const container = document.querySelector('[role="alertdialog"]')!
    expect(document.getElementById(container.getAttribute('aria-labelledby')!)?.textContent).toContain(
      'Approve candidate?'
    )
    expect(document.getElementById(container.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Approval is recorded.'
    )
    expect(document.activeElement?.getAttribute('data-testid')).toBe('z-alert-dialog-cancel')
    const button = document.querySelector<HTMLButtonElement>('[data-testid="z-alert-dialog-action"]')!
    button.click()
    button.click()
    tick()
    expect(result.mock.calls).toEqual([[true]])
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  }))

  it.each(['cancel', 'close', 'escape', 'backdrop'] as const)(
    'returns false on %s without approving',
    fakeAsync((action: string) => {
      const result = open({ closable: true })
      tick()
      if (action === 'escape') {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
      } else {
        const selector = {
          cancel: '[data-testid="z-alert-dialog-cancel"]',
          close: '[xpDialogCloseButton]',
          backdrop: '.cdk-overlay-backdrop'
        }[action]
        document.querySelector<HTMLElement>(selector!)!.click()
      }
      tick()
      expect(result.mock.calls).toEqual([[false]])
    })
  )

  it('keeps a protected backdrop open while retaining Escape dismissal', fakeAsync(() => {
    const result = open({ maskClosable: false })
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click()
    tick()
    expect(result).not.toHaveBeenCalled()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    tick()
    expect(result.mock.calls).toEqual([[false]])
  }))

  it('restores the opener focus after cancellation', fakeAsync(() => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    open()
    tick()
    document.querySelector<HTMLButtonElement>('[data-testid="z-alert-dialog-cancel"]')!.click()
    tick()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  }))

  it('only dismisses the top confirmation when Escape is pressed', fakeAsync(() => {
    const outer = open()
    const inner = open()
    tick()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    tick()
    expect(inner.mock.calls).toEqual([[false]])
    expect(outer).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('[data-testid="z-alert-dialog-cancel"]')!.click()
    tick()
    expect(outer.mock.calls).toEqual([[false]])
  }))
})
