import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { IPluginDescriptor } from '@xpert-ai/contracts'
import { PluginVersionStatusComponent } from './plugin-version-status.component'

describe('PluginVersionStatusComponent', () => {
  const plugin: IPluginDescriptor = {
    name: '@test/plugin',
    meta: { name: '@test/plugin', version: '0.4.0' },
    level: 'system',
    isGlobal: true,
    effectiveInCurrentScope: true,
    loadStatus: 'loaded',
    currentVersion: '0.4.0',
    runningVersion: '0.4.0',
    installation: { method: 'npm' },
    canUpdate: true
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), PluginVersionStatusComponent]
    }).compileComponents()
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', {
      XP: {
        Plugin: {
          RunningVersion: 'Running',
          VersionCheckFailedShort: 'Check failed',
          StagedVersionShort: 'Pending {{version}}',
          InstallMethod_archive: 'Uploaded package',
          InstallMethod_npm: 'npm',
          UpdateReason_archive: 'Upload a new version or switch to npm',
          CheckUpdates: 'Check updates',
          RetryVersionCheck: 'Retry',
          UploadNewVersion: 'Upload new version',
          VersionCheckError_REGISTRY_UNAVAILABLE: 'Registry check failed',
          LastKnownVersion: 'Last known {{version}}',
          NewRegistryVersion: 'New {{version}}',
          CheckingVersion: 'Checking',
          StagedVersion: 'Installed {{version}}, awaiting restart'
        }
      }
    })
    translate.use('en')
  })

  it('identifies archive installs and exposes an accessible upload action', () => {
    const fixture = TestBed.createComponent(PluginVersionStatusComponent)
    fixture.componentRef.setInput('plugin', {
      ...plugin,
      installation: { method: 'archive' },
      canUpdate: false,
      canUninstall: true,
      updateUnavailableReason: 'archive'
    })
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('Uploaded package')
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Upload new version')
    expect(element.textContent).not.toContain('Check updates')
    const uploaded = jest.fn()
    fixture.componentInstance.uploadRequested.subscribe(uploaded)
    element.querySelector('button')?.click()
    expect(uploaded).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })

  it('shows a compact failure state and exposes an accessible retry action', () => {
    const fixture = TestBed.createComponent(PluginVersionStatusComponent)
    fixture.componentRef.setInput('plugin', plugin)
    fixture.componentRef.setInput('check', {
      status: 'failed',
      errorCode: 'REGISTRY_UNAVAILABLE',
      latestVersion: '0.5.1',
      checkedAt: '2026-11-05T12:00:00Z',
      lastSuccessfulCheckAt: '2026-11-05T11:00:00Z'
    })
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('Check failed')
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Retry')
    expect(element.querySelector('[role="status"]')).not.toBeNull()
    const checked = jest.fn()
    fixture.componentInstance.checkRequested.subscribe(checked)
    element.querySelector('button')?.click()
    expect(checked).toHaveBeenCalledTimes(1)
    fixture.componentRef.setInput('checking', true)
    fixture.detectChanges()
    expect(element.querySelector('button')?.disabled).toBe(true)
    fixture.destroy()
  })

  it('separates a running version from an installed version awaiting restart', () => {
    const fixture = TestBed.createComponent(PluginVersionStatusComponent)
    fixture.componentRef.setInput('plugin', {
      ...plugin,
      installedVersion: '0.5.1',
      loadStatus: 'pending_restart',
      updateUnavailableReason: 'pending_restart'
    })
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('0.4.0')
    expect(element.textContent).toContain('Pending 0.5.1')
    expect(element.querySelector('button')).toBeNull()
  })
})
