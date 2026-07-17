jest.mock('@cloud/app/@core', () => {
  const { inject } = jest.requireActual('@angular/core')

  class ViewExtensionApiService {}
  class ToastrService {}

  return {
    ViewExtensionApiService,
    ToastrService,
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error ?? '')),
    injectToastr: () => inject(ToastrService),
    injectViewExtensionApi: () => inject(ViewExtensionApiService)
  }
})

import { TestBed } from '@angular/core/testing'
import { of, Subject } from 'rxjs'
import { ToastrService, ViewExtensionApiService } from '@cloud/app/@core'
import { environment } from '@cloud/environments/environment'
import {
  XPERT_REMOTE_COMPONENT_INVOKE_CLIENT_COMMAND_MESSAGE_TYPE,
  XpertExtensionViewManifest
} from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'
import { ViewClientCommandRegistry } from '../view-client-command-registry.service'
import { ViewHostEventBus } from '../view-host-event-bus.service'

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
    createViewFileAccessSession: jest.Mock
    createViewFileAccessGrant: jest.Mock
    revokeViewFileAccessSession: jest.Mock
  }
  let registry: ViewClientCommandRegistry
  let hostEvents: ViewHostEventBus
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
      executeFileAction: jest.fn(),
      createViewFileAccessSession: jest.fn(() => of({ sessionId: 'session-1', expiresAt: '2099-01-01T00:00:00.000Z' })),
      createViewFileAccessGrant: jest.fn(() =>
        of({
          url: 'https://api.example.test/api/workspace-files/content/session-1/grant-1/video.mp4',
          expiresAt: '2099-01-01T00:00:00.000Z',
          fileName: 'video.mp4',
          mimeType: 'video/mp4',
          size: 1024
        })
      ),
      revokeViewFileAccessSession: jest.fn(() => of({ success: true }))
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
    hostEvents = TestBed.inject(ViewHostEventBus)
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

  it('does not render a remote component iframe before the entry URL is ready', async () => {
    const entry$ = new Subject<string>()
    api.getRemoteComponentEntry.mockReturnValue(entry$)

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('iframe')).toBeNull()
    expect(fixture.nativeElement.innerHTML).not.toContain('src="null"')

    entry$.next('<!doctype html><html><body></body></html>')
    entry$.complete()
    await fixture.whenStable()
    await Promise.resolve()
    fixture.detectChanges()

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    expect(frame.getAttribute('src')).toBe('blob:remote-component-entry-1')
    expect(api.getRemoteComponentEntry).toHaveBeenCalledTimes(1)
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
    expect(frame.getAttribute('allow')).toBe('autoplay')
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
        debug: {
          enabled: !environment.production,
          production: environment.production
        },
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

  it('executes declared assistant context client commands through the host registry', async () => {
    const handler = jest.fn(async () => ({ success: true, status: 'updated' }))
    registry.register('assistant.context.set', handler)

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      clientCommands: [
        ...(manifest.clientCommands ?? []),
        {
          key: 'assistant.context.set',
          label: {
            en_US: 'Set assistant context'
          }
        }
      ]
    })
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      handleClientCommandRequest(message: Record<string, unknown>): Promise<unknown>
    }
    const result = await component.handleClientCommandRequest({
      commandKey: 'assistant.context.set',
      payload: {
        key: 'docxEditor',
        env: {
          docxEditorDocumentId: 'doc-1'
        },
        context: {
          currentDocument: {
            documentId: 'doc-1'
          }
        }
      }
    })

    expect(handler).toHaveBeenCalledWith(
      {
        key: 'docxEditor',
        env: {
          docxEditorDocumentId: 'doc-1'
        },
        context: {
          currentDocument: {
            documentId: 'doc-1'
          }
        }
      },
      expect.objectContaining({
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'bom_document_intake__review'
      })
    )
    expect(result).toEqual({ success: true, status: 'updated' })
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

  it('creates one host-bound file session and grants only declared purposes', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      fileAccess: { purposes: ['preview'] }
    })
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      handleFileAccessRequest(message: Record<string, unknown>): Promise<unknown>
    }
    await expect(
      component.handleFileAccessRequest({
        fileKey: 'asset-1',
        targetId: 'project-1',
        purpose: 'preview'
      })
    ).resolves.toMatchObject({ mimeType: 'video/mp4', size: 1024 })
    await component.handleFileAccessRequest({ fileKey: 'asset-2', targetId: 'project-1', purpose: 'preview' })

    expect(api.createViewFileAccessSession).toHaveBeenCalledTimes(1)
    expect(api.createViewFileAccessSession).toHaveBeenCalledWith('agent', 'assistant-1', manifest.key)
    expect(api.createViewFileAccessGrant).toHaveBeenNthCalledWith(1, 'session-1', {
      fileKey: 'asset-1',
      targetId: 'project-1',
      purpose: 'preview'
    })
    await expect(component.handleFileAccessRequest({ fileKey: 'asset-1', purpose: 'download' })).rejects.toThrow(
      "File access purpose 'download' is not available"
    )
    expect(api.createViewFileAccessGrant).toHaveBeenCalledTimes(2)

    fixture.destroy()
    await Promise.resolve()
    expect(api.revokeViewFileAccessSession).toHaveBeenCalledWith('session-1')
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
        type: XPERT_REMOTE_COMPONENT_INVOKE_CLIENT_COMMAND_MESSAGE_TYPE,
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
    expect(frame.classList.contains('h-full')).toBe(true)
    expect(frame.style.height).toBe('')

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

  it('forwards matching host events to the remote iframe', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      hostEvents: {
        subscriptions: [
          {
            key: 'excalidraw-tool-completed',
            event: 'assistant.tool.completed',
            filter: {
              sources: ['chatkit'],
              toolNames: ['excalidraw_patch_scene']
            },
            action: {
              type: 'forward'
            }
          }
        ]
      }
    })
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const frameWindow = frame.contentWindow as Window
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined)
    postMessage.mockClear()

    hostEvents.publish({
      id: 'assistant.tool.completed:assistant-1:call-1',
      type: 'assistant.tool.completed',
      source: 'chatkit',
      receivedAt: '2026-06-18T00:00:00.000Z',
      hostType: 'agent',
      hostId: 'assistant-1',
      toolName: 'excalidraw_patch_scene',
      data: {
        input: {
          targetId: 'target-1'
        }
      }
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hostEvent',
        event: expect.objectContaining({
          type: 'assistant.tool.completed',
          source: 'chatkit',
          receivedAt: '2026-06-18T00:00:00.000Z',
          toolName: 'excalidraw_patch_scene'
        })
      }),
      '*'
    )
    expect(postMessage.mock.calls[0][0].event).not.toHaveProperty('hostType')
    expect(postMessage.mock.calls[0][0].event).not.toHaveProperty('hostId')
  })
})
