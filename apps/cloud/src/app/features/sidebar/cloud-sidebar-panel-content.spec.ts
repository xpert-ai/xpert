import { OverlayContainer } from '@angular/cdk/overlay'
import { Component } from '@angular/core'
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { CloudSidebarHoverPanelDirective } from './cloud-sidebar-hover-panel.directive'
import { CloudSidebarPanelTriggerDirective } from './cloud-sidebar-panel-trigger.directive'

@Component({
  standalone: true,
  imports: [CloudSidebarHoverPanelDirective, CloudSidebarPanelTriggerDirective, RouterModule],
  template: `
    <nav
      [xpSidebarHoverPanel]="true"
      [xpSidebarPanelMobile]="mobile"
      [xpSidebarPanelScope]="scope"
      (pinnedPanelWidthChange)="width = $event"
    >
      @if (allowed) {
        <button data-sidebar-panel-title="Bosi" [xpSidebarPanelTrigger]="bosi" xpSidebarPanelKey="bosi">Bosi</button>
        <button
          data-sidebar-panel-title="Assistant"
          [xpSidebarPanelTrigger]="assistant"
          xpSidebarPanelKey="assistant:a"
          (panelActivated)="activations = activations + 1"
          (panelSelected)="selections = selections + 1"
        >
          Assistant
        </button>
      }
      <button
        data-sidebar-panel-title="All assistants"
        [xpSidebarPanelTrigger]="directory"
        xpSidebarPanelKey="directory"
      >
        All assistants
      </button>
      <ng-template #bosi let-query
        ><span>Bosi resources {{ query }}</span
        ><a routerLink="/tasks">Tasks</a></ng-template
      >
      <ng-template #assistant let-query
        ><span>Assistant views {{ query }}</span
        ><a routerLink="/assistant">Conversation</a></ng-template
      >
      <ng-template #directory
        ><button
          data-sidebar-panel-title="Assistant"
          [xpSidebarPanelTrigger]="assistant"
          xpSidebarPanelKey="assistant:a"
          (panelActivated)="activations = activations + 1"
          (panelSelected)="selections = selections + 1"
        >
          <span>Choose assistant</span>
        </button></ng-template
      >
    </nav>
  `
})
class Host {
  mobile = false
  scope = 'organization-a'
  allowed = true
  width = 0
  activations = 0
  selections = 0
}

@Component({ standalone: true, template: '' })
class Page {}

describe('shared sidebar panel content', () => {
  let fixture: ComponentFixture<Host>
  let overlay: HTMLElement
  let resizeSidebar: () => void
  let disconnectObserver: jest.Mock
  const originalResizeObserver = globalThis.ResizeObserver
  const region = () => overlay.querySelector<HTMLElement>('[role="region"]')!
  const trigger = (title: string) =>
    fixture.nativeElement.querySelector(`[data-sidebar-panel-title="${title}"]`) as HTMLButtonElement
  const click = (title: string) => {
    trigger(title).click()
    fixture.detectChanges()
  }
  const hover = (title: string) => {
    const event = new MouseEvent('pointerover', { bubbles: true })
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })
    trigger(title).dispatchEvent(event)
  }
  it('selects only on click and emits before a directory entry is destroyed', fakeAsync(() => {
    hover('Assistant')
    tick(120)
    fixture.detectChanges()
    expect(fixture.componentInstance.selections).toBe(0)
    click('Assistant')
    expect(fixture.componentInstance.selections).toBe(1)
    click('All assistants')
    overlay.querySelector<HTMLButtonElement>('[data-sidebar-panel-title="Assistant"]')!.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.selections).toBe(2)
    expect(region().textContent).toContain('Assistant views')
  }))
  beforeEach(() => {
    disconnectObserver = jest.fn()
    globalThis.ResizeObserver = class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeSidebar = () => callback([], this)
      }
      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = disconnectObserver
    }
    TestBed.configureTestingModule({
      imports: [Host, TranslateModule.forRoot()],
      providers: [provideRouter([{ path: '**', component: Page }])]
    })
    fixture = TestBed.createComponent(Host)
    fixture.detectChanges()
    overlay = TestBed.inject(OverlayContainer).getContainerElement()
    jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200)
  })
  afterEach(() => {
    fixture.destroy()
    globalThis.ResizeObserver = originalResizeObserver
  })

  it('keeps the pinned panel beside the sidebar when its width changes without a window resize', () => {
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav')
    let width = 50
    jest.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: 900,
      width,
      height: 900,
      toJSON: () => ({})
    }))
    click('Bosi')
    region().querySelector<HTMLButtonElement>('[data-sidebar-panel-pin]')!.click()
    fixture.detectChanges()
    const shell = region()
    const pane = shell.closest<HTMLElement>('.cdk-overlay-pane')!
    const panelWidth = fixture.componentInstance.width
    expect(pane.style.marginLeft).toBe('50px')
    for (width of [287, 340, 50]) {
      resizeSidebar()
      fixture.detectChanges()
      expect(pane.style.marginLeft).toBe(`${width}px`)
      expect(region()).toBe(shell)
      expect(shell.textContent).toContain('Bosi resources')
      expect(fixture.componentInstance.width).toBe(panelWidth)
    }
    fixture.destroy()
    expect(disconnectObserver).toHaveBeenCalledTimes(1)
  })

  it('previews and switches business templates without navigating or replacing the shell', fakeAsync(() => {
    hover('Bosi')
    tick(120)
    fixture.detectChanges()
    const shell = region()
    expect(shell.textContent).toContain('Bosi resources')
    hover('Assistant')
    fixture.detectChanges()
    expect(region()).toBe(shell)
    expect(shell.textContent).toContain('Assistant views')
    expect(trigger('Bosi').getAttribute('aria-expanded')).toBe('false')
    expect(trigger('Assistant').getAttribute('aria-expanded')).toBe('true')
    expect(TestBed.inject(Router).url).toBe('/')
  }))

  it('holds pinned content on hover but accepts explicit mouse and keyboard selection', fakeAsync(() => {
    click('Bosi')
    region().querySelector<HTMLButtonElement>('[data-sidebar-panel-pin]')!.click()
    fixture.detectChanges()
    const shell = region()
    hover('Assistant')
    tick(200)
    fixture.detectChanges()
    expect(shell.textContent).toContain('Bosi resources')
    expect(fixture.componentInstance.activations).toBe(0)
    click('Assistant')
    expect(region()).toBe(shell)
    expect(shell.textContent).toContain('Assistant views')
    expect(shell.querySelector('[data-sidebar-panel-pin]')?.getAttribute('aria-pressed')).toBe('true')
    trigger('Bosi').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    fixture.detectChanges()
    expect(shell.textContent).toContain('Bosi resources')
  }))

  it('remembers search and scroll separately and clears them at the scope boundary', () => {
    click('Bosi')
    region().querySelector<HTMLButtonElement>('button')!.click()
    fixture.detectChanges()
    const field = region().querySelector('input')!
    field.value = 'recent'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    const body = region().querySelector<HTMLElement>('.overflow-y-auto')!
    body.scrollTop = 75
    click('Assistant')
    expect(region().querySelector('input')).toBeNull()
    click('Bosi')
    expect(region().querySelector('input')?.value).toBe('recent')
    expect(body.scrollTop).toBe(75)
    fixture.componentInstance.scope = 'organization-b'
    fixture.detectChanges()
    expect(region().getAttribute('aria-hidden')).toBe('true')
    expect(region().textContent).not.toContain('Bosi resources')
    click('Bosi')
    expect(region().querySelector('input')).toBeNull()
  })

  it('keeps the destination template alive after replacing an all-assistant directory', () => {
    click('All assistants')
    region().querySelector<HTMLButtonElement>('[data-sidebar-panel-title="Assistant"]')!.click()
    fixture.detectChanges()
    expect(region().getAttribute('aria-hidden')).toBe('false')
    expect(region().textContent).toContain('Assistant views')
    expect(fixture.componentInstance.activations).toBe(1)
    expect(region().querySelector('a')?.getAttribute('href')).toBe('/assistant')
    region().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(document.activeElement).toBe(trigger('All assistants'))
  })

  it('closes a floating panel after navigation and preserves a pinned one', async () => {
    click('Bosi')
    await TestBed.inject(Router).navigateByUrl('/tasks')
    fixture.detectChanges()
    expect(region().getAttribute('aria-hidden')).toBe('true')
    click('Assistant')
    region().querySelector<HTMLButtonElement>('[data-sidebar-panel-pin]')!.click()
    fixture.detectChanges()
    await TestBed.inject(Router).navigateByUrl('/assistant')
    fixture.detectChanges()
    expect(region().getAttribute('aria-hidden')).toBe('false')
  })

  it('removes visible content when its authorized primary entry disappears', () => {
    click('Assistant')
    region().querySelector<HTMLButtonElement>('[data-sidebar-panel-pin]')!.click()
    fixture.detectChanges()
    fixture.componentInstance.allowed = false
    fixture.detectChanges()
    expect(region().getAttribute('aria-hidden')).toBe('true')
    expect(region().textContent).not.toContain('Assistant views')
    expect(fixture.componentInstance.width).toBe(0)
  })

  it('uses click-only, viewport-sized mobile panels without pinning or resizing', fakeAsync(() => {
    fixture.componentInstance.mobile = true
    fixture.detectChanges()
    hover('Bosi')
    tick(200)
    fixture.detectChanges()
    expect(overlay.querySelector('[role="region"]')).toBeNull()
    click('Bosi')
    expect(region().textContent).toContain('Bosi resources')
    expect(region().querySelector('[data-sidebar-panel-pin]')).toBeNull()
    expect(region().querySelector('[role="separator"]')).toBeNull()
    expect(region().querySelector('button[aria-label="XP.ACTIONS.Close"]')).not.toBeNull()
  }))
})
