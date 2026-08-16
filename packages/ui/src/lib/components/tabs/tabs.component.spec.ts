import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'

import { ZardTabNavBarDirective, ZardTabNavLinkDirective } from './tabs.component'
import { ZardTabNavScrollComponent } from './tab-nav-scroll.component'

@Component({
  imports: [ZardTabNavBarDirective, ZardTabNavLinkDirective, ZardTabNavScrollComponent],
  template: `
    <z-tab-nav-scroll previousLabel="Previous tabs" nextLabel="Next tabs">
      <nav z-tab-nav-bar class="w-max min-w-full !overflow-visible">
        <button z-tab-link>First</button>
        <button z-tab-link>Second</button>
        <button z-tab-link>Third</button>
      </nav>
    </z-tab-nav-scroll>
  `
})
class ScrollableTabNavHostComponent {}

describe('ZardTabNavScrollComponent', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [ScrollableTabNavHostComponent]
    }).createComponent(ScrollableTabNavHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()

    const component = fixture.debugElement.query(By.directive(ZardTabNavScrollComponent))
      .componentInstance as ZardTabNavScrollComponent
    const container = fixture.nativeElement.querySelector('[data-slot="tab-nav-scroll"]') as HTMLElement
    const viewport = fixture.nativeElement.querySelector('[data-slot="tab-nav-scroll-viewport"]') as HTMLElement

    return { fixture, component, container, viewport }
  }

  function setScrollMetrics(
    viewport: HTMLElement,
    metrics: { clientWidth: number; scrollWidth: number; scrollLeft: number }
  ): void {
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: metrics.clientWidth },
      scrollWidth: { configurable: true, value: metrics.scrollWidth },
      scrollLeft: { configurable: true, value: metrics.scrollLeft, writable: true }
    })
  }

  it('shows directional controls only for overflow and updates their disabled state', async () => {
    const { fixture, component, container, viewport } = await createHost()
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 296 })
    setScrollMetrics(viewport, { clientWidth: 240, scrollWidth: 640, scrollLeft: 0 })

    component.syncScrollState()
    fixture.detectChanges()

    const previousButton = fixture.nativeElement.querySelector(
      '[data-slot="tab-nav-scroll-previous"]'
    ) as HTMLButtonElement
    const nextButton = fixture.nativeElement.querySelector('[data-slot="tab-nav-scroll-next"]') as HTMLButtonElement

    expect(previousButton).not.toBeNull()
    expect(previousButton.disabled).toBe(true)
    expect(previousButton.getAttribute('aria-label')).toBe('Previous tabs')
    expect(nextButton.disabled).toBe(false)
    expect(nextButton.getAttribute('aria-label')).toBe('Next tabs')

    viewport.scrollLeft = 400
    viewport.dispatchEvent(new Event('scroll'))
    fixture.detectChanges()

    expect(previousButton.disabled).toBe(false)
    expect(nextButton.disabled).toBe(true)

    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 640 })
    setScrollMetrics(viewport, { clientWidth: 584, scrollWidth: 640, scrollLeft: 0 })
    component.syncScrollState()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-slot="tab-nav-scroll-previous"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-slot="tab-nav-scroll-next"]')).toBeNull()
  })

  it('scrolls the viewport smoothly when a direction button is clicked', async () => {
    const { fixture, component, container, viewport } = await createHost()
    const scrollBy = jest.fn()
    Object.defineProperty(viewport, 'scrollBy', { configurable: true, value: scrollBy })
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 296 })
    setScrollMetrics(viewport, { clientWidth: 240, scrollWidth: 640, scrollLeft: 0 })

    component.syncScrollState()
    fixture.detectChanges()
    fixture.nativeElement.querySelector('[data-slot="tab-nav-scroll-next"]').click()

    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })
  })
})
