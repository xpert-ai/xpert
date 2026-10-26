import { OverlayContainer } from '@angular/cdk/overlay'
import { Component } from '@angular/core'
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing'
import { Router, RouterLink, provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { CloudSidebarHoverPanelDirective, SIDEBAR_PANEL_WIDTH_STORAGE_KEY } from './cloud-sidebar-hover-panel.directive'

@Component({
  standalone: true,
  imports: [CloudSidebarHoverPanelDirective, RouterLink],
  template: `
    <nav
      [xpSidebarHoverPanel]="collapsed && !mobile && enabled"
      (pinnedPanelWidthChange)="pinnedWidth = $event"
      (panelResizingChange)="resizing = $event"
    >
      <button data-sidebar-panel-title="Tasks" (click)="clicks = clicks + 1"><i>Tasks</i></button>
      <button data-sidebar-panel-title="Projects" routerLink="/projects">Projects</button>
      <button>Account</button>
    </nav>
    <main [style.padding-left.px]="pinnedWidth">Main content</main>
  `
})
class SidebarHostComponent {
  collapsed = true
  mobile = false
  enabled = true
  pinnedWidth = 0
  resizing = false
  clicks = 0
}

describe('CloudSidebarHoverPanelDirective', () => {
  let fixture: ComponentFixture<SidebarHostComponent>
  let container: HTMLElement
  let tasks: HTMLButtonElement
  let projects: HTMLButtonElement

  function pointer(target: Element, type: string, relatedTarget: EventTarget | null = null, pointerType = 'mouse') {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    target.dispatchEvent(event)
  }

  function panel(): HTMLElement | null {
    return container.querySelector('[role="region"]')
  }

  function open() {
    pointer(tasks, 'pointerover')
    tick(120)
    fixture.detectChanges()
    return panel()!
  }

  function mountSidebar() {
    fixture = TestBed.createComponent(SidebarHostComponent)
    fixture.detectChanges()
    container = TestBed.inject(OverlayContainer).getContainerElement()
    tasks = fixture.nativeElement.querySelector('[data-sidebar-panel-title="Tasks"]')
    projects = fixture.nativeElement.querySelector('[data-sidebar-panel-title="Projects"]')
    jest.spyOn(fixture.nativeElement.querySelector('nav'), 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 56,
      bottom: 900,
      width: 56,
      height: 900,
      toJSON: () => ({})
    })
  }

  function resizePointer(target: EventTarget, type: string, clientX: number, pointerId = 7) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 })
    Object.defineProperty(event, 'pointerId', { value: pointerId })
    target.dispatchEvent(event)
  }

  function pinAndGetHandle() {
    const region = open()
    region.querySelector<HTMLButtonElement>('[data-sidebar-panel-pin]')!.click()
    fixture.detectChanges()
    const handle = region.querySelector<HTMLButtonElement>('[role="separator"]')!
    Object.defineProperties(handle, {
      setPointerCapture: { value: jest.fn() },
      hasPointerCapture: { value: jest.fn(() => true) },
      releasePointerCapture: { value: jest.fn() }
    })
    return handle
  }

  beforeEach(() => {
    localStorage.removeItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY)
    TestBed.configureTestingModule({
      imports: [SidebarHostComponent, TranslateModule.forRoot()],
      providers: [provideRouter([{ path: 'projects', component: SidebarHostComponent }])]
    })
    jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200)
    jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(900)
    mountSidebar()
  })

  afterEach(() => {
    fixture.destroy()
    localStorage.removeItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY)
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
  })

  it('reuses the same panel and stable geometry when moving between main menus', fakeAsync(() => {
    const firstPanel = open()
    const pane = container.querySelector<HTMLElement>('.cdk-overlay-pane')!
    const geometry = [pane.style.marginLeft, pane.style.marginTop, pane.style.width, pane.style.height]
    expect(firstPanel.getAttribute('aria-hidden')).toBe('false')
    expect(firstPanel.querySelector('h2')?.textContent?.trim()).toBe('Tasks')
    pointer(tasks, 'pointerout', projects)
    pointer(projects, 'pointerover', tasks)
    fixture.detectChanges()
    tick(300)
    fixture.detectChanges()
    expect(panel()).toBe(firstPanel)
    expect(panel()?.querySelector('h2')?.textContent?.trim()).toBe('Projects')
    expect(panel()?.getAttribute('aria-hidden')).toBe('false')
    expect([pane.style.marginLeft, pane.style.marginTop, pane.style.width, pane.style.height]).toEqual(geometry)
    expect(pane.style.width).toBe('264px')
    expect(pane.style.height).toBe('892px')
    expect(container.querySelectorAll('.cdk-overlay-pane')).toHaveLength(1)
    expect(container.querySelector('.cdk-overlay-backdrop')).toBeNull()
  }))

  it('cancels brief flyovers and does not restart on child icon transitions', fakeAsync(() => {
    pointer(tasks, 'pointerover')
    tick(50)
    pointer(tasks, 'pointerout')
    tick(300)
    expect(panel()).toBeNull()
    pointer(tasks, 'pointerover')
    tick(80)
    pointer(tasks.querySelector('i')!, 'pointerover', tasks)
    tick(40)
    fixture.detectChanges()
    expect(panel()?.getAttribute('aria-hidden')).toBe('false')
  }))

  it('bridges the gap into the panel and closes only after leaving both areas', fakeAsync(() => {
    const region = open()
    pointer(tasks, 'pointerout')
    tick(100)
    pointer(region, 'pointerenter')
    tick(300)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('false')
    pointer(region, 'pointerleave')
    tick(179)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('false')
    tick(1)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('true')
    expect(region.hasAttribute('inert')).toBe(true)
    expect(region.classList.contains('pointer-events-none')).toBe(true)
    expect(open()).toBe(region)
  }))

  it('supports keyboard entry, keeps focused content open and restores focus on Escape', fakeAsync(() => {
    tasks.focus()
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    tasks.dispatchEvent(key)
    fixture.detectChanges()
    expect(key.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(panel()?.querySelector('button'))
    pointer(tasks, 'pointerout')
    tick(300)
    fixture.detectChanges()
    expect(panel()?.getAttribute('aria-hidden')).toBe('false')
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(panel()?.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(tasks)
  }))

  it('opens and focuses search, clears input and uses Escape to leave search before closing the panel', fakeAsync(() => {
    const region = open()
    const searchButton = region.querySelector('header button') as HTMLButtonElement
    searchButton.click()
    fixture.detectChanges()
    const input = region.querySelector('input')!
    expect(document.activeElement).toBe(input)
    expect(searchButton.getAttribute('aria-expanded')).toBe('true')
    input.value = 'meeting'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    const clearButton = region.querySelector('z-search-input button') as HTMLButtonElement
    clearButton.click()
    fixture.detectChanges()
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(region.querySelector('z-search-input button')).toBeNull()
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(region.querySelector('input')).toBeNull()
    expect(region.getAttribute('aria-hidden')).toBe('false')
    expect(document.activeElement).toBe(searchButton)
    searchButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(tasks)
  }))

  it('resets the search when switching menus without recreating the panel', fakeAsync(() => {
    const region = open()
    const searchButton = region.querySelector('header button') as HTMLButtonElement
    searchButton.click()
    fixture.detectChanges()
    const input = region.querySelector('input')!
    input.value = 'task query'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    pointer(projects, 'pointerover', tasks)
    fixture.detectChanges()
    expect(panel()).toBe(region)
    expect(region.querySelector('h2')?.textContent?.trim()).toBe('Projects')
    expect(region.querySelector('input')).toBeNull()
    searchButton.click()
    fixture.detectChanges()
    expect(region.querySelector('input')?.value).toBe('')
  }))

  it('pins the same panel, reserves page space, and keeps it open across outside interaction and navigation', fakeAsync(() => {
    const region = open()
    const pane = container.querySelector<HTMLElement>('.cdk-overlay-pane')!
    const floatingGeometry = [pane.style.marginLeft, pane.style.marginTop, pane.style.width, pane.style.height]
    const right = parseFloat(pane.style.marginLeft) + parseFloat(pane.style.width)
    const pin = region.querySelector('[data-sidebar-panel-pin]') as HTMLButtonElement
    pin.click()
    fixture.detectChanges()
    expect(pin.getAttribute('aria-pressed')).toBe('true')
    expect(fixture.componentInstance.pinnedWidth).toBe(268)
    expect(fixture.nativeElement.querySelector('main').style.paddingLeft).toBe('268px')
    expect(pane.style.marginLeft).toBe('56px')
    expect(pane.style.marginTop).toBe('0px')
    expect(pane.style.height).toBe('900px')
    expect(parseFloat(pane.style.marginLeft) + parseFloat(pane.style.width)).toBe(right)
    expect(parseFloat(pane.style.width)).toBe(fixture.componentInstance.pinnedWidth)
    expect(fixture.componentInstance.collapsed).toBe(true)
    pointer(tasks, 'pointerout')
    pointer(document.body, 'pointerdown')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    void TestBed.inject(Router).navigateByUrl('/projects')
    tick(300)
    fixture.detectChanges()
    expect(panel()).toBe(region)
    expect(region.getAttribute('aria-hidden')).toBe('false')
    pointer(projects, 'pointerover', tasks)
    fixture.detectChanges()
    expect(region.querySelector('h2')?.textContent?.trim()).toBe('Tasks')
    expect(pin.getAttribute('aria-pressed')).toBe('true')
    pin.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.pinnedWidth).toBe(0)
    expect([pane.style.marginLeft, pane.style.marginTop, pane.style.width, pane.style.height]).toEqual(floatingGeometry)
    expect(pin.getAttribute('aria-pressed')).toBe('false')
    pointer(region, 'pointerleave')
    tick(180)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('true')
  }))

  it('preserves the pinned menu and search while hovering other menus, then resumes switching after unpinning', fakeAsync(() => {
    const region = open()
    const pin = region.querySelector('[data-sidebar-panel-pin]') as HTMLButtonElement
    pin.click()
    const searchButton = region.querySelector('header button') as HTMLButtonElement
    searchButton.click()
    fixture.detectChanges()
    const input = region.querySelector('input')!
    input.value = 'task query'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    pointer(region, 'pointerleave')
    pointer(projects, 'pointerover')
    tick(300)
    fixture.detectChanges()
    expect(panel()).toBe(region)
    expect(region.querySelector('h2')?.textContent?.trim()).toBe('Tasks')
    expect(region.querySelector('input')).toBe(input)
    expect(input.value).toBe('task query')
    expect(tasks.classList.contains('bg-hover-bg')).toBe(true)
    expect(projects.classList.contains('bg-hover-bg')).toBe(false)
    expect(fixture.componentInstance.pinnedWidth).toBe(268)

    pointer(projects, 'pointerout', region)
    pointer(region, 'pointerenter', projects)
    pin.click()
    fixture.detectChanges()
    pointer(region, 'pointerleave', projects)
    pointer(projects, 'pointerover', region)
    tick(300)
    fixture.detectChanges()
    expect(panel()).toBe(region)
    expect(region.querySelector('h2')?.textContent?.trim()).toBe('Projects')
    expect(region.querySelector('input')).toBeNull()
    expect(tasks.classList.contains('bg-hover-bg')).toBe(false)
    expect(projects.classList.contains('bg-hover-bg')).toBe(true)
    expect(fixture.componentInstance.pinnedWidth).toBe(0)
  }))

  it('releases pinned space when the sidebar is hidden or expanded', fakeAsync(() => {
    const region = open()
    const pin = region.querySelector('[data-sidebar-panel-pin]') as HTMLButtonElement
    pin.click()
    fixture.detectChanges()
    fixture.componentInstance.enabled = false
    fixture.detectChanges()
    expect(fixture.componentInstance.pinnedWidth).toBe(0)
    expect(region.getAttribute('aria-hidden')).toBe('true')
    fixture.componentInstance.enabled = true
    fixture.detectChanges()
    open()
    expect(pin.getAttribute('aria-pressed')).toBe('false')
    pin.click()
    fixture.detectChanges()
    fixture.componentInstance.collapsed = false
    fixture.detectChanges()
    expect(fixture.componentInstance.pinnedWidth).toBe(0)
    expect(region.getAttribute('aria-hidden')).toBe('true')
  }))

  it('resizes only while pinned, persists the width, and restores it for both modes after remounting', fakeAsync(() => {
    expect(open().querySelector('[role="separator"]')).toBeNull()
    const handle = pinAndGetHandle()
    resizePointer(handle, 'pointerdown', 324)
    expect(fixture.componentInstance.resizing).toBe(true)
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7)
    resizePointer(document, 'pointermove', 700, 8)
    expect(fixture.componentInstance.pinnedWidth).toBe(268)
    resizePointer(document, 'pointermove', 416)
    fixture.detectChanges()
    expect(fixture.componentInstance.pinnedWidth).toBe(360)
    expect(handle.getAttribute('aria-valuenow')).toBe('360')
    expect(localStorage.getItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    resizePointer(document, 'pointerup', 416)
    expect(fixture.componentInstance.resizing).toBe(false)
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(localStorage.getItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY)).toBe('360')

    fixture.destroy()
    mountSidebar()
    const region = open()
    expect(container.querySelector<HTMLElement>('.cdk-overlay-pane')!.style.width).toBe('356px')
    expect(region.querySelector('[role="separator"]')).toBeNull()
    pinAndGetHandle()
    expect(fixture.componentInstance.pinnedWidth).toBe(360)
    region.querySelector<HTMLButtonElement>('[data-sidebar-panel-pin]')!.click()
    fixture.detectChanges()
    expect(region.querySelector('[role="separator"]')).toBeNull()
  }))

  it('supports keyboard width bounds and preserves the preference when the viewport shrinks', fakeAsync(() => {
    const handle = pinAndGetHandle()
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
    expect(fixture.componentInstance.pinnedWidth).toBe(300)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(fixture.componentInstance.pinnedWidth).toBe(480)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(fixture.componentInstance.pinnedWidth).toBe(480)
    jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(768)
    window.dispatchEvent(new Event('resize'))
    fixture.detectChanges()
    expect(fixture.componentInstance.pinnedWidth).toBe(392)
    expect(handle.getAttribute('aria-valuemax')).toBe('392')
    expect(localStorage.getItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY)).toBe('480')
    jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200)
    window.dispatchEvent(new Event('resize'))
    expect(fixture.componentInstance.pinnedWidth).toBe(480)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(fixture.componentInstance.pinnedWidth).toBe(240)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(fixture.componentInstance.pinnedWidth).toBe(240)
    expect(localStorage.getItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY)).toBe('240')
  }))

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'disable', 'destroy'])(
    'cleans up an active resize on %s',
    fakeAsync((reason: string) => {
      const handle = pinAndGetHandle()
      const previousCursor = document.body.style.cursor
      const previousSelection = document.body.style.userSelect
      resizePointer(handle, 'pointerdown', 324)
      resizePointer(document, 'pointermove', 400)
      if (reason === 'disable') {
        fixture.componentInstance.enabled = false
        fixture.detectChanges()
      } else if (reason === 'destroy') fixture.destroy()
      else if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      else resizePointer(reason === 'lostpointercapture' ? handle : document, reason, 400)
      expect(fixture.componentInstance.resizing).toBe(false)
      expect(document.body.style.cursor).toBe(previousCursor)
      expect(document.body.style.userSelect).toBe(previousSelection)
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(7)
      const width = fixture.componentInstance.pinnedWidth
      resizePointer(document, 'pointermove', 800)
      expect(fixture.componentInstance.pinnedWidth).toBe(width)
    })
  )

  it('falls back for invalid saved widths and still resizes when storage is unavailable', fakeAsync(() => {
    fixture.destroy()
    localStorage.setItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY, 'invalid')
    mountSidebar()
    pinAndGetHandle()
    expect(fixture.componentInstance.pinnedWidth).toBe(268)
    fixture.destroy()
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    mountSidebar()
    const handle = pinAndGetHandle()
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(fixture.componentInstance.pinnedWidth).toBe(284)
  }))

  it('resumes hover dismissal after a pointer unpin but preserves keyboard focus', fakeAsync(() => {
    const region = open()
    const pin = region.querySelector('[data-sidebar-panel-pin]') as HTMLButtonElement
    pin.focus()
    pin.click()
    fixture.detectChanges()
    pin.click()
    fixture.detectChanges()
    expect(document.activeElement).toBe(pin)
    pin.click()
    fixture.detectChanges()
    pin.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    fixture.detectChanges()
    expect(document.activeElement).not.toBe(pin)
    pointer(region, 'pointerleave')
    tick(180)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('true')
    expect(fixture.componentInstance.pinnedWidth).toBe(0)
  }))

  it('closes on outside press and preserves existing clicks and routing', fakeAsync(() => {
    open()
    pointer(document.body, 'pointerdown')
    fixture.detectChanges()
    expect(panel()?.getAttribute('aria-hidden')).toBe('true')
    open()
    tasks.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.clicks).toBe(1)
    expect(panel()?.getAttribute('aria-hidden')).toBe('true')
    open()
    projects.click()
    tick()
    fixture.detectChanges()
    expect(TestBed.inject(Router).url).toBe('/projects')
    expect(panel()?.getAttribute('aria-hidden')).toBe('true')
  }))

  it('closes on navigation without a trigger click', fakeAsync(() => {
    open()
    void TestBed.inject(Router).navigateByUrl('/projects')
    tick()
    fixture.detectChanges()
    expect(panel()?.getAttribute('aria-hidden')).toBe('true')
  }))

  it('ignores touch, expanded/mobile layouts and unmarked buttons', fakeAsync(() => {
    pointer(tasks, 'pointerover', null, 'touch')
    tick(200)
    expect(panel()).toBeNull()
    pointer(fixture.nativeElement.querySelector('button:last-child'), 'pointerover')
    tick(200)
    expect(panel()).toBeNull()
    fixture.componentInstance.collapsed = false
    fixture.detectChanges()
    pointer(tasks, 'pointerover')
    tick(200)
    expect(panel()).toBeNull()
    fixture.componentInstance.collapsed = true
    fixture.componentInstance.mobile = true
    fixture.detectChanges()
    pointer(tasks, 'pointerover')
    tick(200)
    expect(panel()).toBeNull()
  }))

  it('cancels a pending open when the sidebar expands and disposes the portal on destruction', fakeAsync(() => {
    pointer(tasks, 'pointerover')
    fixture.componentInstance.collapsed = false
    fixture.detectChanges()
    tick(300)
    expect(panel()).toBeNull()
    fixture.componentInstance.collapsed = true
    fixture.detectChanges()
    open()
    pointer(tasks, 'pointerout')
    fixture.destroy()
    tick(300)
    expect(container.querySelector('.cdk-overlay-pane')).toBeNull()
  }))
})
