import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { type IXpert, type XpertExtensionViewManifest, XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { ViewExtensionApiService } from '../../../../@core'
import { EReloadReason, XpertStudioApiService } from '../domain'
import { XpertWorkbenchInitialLayoutSettingsComponent } from './workbench-initial-layout-settings.component'

describe('XpertWorkbenchInitialLayoutSettingsComponent', () => {
  const xpert = signal<Partial<IXpert>>({
    id: 'xpert-1',
    options: {
      workbench: {
        initialLayout: XpertWorkbenchInitialLayoutEnum.ChatkitMaximized,
        defaultViewKey: 'provider__review'
      }
    }
  })
  const apiService = {
    xpert,
    updateXpertOptions: jest.fn()
  }
  const viewExtensionApi = {
    getSlotViews: jest.fn(() =>
      of([
        buildFixedViewManifest('provider__review', 'Review', 10),
        buildFixedViewManifest('provider__metrics', 'Metrics', 20)
      ])
    )
  }

  beforeEach(() => {
    xpert.set({
      id: 'xpert-1',
      options: {
        workbench: {
          initialLayout: XpertWorkbenchInitialLayoutEnum.ChatkitMaximized,
          defaultViewKey: 'provider__review'
        }
      }
    })
    apiService.updateXpertOptions.mockClear()
    viewExtensionApi.getSlotViews.mockClear()

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertWorkbenchInitialLayoutSettingsComponent],
      providers: [
        {
          provide: XpertStudioApiService,
          useValue: apiService
        },
        {
          provide: ViewExtensionApiService,
          useValue: viewExtensionApi
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders the default, overlay, and both maximized layout choices', () => {
    const fixture = TestBed.createComponent(XpertWorkbenchInitialLayoutSettingsComponent)
    fixture.detectChanges()

    const choices = fixture.nativeElement.querySelectorAll('input[type="radio"]')

    expect(choices).toHaveLength(4)
    expect(choices[0].value).toBe(XpertWorkbenchInitialLayoutEnum.TwoColumns)
    expect(choices[1].value).toBe(XpertWorkbenchInitialLayoutEnum.OverlayDialog)
    expect(choices[2].value).toBe(XpertWorkbenchInitialLayoutEnum.ChatkitMaximized)
    expect(choices[3].value).toBe(XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized)
  })

  it('writes the selected layout into the xpert draft options', () => {
    const fixture = TestBed.createComponent(XpertWorkbenchInitialLayoutSettingsComponent)
    fixture.detectChanges()

    const workbenchChoice = fixture.nativeElement.querySelectorAll('input[type="radio"]')[3] as HTMLInputElement
    workbenchChoice.click()

    expect(apiService.updateXpertOptions).toHaveBeenCalledWith(
      {
        workbench: {
          initialLayout: XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized,
          defaultViewKey: 'provider__review'
        }
      },
      EReloadReason.XPERT_UPDATED
    )
  })

  it('does not create a draft change when the selected layout is unchanged', () => {
    const fixture = TestBed.createComponent(XpertWorkbenchInitialLayoutSettingsComponent)

    fixture.componentInstance.setInitialLayout(XpertWorkbenchInitialLayoutEnum.ChatkitMaximized)

    expect(apiService.updateXpertOptions).not.toHaveBeenCalled()
  })

  it('uses the two-column layout when the xpert has no explicit initial layout', () => {
    xpert.set({ id: 'xpert-1', options: { workbench: {} } })
    const fixture = TestBed.createComponent(XpertWorkbenchInitialLayoutSettingsComponent)

    expect(fixture.componentInstance.initialLayout()).toBe(XpertWorkbenchInitialLayoutEnum.TwoColumns)
  })

  it('loads selectable extension views and writes the selected default view key', async () => {
    const fixture = TestBed.createComponent(XpertWorkbenchInitialLayoutSettingsComponent)
    await settle(fixture)

    expect(viewExtensionApi.getSlotViews).toHaveBeenCalledWith('agent', 'xpert-1', 'agent.workbench.fixed', {
      isDraft: true
    })
    expect(fixture.componentInstance.viewOptions()).toEqual([
      { key: 'provider__review', label: 'Review' },
      { key: 'provider__metrics', label: 'Metrics' }
    ])
    expect(fixture.componentInstance.selectedDefaultViewKey()).toBe('provider__review')

    fixture.componentInstance.setDefaultViewKey('provider__metrics')

    expect(apiService.updateXpertOptions).toHaveBeenCalledWith(
      {
        workbench: {
          initialLayout: XpertWorkbenchInitialLayoutEnum.ChatkitMaximized,
          defaultViewKey: 'provider__metrics'
        }
      },
      EReloadReason.XPERT_UPDATED
    )
  })
})

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  fixture.detectChanges()
}

function buildFixedViewManifest(key: string, title: string, order: number): XpertExtensionViewManifest {
  return {
    key,
    title: { en_US: title, zh_Hans: title },
    hostType: 'agent',
    slot: 'agent.workbench.fixed',
    order,
    source: { provider: 'test-provider' },
    workbench: { fixed: true, menu: { enabled: true } },
    view: { type: 'raw_json' },
    dataSource: { mode: 'platform' }
  }
}
