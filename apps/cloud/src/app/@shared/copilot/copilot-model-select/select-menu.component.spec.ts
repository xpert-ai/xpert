import { OverlayContainer } from '@angular/cdk/overlay'
import { TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { CopilotModelSelectComponent } from './select.component'

describe('Rerank model selection menu', () => {
  it('shows an actionable load failure in the actual overlay and retries', async () => {
    let failed = true
    const getCopilotModels = jest.fn(() => (failed ? throwError(() => new Error('catalog unavailable')) : of([])))
    await TestBed.configureTestingModule({
      imports: [CopilotModelSelectComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: CopilotServerService, useValue: { getCopilotModels } },
        { provide: CopilotProviderService, useValue: { getModelParameterRules: () => of([]) } }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotModelSelectComponent)
    fixture.componentRef.setInput('modelType', AiModelTypeEnum.RERANK)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    fixture.nativeElement.querySelector('.model-select-trigger').click()
    fixture.detectChanges()
    await fixture.whenStable()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(overlay.querySelector('[role="alert"]').textContent).toContain('XP.Copilot.ModelsLoadFailed')
    failed = false
    overlay.querySelector<HTMLButtonElement>('[role="alert"] button').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(overlay.querySelector('[role="alert"]')).toBeNull()
    expect(overlay.textContent).toContain('XP.Copilot.NoMatchingModels')
    expect(getCopilotModels).toHaveBeenCalledTimes(2)
    fixture.destroy()
  })

  it('renders returned rerank models in the actual overlay and selects a model', async () => {
    const copilotServer = {
      getCopilotModels: jest.fn(() =>
        of([
          {
            id: 'rerank-copilot',
            role: 'secondary',
            name: 'Rerank provider',
            modelProvider: { id: 'provider-1' },
            providerWithModels: {
              provider: 'test',
              label: { en_US: 'Test provider' },
              models: [{ model: 'rerank-test', model_type: AiModelTypeEnum.RERANK }]
            }
          }
        ])
      )
    }
    await TestBed.configureTestingModule({
      imports: [CopilotModelSelectComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: CopilotServerService, useValue: copilotServer },
        { provide: CopilotProviderService, useValue: { getModelParameterRules: () => of([]) } }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotModelSelectComponent)
    fixture.componentRef.setInput('modelType', AiModelTypeEnum.RERANK)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const trigger = fixture.nativeElement.querySelector('.model-select-trigger') as HTMLElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(copilotServer.getCopilotModels).toHaveBeenCalledWith(AiModelTypeEnum.RERANK)
    expect(overlay.textContent).toContain('rerank-test')
    const item = Array.from(overlay.querySelectorAll<HTMLElement>('button')).find((element) =>
      element.textContent.includes('rerank-test')
    )
    expect(item).toBeDefined()
    item.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.model()).toBe('rerank-test')
    fixture.destroy()
  })
})
