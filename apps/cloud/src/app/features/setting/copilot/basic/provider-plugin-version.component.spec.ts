import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { IPluginDescriptor } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { PluginAPIService } from '../../../../@core/state'
import { PluginRuntimeRestartService } from '../../plugins/plugin-runtime-restart.service'
import { ProviderPluginUpdateDialogComponent } from './provider-plugin-version.component'

describe('model provider plugin update', () => {
  function setup(canUpdate = true) {
    const data = { name: '@vendor/provider', canUpdate, hasUpdate: true } satisfies Partial<IPluginDescriptor>
    const api = { update: jest.fn().mockReturnValue(of({ restartRequired: true, runtimeRequirements: [] })) }
    const runtime = { markRequired: jest.fn(), prompt: jest.fn(), trackPluginConvergence: jest.fn() }
    const dialog = { close: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialog },
        { provide: PluginAPIService, useValue: api },
        { provide: PluginRuntimeRestartService, useValue: runtime }
      ]
    })
    return {
      component: TestBed.runInInjectionContext(() => new ProviderPluginUpdateDialogComponent()),
      api,
      runtime,
      dialog
    }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('honors plugin update permission', async () => {
    const { component, api } = setup(false)
    await component.update()
    expect(api.update).not.toHaveBeenCalled()
  })
  it('preserves required restart tracking after a successful update', async () => {
    const { component, api, runtime, dialog } = setup()
    await component.update()
    expect(api.update).toHaveBeenCalledWith('@vendor/provider')
    expect(runtime.markRequired).toHaveBeenCalledWith('@vendor/provider', [])
    expect(dialog.close).toHaveBeenCalledWith(true)
    expect(runtime.prompt).toHaveBeenCalled()
  })
  it('keeps the dialog open and permits retry on update failure', async () => {
    const { component, api, dialog } = setup()
    api.update.mockReturnValue(throwError(() => new Error('Update failed')))
    await component.update()
    expect(component.error()).toContain('Update failed')
    expect(component.loading()).toBe(false)
    expect(dialog.close).not.toHaveBeenCalled()
  })
})
