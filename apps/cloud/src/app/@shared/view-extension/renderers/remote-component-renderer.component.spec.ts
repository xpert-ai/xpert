import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { ToastrService, ViewExtensionApiService } from '@cloud/app/@core'
import { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'
import { ViewClientCommandRegistry } from '../view-client-command-registry.service'

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

  beforeEach(async () => {
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
    jest.clearAllMocks()
  })

  it('executes declared client commands through the host registry', async () => {
    const handler = jest.fn(async () => ({ success: true, status: 'sent' }))
    registry.register('assistant.chat.send_message', handler)

    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.detectChanges()
    await fixture.whenStable()

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
    fixture.detectChanges()
    await fixture.whenStable()

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
    fixture.detectChanges()
    await fixture.whenStable()

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
    fixture.detectChanges()
    await fixture.whenStable()

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
})
