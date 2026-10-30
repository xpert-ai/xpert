jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { Dialog } from '@angular/cdk/dialog'
import { OverlayContainer } from '@angular/cdk/overlay'
import { TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, AiProviderRole, ICopilotWithProvider } from '@xpert-ai/contracts'
import { BehaviorSubject, of } from 'rxjs'
import { CopilotServerService, ToastrService } from '../../../@core'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { CopilotConfigFormComponent } from './form.component'

describe('default model availability after provider edits', () => {
  const savedModel = { copilotId: 'copilot-1', model: 'old-model', modelType: AiModelTypeEnum.LLM }
  const copilot = { id: 'copilot-1', role: AiProviderRole.Primary, copilotModel: savedModel }
  const provider: ICopilotWithProvider = {
    ...copilot,
    modelProvider: { id: 'provider-1', providerName: 'openai-compatible' },
    providerWithModels: {
      provider: 'openai-compatible',
      label: { en_US: 'Models' },
      models: [{ model: 'new-model', model_type: AiModelTypeEnum.LLM }]
    }
  }

  async function setup(initialCatalog: ICopilotWithProvider[]) {
    const catalog$ = new BehaviorSubject(initialCatalog)
    const update = jest.fn().mockReturnValue(of({}))
    const getModelParameterRules = jest.fn().mockReturnValue(of([]))
    const refresh = jest.fn()
    await TestBed.configureTestingModule({
      imports: [CopilotConfigFormComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: CopilotServerService, useValue: { getCopilotModels: () => catalog$, refresh, update } },
        { provide: CopilotProviderService, useValue: { getModelParameterRules } },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } },
        { provide: Dialog, useValue: { open: jest.fn() } }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotConfigFormComponent)
    fixture.componentRef.setInput('copilot', copilot)
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
    }
    await settle()
    return { fixture, component: fixture.componentInstance, catalog$, update, getModelParameterRules, refresh, settle }
  }

  it('shows the stale saved identity, excludes it from the real menu, and blocks saving until reselection', async () => {
    const { fixture, component, update, getModelParameterRules, settle } = await setup([provider])
    component.formGroup.controls.tokenBalance.setValue(100)
    component.formGroup.markAsDirty()
    expect(component.formGroup.controls.copilotModel.value).toEqual(savedModel)
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'XP.Copilot.SavedModelUnavailable'
    )
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('old-model')
    expect(component.canSubmit()).toBe(false)
    expect(await component.submit()).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(getModelParameterRules).not.toHaveBeenCalled()

    fixture.nativeElement.querySelector('.model-select-trigger').click()
    await settle()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button'))
    expect(buttons.some((button) => button.textContent.includes('old-model'))).toBe(false)
    const replacement = buttons.find((button) => button.textContent.includes('new-model'))
    expect(replacement).toBeDefined()
    replacement.click()
    await settle()
    expect(component.canSubmit()).toBe(true)
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
    expect(await component.submit()).toBe(true)
    expect(update).toHaveBeenCalledWith(
      'copilot-1',
      expect.objectContaining({
        copilotModel: expect.objectContaining({ model: 'new-model', copilotId: 'copilot-1' })
      })
    )
    fixture.destroy()
  })

  it('refreshes the open form after a provider edit and retains the invalid reference on reset', async () => {
    const original = {
      ...provider,
      providerWithModels: {
        ...provider.providerWithModels,
        models: [{ model: 'old-model', model_type: AiModelTypeEnum.LLM }, ...provider.providerWithModels.models]
      }
    }
    const { fixture, component, catalog$, refresh, settle } = await setup([original])
    component.formGroup.markAsDirty()
    expect(component.canSubmit()).toBe(true)
    refresh.mockImplementation(() => catalog$.next([provider]))
    component.onAddedModel({ id: 'config-1', modelName: 'new-model', modelType: AiModelTypeEnum.LLM })
    await settle()
    expect(component.canSubmit()).toBe(false)
    expect(component.modelSelector().selectionUnavailable()).toBe(true)
    component.reset()
    await settle()
    expect(component.formGroup.controls.copilotModel.value.model).toBe('old-model')
    expect(component.modelSelector().selectionUnavailable()).toBe(true)
    fixture.destroy()
  })

  it('supports explicitly clearing a deleted default even when the provider has no models', async () => {
    const { fixture, component, settle } = await setup([])
    expect(component.modelSelector().selectionUnavailable()).toBe(true)
    component.modelSelector().delete()
    component.formGroup.markAsDirty()
    await settle()
    expect(component.modelSelector().selectionUnavailable()).toBe(false)
    expect(component.canSubmit()).toBe(true)
    fixture.destroy()
  })
})
