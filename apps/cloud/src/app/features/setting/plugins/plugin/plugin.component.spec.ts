import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { Store } from '@cloud/app/@core/state'
import { PLUGIN_LEVEL, RequestScopeLevel } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { TPluginWithDownloads } from '../types'
import { SettingsPluginComponent } from './plugin.component'

describe('SettingsPluginComponent', () => {
  const reloadInstalledPlugins = jest.fn()
  const refreshStrategies = jest.fn()
  const dialog = {
    open: jest.fn(() => ({
      closed: of(undefined)
    }))
  }
  const plugin: TPluginWithDownloads = {
    name: '@xpert-ai/plugin-test',
    packageName: '@xpert-ai/plugin-test',
    displayName: 'Test plugin',
    description: 'Test plugin',
    version: '1.0.0',
    level: PLUGIN_LEVEL.ORGANIZATION,
    category: 'integration',
    icon: {
      type: 'font',
      value: 'ri-puzzle-line'
    },
    author: {
      name: 'XpertAI',
      url: ''
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), SettingsPluginComponent],
      providers: [
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Router,
          useValue: {
            navigate: jest.fn()
          }
        },
        {
          provide: Store,
          useValue: {
            token: 'user-token',
            scopeLevel: RequestScopeLevel.ORGANIZATION,
            scopeLevel$: of(RequestScopeLevel.ORGANIZATION)
          }
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('forwards the installed-plugin and strategy refresh callbacks to the install dialog', () => {
    const fixture = TestBed.createComponent(SettingsPluginComponent)
    fixture.componentRef.setInput('plugin', plugin)
    fixture.componentRef.setInput('reloadInstalledPlugins', reloadInstalledPlugins)
    fixture.componentRef.setInput('refreshStrategies', refreshStrategies)
    fixture.detectChanges()

    fixture.componentInstance.install()

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: {
          plugin,
          reload: reloadInstalledPlugins,
          refreshStrategies
        }
      })
    )
  })
})
