import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { ToastrService, ViewExtensionApiService } from '@cloud/app/@core'
import { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'
import { ViewClientCommandRegistry } from '../view-client-command-registry.service'

async function flushRemoteEntry(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  fixture.detectChanges()
}

async function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('RemoteComponentRendererComponent', () => {
  const manifest: XpertExtensionViewManifest = {
    key: 'bom_document_intake__review',
    title: {
      en_US: 'BOM Document Intake'
    },
    hostType: 'agent',
    slot: 'main',
    source: {
      provider: 'bom-document-intake'
    },
    view: {
      type: 'remote_component',
      component: {
        isolation: 'iframe',
        entry: 'bom-review'
      }
    },
    dataSource: {
      mode: 'platform'
    },
    clientCommands: [
      {
        key: 'assistant.chat.send_message',
        label: {
          en_US: 'Send assistant message'
        }
      }
    ]
  }

  let api: {
    getRemoteComponentEntry: jest.Mock
    getViewData: jest.Mock
    getViewParameterOptions: jest.Mock
    executeAction: jest.Mock
    executeFileAction: jest.Mock
  }
  let registry: ViewClientCommandRegistry
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined
  let objectUrlIndex: number

  beforeEach(async () => {
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    objectUrlIndex = 0
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => `blob:remote-component-entry-${++objectUrlIndex}`)
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn()
    })

    api = {
      getRemoteComponentEntry: jest.fn(() => of('<!doctype html><html><body></body></html>')),
      getViewData: jest.fn(),
      getViewParameterOptions: jest.fn(),
      executeAction: jest.fn(),
      executeFileAction: jest.fn()
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [RemoteComponentRendererComponent],
      providers: [
        {
          provide: ViewExtensionApiService,
          useValue: api
        },
        {
          provide: ToastrService,
          useValue: {
            success: jest.fn(),
            error: jest.fn()
          }
        },
        ViewClientCommandRegistry
      ]
    }).compileComponents()

    registry = TestBed.inject(ViewClientCommandRegistry)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    delete document.documentElement.dataset.theme
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL
      })
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL')
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL
      })
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
    jest.clearAllMocks()
  })

  it('keeps the remote component iframe document intact', async () => {
    const remoteHtml =
      '<!doctype html><html><head><script>window.__remote_component_probe = true</script></head><body><div id="root"></div></body></html>'
    api.getRemoteComponentEntry.mockReturnValue(of(remoteHtml))

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob
    await expect(readBlobText(blob)).resolves.toBe(remoteHtml)
    expect(frame.getAttribute('src')).toBe('blob:remote-component-entry-1')
    expect(frame.hasAttribute('srcdoc')).toBe(false)
  })

  it('allows same-origin access inside sandboxed remote component iframes', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')?.split(/\s+/).sort()).toEqual(
      ['allow-downloads', 'allow-forms', 'allow-modals', 'allow-popups', 'allow-same-origin', 'allow-scripts'].sort()
    )
  })

  it('passes the current host theme to the iframe init message', async () => {
    document.documentElement.dataset.theme = 'dark'

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined)
    const component = fixture.componentInstance as unknown as {
      handleMessage(event: Pick<MessageEvent, 'data' | 'source'>): void
    }

    component.handleMessage({
      source: frameWindow,
      data: {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        type: 'ready'
      }
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        theme: expect.objectContaining({
          mode: 'dark',
          tokens: expect.objectContaining({
            colorBackground: expect.any(String),
            colorForeground: expect.any(String)
          })
        })
      }),
      '*'
    )
  })

  it('resends init with the updated host theme when the host theme changes', async () => {
    document.documentElement.dataset.theme = 'light'

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined)
    postMessage.mockClear()

    document.documentElement.dataset.theme = 'dark'
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.detectChanges()
    await Promise.resolve()

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        theme: expect.objectContaining({
          mode: 'dark'
        })
      }),
      '*'
    )
  })

  it('executes declared client commands through the host registry', async () => {
    const handler = jest.fn(async () => ({ success: true, status: 'sent' }))
    registry.register('assistant.chat.send_message', handler)

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      handleClientCommandRequest(message: Record<string, unknown>): Promise<unknown>
    }
    const result = await component.handleClientCommandRequest({
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: '重新解析合同'
      }
    })

    expect(handler).toHaveBeenCalledWith(
      {
        text: '重新解析合同'
      },
      expect.objectContaining({
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'bom_document_intake__review'
      })
    )
    expect(result).toEqual({ success: true, status: 'sent' })
  })

  it('rejects undeclared client commands before reaching the registry', async () => {
    const handler = jest.fn()
    registry.register('assistant.chat.send_message', handler)

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      clientCommands: []
    })
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      handleClientCommandRequest(message: Record<string, unknown>): Promise<unknown>
    }
    await expect(
      component.handleClientCommandRequest({
        commandKey: 'assistant.chat.send_message',
        payload: {
          text: 'should be blocked'
        }
      })
    ).rejects.toThrow("Client command 'assistant.chat.send_message' is not available")

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores postMessage events from a different iframe source', async () => {
    const handler = jest.fn()
    registry.register('assistant.chat.send_message', handler)

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      instanceId(): string
      handleMessage(event: Pick<MessageEvent, 'data' | 'source'>): void
    }
    component.handleMessage({
      source: window,
      data: {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: component.instanceId(),
        type: 'invokeClientCommand',
        requestId: 'request-1',
        commandKey: 'assistant.chat.send_message',
        payload: {
          text: 'blocked source'
        }
      }
    })

    expect(handler).not.toHaveBeenCalled()
  })

  it('caps iframe resize messages to the visible viewport only when requested', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    jest.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 100,
      toJSON: () => ({})
    } as DOMRect)
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800
    })

    const component = fixture.componentInstance as unknown as {
      instanceId(): string
      height(): number
      handleMessage(event: Pick<MessageEvent, 'data' | 'source'>): void
    }
    component.handleMessage({
      source: frame.contentWindow,
      data: {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: component.instanceId(),
        type: 'resize',
        height: 2000
      }
    })
    expect(component.height()).toBe(2000)

    component.handleMessage({
      source: frame.contentWindow,
      data: {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: component.instanceId(),
        type: 'resize',
        height: 2000,
        viewportBound: true
      }
    })
    expect(component.height()).toBe(676)
  })

  it('fills the available host height for single-view workspace renderers', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('fillAvailableHeight', true)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    jest.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 100,
      toJSON: () => ({})
    } as DOMRect)
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800
    })

    const component = fixture.componentInstance as unknown as {
      instanceId(): string
      height(): number
      handleMessage(event: Pick<MessageEvent, 'data' | 'source'>): void
    }

    component.handleMessage({
      source: frame.contentWindow,
      data: {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: component.instanceId(),
        type: 'resize',
        height: 560
      }
    })
    expect(component.height()).toBe(676)

    component.handleMessage({
      source: frame.contentWindow,
      data: {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: component.instanceId(),
        type: 'resize',
        height: 2000
      }
    })
    expect(component.height()).toBe(676)
  })
})
