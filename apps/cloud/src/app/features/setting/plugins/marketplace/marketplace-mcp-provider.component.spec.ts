jest.mock('@cloud/app/@core', () => {
  const { inject, signal } = jest.requireActual('@angular/core')

  class ToastrService {}
  const currentUser = signal({ role: { name: 'SUPER_ADMIN' } })

  return {
    ToastrService,
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
    ),
    injectToastr: () => inject(ToastrService),
    injectUser: () => currentUser
  }
})

import { TestBed } from '@angular/core/testing'
import { ToastrService } from '@cloud/app/@core'
import {
  IPluginComponentDefinition,
  IPluginResourceComponentState,
  PLUGIN_COMPONENT_TYPE,
  PLUGIN_RESOURCE_INSTALLATION_STATUS,
  PLUGIN_RESOURCE_RUNTIME_TYPE,
  PluginAPIService
} from '@cloud/app/@core/state'
import { TranslateModule } from '@ngx-translate/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { of } from 'rxjs'
import { PluginMarketplaceMcpProviderComponent } from './marketplace-mcp-provider.component'

const pluginName = '@xpert-ai/plugin-decorated'
const componentDefinition: IPluginComponentDefinition = {
  componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
  componentKey: 'decorated-native',
  definitionHash: 'native-hash',
  config: {
    provider: 'decorated_native',
    toolCount: 2,
    runtimeDiscovered: true,
    nativeMcp: true
  },
  metadata: { runtimeDiscovered: true, nativeMcp: true }
}

function componentState(
  active: boolean,
  publicationScope: 'tenant' | 'organization' = 'organization'
): IPluginResourceComponentState {
  return {
    componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
    componentKey: componentDefinition.componentKey,
    installed: active,
    staleDefinition: false,
    runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET,
    runtimeId: active ? 'toolset-1' : null,
    status: active ? PLUGIN_RESOURCE_INSTALLATION_STATUS.READY : null,
    installation: null,
    mcpServer: active
      ? {
          publicationId: 'publication-1',
          publicationScope,
          accessEnabled: true,
          status: 'active',
          endpoint: 'http://localhost:3000/api/mcp/p/decorated-native',
          protocolVersion: '2026-07-28',
          transport: 'streamable-http',
          apiKeyCount: 1
        }
      : null
  }
}

async function createComponent(active = false, publicationScope: 'tenant' | 'organization' = 'organization') {
  const pluginAPI = {
    getPluginResourceStates: jest.fn(() => of({ items: [componentState(active, publicationScope)] })),
    enablePluginMcpServer: jest.fn(() =>
      of({
        installation: {},
        publication: {},
        connectionInfo: {
          protocolVersion: '2026-07-28',
          transport: 'streamable-http',
          endpoint: 'http://localhost:3000/api/mcp/p/decorated-native',
          authorization: 'Bearer'
        },
        createdApiKey: { apiKey: {}, secret: 'one-time-secret' }
      })
    ),
    disablePluginMcpServer: jest.fn(() => of({})),
    getPluginMcpServerConnectionInfo: jest.fn(() =>
      of({
        protocolVersion: '2026-07-28',
        transport: 'streamable-http',
        endpoint: 'http://localhost:3000/api/mcp/p/decorated-native',
        authorization: 'Bearer'
      })
    )
  }
  const reload = jest.fn()
  const success = jest.fn()

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), PluginMarketplaceMcpProviderComponent],
    providers: [
      { provide: PluginAPIService, useValue: pluginAPI },
      { provide: ToastrService, useValue: { success } }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(PluginMarketplaceMcpProviderComponent)
  fixture.componentRef.setInput('pluginName', pluginName)
  fixture.componentRef.setInput('component', componentDefinition)
  fixture.componentRef.setInput('reload', reload)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return { component: fixture.componentInstance, fixture, pluginAPI, reload, success }
}

describe('PluginMarketplaceMcpProviderComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('enables the organization MCP Provider and shows its one-time generic client configuration', async () => {
    const { component, fixture, pluginAPI, reload } = await createComponent()

    expect(component.canManage()).toBe(true)
    expect(component.isActive()).toBe(false)

    await component.enable()
    fixture.detectChanges()

    expect(pluginAPI.enablePluginMcpServer).toHaveBeenCalledWith(pluginName, 'decorated-native')
    expect(component.isActive()).toBe(true)
    expect(component.connection()?.apiKeySecret).toBe('one-time-secret')
    expect(component.clientConfiguration()).toContain('http://localhost:3000/api/mcp/p/decorated-native')
    expect(component.clientConfiguration()).toContain('${XPERT_MCP_API_KEY}')
    expect(fixture.nativeElement.textContent).toContain('one-time-secret')
    expect(reload).toHaveBeenCalled()
  })

  it('shows existing active connection data without revealing an API key secret', async () => {
    const { component, fixture } = await createComponent(true)

    expect(component.isActive()).toBe(true)
    expect(component.connection()?.apiKeySecret).toBeUndefined()
    expect(component.clientConfiguration()).toContain('decorated_native')
    expect(fixture.nativeElement.textContent).toContain('http://localhost:3000/api/mcp/p/decorated-native')
    expect(fixture.nativeElement.textContent).not.toContain('one-time-secret')
  })

  it('disables the Provider from the inline marketplace panel', async () => {
    const { component, pluginAPI, reload } = await createComponent(true)

    await component.disable()

    expect(pluginAPI.disablePluginMcpServer).toHaveBeenCalledWith(pluginName, 'decorated-native')
    expect(component.isActive()).toBe(false)
    expect(component.connection()).toBeNull()
    expect(reload).toHaveBeenCalled()
  })

  it('does not link organization users to shared tenant Publication settings', async () => {
    const { component, fixture } = await createComponent(true, 'tenant')

    expect(component.canOpenAdvancedSettings()).toBe(false)
    expect(fixture.nativeElement.querySelector('a[href="/operations"]')).toBeNull()
  })

  it('ships every inline MCP label through all frontend locale catalogs', () => {
    const locales = ['en', 'en-US', 'zh-CN', 'zh-Hans', 'zh-Hant']
    const requiredKeys = [
      'CheckingMcpState',
      'McpStateUnavailable',
      'McpLastSyncFailed',
      'McpToolCount',
      'McpTransportStreamableHttp',
      'McpServerStatusActive',
      'McpServerStatusDisabled',
      'DisableMcpServer',
      'EnableMcpServer',
      'AdvancedMcpSettings',
      'ShowConnectionInfo',
      'McpApiKeyOneTime',
      'McpClientConfiguration',
      'McpServerEnabledToast',
      'McpServerDisabledToast',
      'CopySucceeded'
    ]

    for (const locale of locales) {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const pluginMessages = messages.XP?.Plugin

      for (const key of requiredKeys) {
        expect(pluginMessages?.[key]).toEqual(expect.any(String))
      }
    }

    const simplifiedChinese = JSON.parse(
      readFileSync(join(__dirname, '../../../../../assets/i18n/zh-Hans.json'), 'utf8')
    )
    expect(simplifiedChinese.XP.Plugin.McpToolCount).toBe('{{count}} 个工具')
    expect(simplifiedChinese.XP.Plugin.EnableMcpServer).toBe('启用 MCP 服务')
  })
})
