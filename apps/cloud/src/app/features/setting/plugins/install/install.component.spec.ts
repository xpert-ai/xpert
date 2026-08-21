import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { PluginAPIService, Store } from '@cloud/app/@core/state'
import { PLUGIN_LEVEL, RequestScopeLevel } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { PluginRuntimeRestartService } from '../plugin-runtime-restart.service'
import { PluginInstallComponent } from './install.component'

describe('PluginInstallComponent anonymous flow', () => {
  const originalFetch = globalThis.fetch
  const activeScope = {
    level: RequestScopeLevel.ORGANIZATION,
    organizationId: 'org-1'
  }
  const store = {
    token: null as string | null,
    activeScope,
    scopeLevel: RequestScopeLevel.ORGANIZATION,
    selectActiveScope: jest.fn(() => of(activeScope)),
    scopeLevel$: of(RequestScopeLevel.ORGANIZATION)
  }
  const pluginAPI = {
    getByNames: jest.fn(() => of([])),
    install: jest.fn(() => of({}))
  }
  const dialogRef = {
    close: jest.fn()
  }
  const router = {
    url: '/plugins/marketplace/xpert-ai/plugin-dingtalk-sso?sourceId=platform#details',
    navigate: jest.fn(() => Promise.resolve(true))
  }
  const runtimeRestartFactory = jest.fn(() => ({
    markRequired: jest.fn(),
    canRestart: jest.fn(() => false),
    restartUnavailableMessageKey: jest.fn(() => ''),
    confirmAndRestart: jest.fn()
  }))

  beforeEach(async () => {
    store.token = null

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn(() =>
        Promise.resolve({
          ok: false
        } as Response)
      )
    })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), PluginInstallComponent],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            plugin: {
              name: '@xpert-ai/plugin-test',
              packageName: '@xpert-ai/plugin-test',
              displayName: 'Test plugin',
              description: 'Test plugin',
              version: '1.0.0',
              level: PLUGIN_LEVEL.SYSTEM,
              category: 'integration',
              icon: {
                type: 'font',
                value: 'ri-puzzle-line'
              },
              author: {
                name: 'XpertAI',
                url: ''
              }
            },
            reload: jest.fn()
          }
        },
        {
          provide: DialogRef,
          useValue: dialogRef
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: PluginAPIService,
          useValue: pluginAPI
        },
        {
          provide: Router,
          useValue: router
        },
        {
          provide: PluginRuntimeRestartService,
          useFactory: runtimeRestartFactory
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    if (originalFetch) {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch
      })
    } else {
      Reflect.deleteProperty(globalThis, 'fetch')
    }
    jest.clearAllMocks()
  })

  it('does not initialize protected plugin state before anonymous confirmation', async () => {
    const fixture = TestBed.createComponent(PluginInstallComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(pluginAPI.getByNames).not.toHaveBeenCalled()
    expect(runtimeRestartFactory).not.toHaveBeenCalled()
    expect(fixture.componentInstance.systemPluginUnavailableInCurrentScope()).toBe(false)
  })

  it('redirects the final install action to login with the complete plugin URL', () => {
    const fixture = TestBed.createComponent(PluginInstallComponent)

    fixture.componentInstance.install()

    expect(pluginAPI.install).not.toHaveBeenCalled()
    expect(dialogRef.close).toHaveBeenCalledWith()
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: {
        returnUrl: '/plugins/marketplace/xpert-ai/plugin-dingtalk-sso?sourceId=platform#details'
      }
    })
  })

  it('keeps the existing install request when a token is available', async () => {
    store.token = 'user-token'
    const fixture = TestBed.createComponent(PluginInstallComponent)
    fixture.componentInstance.plugin.update((plugin) => ({
      ...plugin,
      level: PLUGIN_LEVEL.ORGANIZATION
    }))
    fixture.detectChanges()
    await fixture.whenStable()

    expect(pluginAPI.getByNames).toHaveBeenCalledWith(['@xpert-ai/plugin-test'])

    fixture.componentInstance.install()

    expect(pluginAPI.install).toHaveBeenCalledWith({
      pluginName: '@xpert-ai/plugin-test',
      version: '1.0.0'
    })
    expect(router.navigate).not.toHaveBeenCalled()
  })
})
