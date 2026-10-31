import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { PluginAPIService, Store } from '@cloud/app/@core/state'
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
        { provide: PluginAPIService, useValue: {} },
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
            activeScope: null,
            selectActiveScope: () => of(null),
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

  it('uses the same installation dialog from the inline provider presentation', () => {
    const fixture = TestBed.createComponent(SettingsPluginComponent)
    fixture.componentRef.setInput('plugin', { ...plugin, category: 'model' })
    fixture.componentRef.setInput('presentation', 'provider')
    fixture.detectChanges()
    fixture.nativeElement.querySelector('button[aria-label="XP.Plugin.Install · Test plugin"]').click()
    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        panelClass: 'xp-overlay-pane-dialog',
        data: expect.objectContaining({ plugin: expect.objectContaining({ category: 'model' }) })
      })
    )
  })

  it('keeps system plugin installation blocked in organization scope', () => {
    const fixture = TestBed.createComponent(SettingsPluginComponent)
    fixture.componentRef.setInput('plugin', { ...plugin, level: PLUGIN_LEVEL.SYSTEM })
    fixture.componentRef.setInput('presentation', 'provider')
    fixture.detectChanges()
    expect(fixture.componentInstance.canInstall()).toBe(false)
    fixture.componentInstance.install()
    expect(dialog.open).not.toHaveBeenCalled()
  })
})
