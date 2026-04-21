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
