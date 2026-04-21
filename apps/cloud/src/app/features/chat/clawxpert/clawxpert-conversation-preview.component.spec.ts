jest.mock('../../../@core', () => ({
  SandboxService: class SandboxService {},
  getErrorMessage: (error: { message?: string } | null | undefined) => error?.message ?? '',
  injectToastr: () => ({
    danger: jest.fn(),
    warning: jest.fn()
  })
}))

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

describe('ClawXpertConversationPreviewComponent', () => {
  let sandboxService: {
    listManagedServices: jest.Mock
    createManagedServicePreviewSession: jest.Mock
    getManagedServiceLogs: jest.Mock
    restartManagedService: jest.Mock
    stopManagedService: jest.Mock
  }

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
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads managed services and emits element references selected in inspect mode', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationPreviewComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    await settle(fixture)

    expect(sandboxService.listManagedServices).toHaveBeenCalledWith('conversation-1')
    expect(sandboxService.createManagedServicePreviewSession).toHaveBeenCalledWith('conversation-1', 'service-1')
    expect(fixture.componentInstance.selectedServiceId()).toBe('service-1')

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
