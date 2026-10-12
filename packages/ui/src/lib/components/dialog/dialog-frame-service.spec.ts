import { Component } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { ZardDialogService } from './dialog.service'

@Component({ standalone: true, template: '<input aria-label="Name" />' })
class Content {}

describe('shared service dialog frame', () => {
  it('keeps validation vetoes and returns the configured result', fakeAsync(() => {
    TestBed.configureTestingModule({})
    let valid = false
    const ref = TestBed.inject(ZardDialogService).create({
      zTitle: 'Create record',
      zContent: Content,
      zCancelText: 'Cancel',
      zOkText: 'Create',
      zOnOk: () => (valid ? { id: 'created' } : false)
    })
    const received = jest.fn()
    ref.closed.subscribe(received)
    TestBed.tick()
    tick()
    const pane = document.querySelector<HTMLElement>('.xp-overlay-pane-dialog')!
    expect(pane.querySelectorAll('[xpDialogLayout]')).toHaveLength(1)
    expect(pane.querySelector('[xpDialogHeading]')?.textContent).toBe('Create record')
    expect(pane.querySelector('[xpDialogCloseButton]')?.parentElement?.hasAttribute('xpDialogHeader')).toBe(true)
    pane.querySelector<HTMLButtonElement>('[data-testid="z-ok-button"]')!.click()
    tick(150)
    expect(received).not.toHaveBeenCalled()
    valid = true
    pane.querySelector<HTMLButtonElement>('[data-testid="z-ok-button"]')!.click()
    tick(150)
    expect(received.mock.calls).toEqual([[{ id: 'created' }]])
    expect(document.querySelector('.xp-overlay-pane-dialog')).toBeNull()
  }))

  it('closes only the top dialog on Escape and restores focus', fakeAsync(() => {
    TestBed.configureTestingModule({})
    const launch = document.createElement('button')
    document.body.append(launch)
    launch.focus()
    const dialog = TestBed.inject(ZardDialogService)
    const parent = dialog.create({ zContent: Content, zTitle: 'Parent' })
    TestBed.tick()
    tick()
    const parentInput = document.querySelector<HTMLInputElement>('input')!
    parentInput.focus()
    const child = dialog.create({ zContent: Content, zTitle: 'Child' })
    const closed = jest.fn()
    parent.closed.subscribe(closed)
    TestBed.tick()
    tick()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    tick(150)
    expect(document.querySelectorAll('.xp-overlay-pane-dialog')).toHaveLength(1)
    expect(closed).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(parentInput)
    parent.close()
    tick(150)
    expect(document.activeElement).toBe(launch)
    launch.remove()
  }))
})
