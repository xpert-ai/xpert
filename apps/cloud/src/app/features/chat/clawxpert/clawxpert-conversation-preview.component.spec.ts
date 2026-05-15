jest.mock('../../../@core', () => ({
  SandboxService: class SandboxService {},
  getErrorMessage: (error: { message?: string } | null | undefined) => error?.message ?? '',
  injectApiBaseUrl: () => 'http://localhost:3000',
  injectToastr: () => ({
    danger: jest.fn(),
    warning: jest.fn()
  })
}))

import { OverlayContainer } from '@angular/cdk/overlay'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { SandboxService } from '../../../@core'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  fixture.detectChanges()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  fixture.detectChanges()
}

async function nextAnimationFrame() {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

async function openFirstLocalService(fixture: { nativeElement: HTMLElement; detectChanges: () => void }) {
  const serviceCard = fixture.nativeElement.querySelector(
    '[data-local-service-card="service-1"]'
  ) as HTMLButtonElement | null
  expect(serviceCard).not.toBeNull()
  serviceCard?.click()
  fixture.detectChanges()
  await Promise.resolve()
  await Promise.resolve()
  fixture.detectChanges()
}

function dispatchMouse(target: EventTarget, type: string, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY
    })
  )
}

describe('ClawXpertConversationPreviewComponent', () => {
  let sandboxService: {
    listManagedServices: jest.Mock
    createManagedServicePreviewSession: jest.Mock
    getManagedServiceLogs: jest.Mock
    restartManagedService: jest.Mock
    stopManagedService: jest.Mock
  }
  let overlayContainer: OverlayContainer

  beforeEach(async () => {
    sandboxService = {
      listManagedServices: jest.fn(() =>
        of([
          {
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            requestedPort: 4173,
            actualPort: 4173,
            previewPath: '/',
            previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/',
            status: 'running',
            transportMode: 'http'
          }
        ])
      ),
      createManagedServicePreviewSession: jest.fn(() =>
        of({
          expiresAt: '2026-04-20T13:00:00.000Z',
          previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
        })
      ),
      getManagedServiceLogs: jest.fn(() =>
        of({
          stdout: '',
          stderr: ''
        })
      ),
      restartManagedService: jest.fn(() => of(null)),
      stopManagedService: jest.fn(() => of(null))
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertConversationPreviewComponent],
      providers: [
        {
          provide: SandboxService,
          useValue: sandboxService
        }
      ]
    }).compileComponents()

    overlayContainer = TestBed.inject(OverlayContainer)
  })

  afterEach(() => {
    overlayContainer.ngOnDestroy()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('shows local services before opening a browser iframe', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)

    expect(sandboxService.listManagedServices).toHaveBeenCalledWith('conversation-1')
    expect(sandboxService.createManagedServicePreviewSession).not.toHaveBeenCalled()
    expect(fixture.componentInstance.selectedServiceId()).toBe(null)
    expect(fixture.nativeElement.textContent).toContain('web')
    expect(fixture.nativeElement.textContent).toContain('localhost:4173')
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull()
  })

  it('opens a local service from the address bar', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)

    await fixture.componentInstance.navigateToAddress('localhost:4173')
    await settle(fixture)

    expect(sandboxService.createManagedServicePreviewSession).toHaveBeenCalledWith('conversation-1', 'service-1')
    expect(fixture.componentInstance.selectedServiceId()).toBe('service-1')
    expect(fixture.componentInstance.displayUrl()).toBe('localhost:4173')

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    if (!iframe) {
      throw new Error('Expected preview iframe to be rendered for a running service.')
    }
    expect(iframe.src).toBe('http://localhost:3000/api/sandbox/conversations/conversation-1/services/service-1/proxy/')
  })

  it('updates front-end browser toolbar state', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    const component = fixture.componentInstance
    expect(component.zoomLevel()).toBe(100)

    component.zoomIn()
    expect(component.zoomLevel()).toBe(110)

    component.zoomOut()
    expect(component.zoomLevel()).toBe(100)

    component.toggleDeviceToolbar()
    expect(component.deviceToolbar()).toBe(true)

    const reloadBefore = component.reloadNonce()
    component.clearCache()
    expect(component.cacheBustNonce()).toBeGreaterThan(0)
    expect(component.reloadNonce()).toBeGreaterThan(reloadBefore)
  })

  it('renders a responsive device toolbar with viewport controls', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    const component = fixture.componentInstance
    expect(fixture.nativeElement.querySelector('[data-device-toolbar]')).toBeNull()

    component.toggleDeviceToolbar()
    fixture.detectChanges()

    const toolbar = fixture.nativeElement.querySelector('[data-device-toolbar]') as HTMLElement | null
    const widthInput = fixture.nativeElement.querySelector('[data-device-width]') as HTMLInputElement | null
    const heightInput = fixture.nativeElement.querySelector('[data-device-height]') as HTMLInputElement | null
    const viewport = fixture.nativeElement.querySelector('[data-device-viewport]') as HTMLElement | null

    expect(toolbar).not.toBeNull()
    expect(toolbar?.textContent).toContain('PAC.Chat.ClawXpert.Responsive')
    expect(widthInput?.value).toBe('405')
    expect(heightInput?.value).toBe('506')
    expect(viewport?.style.width).toBe('405px')
    expect(viewport?.style.height).toBe('506px')
    ;(fixture.nativeElement.querySelector('[data-device-rotate]') as HTMLButtonElement).click()
    fixture.detectChanges()

    expect(widthInput?.value).toBe('506')
    expect(heightInput?.value).toBe('405')
    expect(viewport?.style.width).toBe('506px')
    expect(viewport?.style.height).toBe('405px')
    ;(fixture.nativeElement.querySelector('[data-device-toolbar-close]') as HTMLButtonElement).click()
    fixture.detectChanges()

    expect(component.deviceToolbar()).toBe(false)
    expect(fixture.nativeElement.querySelector('[data-device-toolbar]')).toBeNull()
  })

  it('applies fixed device presets from the device toolbar menu', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    fixture.componentInstance.toggleDeviceToolbar()
    fixture.detectChanges()
    ;(fixture.nativeElement.querySelector('[data-device-preset-trigger]') as HTMLButtonElement).click()
    fixture.detectChanges()
    await Promise.resolve()
    fixture.detectChanges()

    const preset = overlayContainer
      .getContainerElement()
      .querySelector('[data-device-preset="iphone-15-pro-max"]') as HTMLButtonElement | null
    expect(preset).not.toBeNull()

    preset?.click()
    fixture.detectChanges()

    const widthInput = fixture.nativeElement.querySelector('[data-device-width]') as HTMLInputElement | null
    const heightInput = fixture.nativeElement.querySelector('[data-device-height]') as HTMLInputElement | null
    const viewport = fixture.nativeElement.querySelector('[data-device-viewport]') as HTMLElement | null

    expect(widthInput?.value).toBe('430')
    expect(heightInput?.value).toBe('932')
    expect(viewport?.style.width).toBe('430px')
    expect(viewport?.style.height).toBe('932px')
  })

  it('resizes the device viewport by dragging edge handles', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    fixture.componentInstance.toggleDeviceToolbar()
    fixture.detectChanges()

    const widthHandle = fixture.nativeElement.querySelector('[data-device-resize-width]') as HTMLElement | null
    const heightHandle = fixture.nativeElement.querySelector('[data-device-resize-height]') as HTMLElement | null
    expect(widthHandle).not.toBeNull()
    expect(heightHandle).not.toBeNull()

    if (!widthHandle || !heightHandle) {
      throw new Error('Expected device resize handles to be rendered.')
    }

    dispatchMouse(widthHandle, 'mousedown', 100, 100)
    dispatchMouse(document, 'mousemove', 60, 100)
    dispatchMouse(document, 'mouseup', 60, 100)
    fixture.detectChanges()

    expect((fixture.nativeElement.querySelector('[data-device-width]') as HTMLInputElement | null)?.value).toBe('445')

    dispatchMouse(heightHandle, 'mousedown', 100, 100)
    dispatchMouse(document, 'mousemove', 100, 130)
    dispatchMouse(document, 'mouseup', 100, 130)
    fixture.detectChanges()

    const viewport = fixture.nativeElement.querySelector('[data-device-viewport]') as HTMLElement | null
    expect((fixture.nativeElement.querySelector('[data-device-height]') as HTMLInputElement | null)?.value).toBe('536')
    expect(viewport?.style.width).toBe('445px')
    expect(viewport?.style.height).toBe('536px')
  })

  it('labels browser menu toggles with show and hide states', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)
    ;(fixture.nativeElement.querySelector('[data-browser-menu]') as HTMLButtonElement).click()
    fixture.detectChanges()
    await Promise.resolve()
    fixture.detectChanges()

    expect(overlayContainer.getContainerElement().textContent).toContain('PAC.Chat.ClawXpert.ShowDeviceToolbar')
    expect(overlayContainer.getContainerElement().textContent).toContain('PAC.Chat.ClawXpert.ShowLogs')

    fixture.componentInstance.toggleDeviceToolbar()
    fixture.componentInstance.toggleLogs()
    fixture.detectChanges()
    await Promise.resolve()
    fixture.detectChanges()

    expect(overlayContainer.getContainerElement().textContent).toContain('PAC.Chat.ClawXpert.HideDeviceToolbar')
    expect(overlayContainer.getContainerElement().textContent).toContain('PAC.Chat.ClawXpert.HideLogs')
  })

  it('loads managed services and emits element references selected in inspect mode', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    if (!iframe) {
      throw new Error('Expected preview iframe to be rendered for a running service.')
    }

    const previewDocument = document
    const button = previewDocument.createElement('button')
    button.id = 'hero-cta'
    button.setAttribute('data-testid', 'hero-cta')
    button.textContent = 'Launch'
    Object.defineProperty(button, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 50,
        height: 30,
        left: 10,
        right: 130,
        toJSON: () => undefined,
        top: 20,
        width: 120,
        x: 10,
        y: 20
      })
    })
    const previousTitle = previewDocument.title
    try {
      previewDocument.title = 'Preview Page'
      previewDocument.body.appendChild(button)
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: previewDocument
      })

      const emitted: unknown[] = []
      fixture.componentInstance.referenceRequest.subscribe((value) => {
        emitted.push(value)
      })

      fixture.componentInstance.toggleInspectMode()
      fixture.componentInstance.handleFrameLoad()

      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(emitted).toEqual([
        {
          attributes: [
            {
              name: 'id',
              value: 'hero-cta'
            },
            {
              name: 'data-testid',
              value: 'hero-cta'
            }
          ],
          label: 'button "Launch"',
          outerHtml: '<button id="hero-cta" data-testid="hero-cta">Launch</button>',
          pageTitle: 'Preview Page',
          pageUrl: document.location.href,
          selector: '#hero-cta',
          serviceId: 'service-1',
          tagName: 'button',
          text: 'Launch',
          type: 'element'
        }
      ])
      expect(fixture.componentInstance.activeOverlay()).toEqual(
        expect.objectContaining({
          label: 'button "Launch"',
          left: 10,
          top: 20,
          width: 120
        })
      )
    } finally {
      button.remove()
      previewDocument.title = previousTitle
    }
  })

  it('repositions the selected overlay when the preview page scrolls', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    if (!iframe) {
      throw new Error('Expected preview iframe to be rendered for a running service.')
    }

    const previewDocument = document
    const button = previewDocument.createElement('button')
    button.id = 'scroll-target'
    button.textContent = 'Scroll target'
    const rectState = {
      bottom: 50,
      height: 30,
      left: 10,
      right: 130,
      top: 20,
      width: 120,
      x: 10,
      y: 20
    }
    Object.defineProperty(button, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        ...rectState,
        toJSON: () => undefined
      })
    })
    const previousTitle = previewDocument.title
    try {
      previewDocument.title = 'Preview Page'
      previewDocument.body.appendChild(button)
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: previewDocument
      })

      fixture.componentInstance.toggleInspectMode()
      fixture.componentInstance.handleFrameLoad()
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(fixture.componentInstance.activeOverlay()).toEqual(
        expect.objectContaining({
          left: 10,
          top: 20
        })
      )

      rectState.left = 30
      rectState.right = 150
      rectState.top = 140
      rectState.bottom = 170
      rectState.x = 30
      rectState.y = 140
      previewDocument.dispatchEvent(new Event('scroll'))

      expect(fixture.componentInstance.activeOverlay()).toEqual(
        expect.objectContaining({
          left: 30,
          top: 140
        })
      )
    } finally {
      button.remove()
      previewDocument.title = previousTitle
    }
  })

  it('keeps the selected overlay in sync with layout changes between animation frames', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    if (!iframe) {
      throw new Error('Expected preview iframe to be rendered for a running service.')
    }

    const previewDocument = document
    const button = previewDocument.createElement('button')
    button.id = 'layout-target'
    button.textContent = 'Layout target'
    const rectState = {
      bottom: 70,
      height: 30,
      left: 40,
      right: 160,
      top: 40,
      width: 120,
      x: 40,
      y: 40
    }
    Object.defineProperty(button, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        ...rectState,
        toJSON: () => undefined
      })
    })
    const previousTitle = previewDocument.title
    try {
      previewDocument.title = 'Preview Page'
      previewDocument.body.appendChild(button)
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: previewDocument
      })

      fixture.componentInstance.toggleInspectMode()
      fixture.componentInstance.handleFrameLoad()
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(fixture.componentInstance.activeOverlay()).toEqual(
        expect.objectContaining({
          left: 40,
          top: 40
        })
      )

      rectState.left = 120
      rectState.right = 240
      rectState.top = 180
      rectState.bottom = 210
      rectState.x = 120
      rectState.y = 180

      await nextAnimationFrame()

      expect(fixture.componentInstance.activeOverlay()).toEqual(
        expect.objectContaining({
          left: 120,
          top: 180
        })
      )
    } finally {
      button.remove()
      previewDocument.title = previousTitle
    }
  })

  it('ignores blocked frame window access while destroying preview listeners', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)
    await openFirstLocalService(fixture)

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    if (!iframe) {
      throw new Error('Expected preview iframe to be rendered for a running service.')
    }

    const previewDocument = document
    const button = previewDocument.createElement('button')
    button.id = 'cleanup-target'
    button.textContent = 'Cleanup target'
    Object.defineProperty(button, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 70,
        height: 30,
        left: 40,
        right: 160,
        toJSON: () => undefined,
        top: 40,
        width: 120,
        x: 40,
        y: 40
      })
    })

    try {
      previewDocument.body.appendChild(button)
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: previewDocument
      })

      fixture.componentInstance.toggleInspectMode()
      fixture.componentInstance.handleFrameLoad()
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      const removeSpy = jest.spyOn(window, 'removeEventListener').mockImplementation(() => {
        throw new DOMException('Blocked a frame with origin from accessing a cross-origin frame.', 'SecurityError')
      })
      const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
        throw new DOMException('Blocked a frame with origin from accessing a cross-origin frame.', 'SecurityError')
      })

      try {
        expect(() => fixture.componentInstance.ngOnDestroy()).not.toThrow()
      } finally {
        removeSpy.mockRestore()
        cancelSpy.mockRestore()
      }
    } finally {
      button.remove()
    }
  })

  it('does not render a preview iframe for failed services', async () => {
    sandboxService.listManagedServices.mockReturnValueOnce(
      of([
        {
          id: 'service-1',
          conversationId: 'conversation-1',
          provider: 'local-shell-sandbox',
          name: 'web',
          command: 'python -m http.server 8000',
          workingDirectory: '/workspace/project-1',
          requestedPort: 8000,
          actualPort: 8000,
          status: 'failed',
          transportMode: 'http',
          previewUrl: null
        }
      ])
    )

    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)

    expect(sandboxService.createManagedServicePreviewSession).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull()
  })
})
