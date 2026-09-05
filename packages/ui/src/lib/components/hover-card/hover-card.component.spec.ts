import { OverlayContainer } from '@angular/cdk/overlay'
import { Component, viewChild } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { ZardHoverCardDirective } from './hover-card.component'

@Component({
  imports: [ZardHoverCardDirective],
  template: `
    <button zHoverCard [zContent]="content">Assistant</button>
    <ng-template #content
      ><div><button id="inside">Details</button><iframe title="Extension"></iframe></div
    ></ng-template>
  `
})
class Host {
  readonly hover = viewChild.required(ZardHoverCardDirective)
}

describe('ZardHoverCardDirective', () => {
  function setup() {
    const fixture = TestBed.createComponent(Host)
    fixture.detectChanges()
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('button')
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    return { fixture, trigger, overlay, hover: fixture.componentInstance.hover() }
  }

  it('honors delayed opening and crossing the gap into the card', fakeAsync(() => {
    const { fixture, trigger, overlay, hover } = setup()
    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    tick(349)
    expect(hover.visible()).toBe(false)
    tick(1)
    fixture.detectChanges()
    expect(overlay.querySelector('#inside')).not.toBeNull()
    trigger.dispatchEvent(new MouseEvent('mouseleave'))
    tick(200)
    overlay.querySelector('.cdk-overlay-pane')!.dispatchEvent(new MouseEvent('mouseenter'))
    tick(300)
    expect(hover.visible()).toBe(true)
    overlay.querySelector('.cdk-overlay-pane')!.dispatchEvent(new MouseEvent('mouseleave'))
    tick(300)
    expect(hover.visible()).toBe(false)
    fixture.destroy()
  }))

  it('keeps an iframe with focus open and restores the trigger on Escape', fakeAsync(() => {
    const { fixture, trigger, overlay, hover } = setup()
    trigger.focus()
    tick(350)
    fixture.detectChanges()
    overlay.querySelector('iframe')!.focus()
    hover.leave()
    tick(300)
    expect(hover.visible()).toBe(true)
    hover.escape(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.activeElement).toBe(trigger)
    tick(500)
    expect(hover.visible()).toBe(false)
    fixture.destroy()
  }))

  it('holds a decision open, gives handled Escape priority and disposes the portal', fakeAsync(() => {
    const { fixture, hover, overlay } = setup()
    hover.open(true)
    fixture.detectChanges()
    hover.setHoldOpen(true)
    hover.escape(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(hover.visible()).toBe(true)
    hover.setHoldOpen(false)
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    handled.preventDefault()
    hover.escape(handled)
    expect(hover.visible()).toBe(true)
    fixture.destroy()
    tick(500)
    expect(overlay.querySelector('iframe')).toBeNull()
  }))
})
