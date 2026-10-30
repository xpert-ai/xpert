import { CdkMenuTrigger } from '@angular/cdk/menu'
import { OverlayContainer } from '@angular/cdk/overlay'
import { Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of } from 'rxjs'
import {
  AiModelTypeEnum,
  AiProviderRole,
  FetchFrom,
  ParameterType,
  type ICopilotModel,
  type ICopilotWithProvider,
  type ParameterRule,
  resolveModelParameterOptions
} from '@xpert-ai/contracts'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { CopilotModelSelectComponent } from './select.component'

const rules: ParameterRule[] = [
  { name: 'temperature', label: { en_US: 'Temperature' }, type: ParameterType.FLOAT, min: 0, max: 2, default: 0.7 },
  { name: 'max_tokens', label: { en_US: 'Max Tokens' }, type: ParameterType.INT, min: 64, max: 32768, default: 8192 },
  { name: 'top_p', label: { en_US: 'Top P' }, type: ParameterType.FLOAT, min: 0, max: 1 },
  { name: 'enable_thinking', label: { en_US: 'Thinking' }, type: ParameterType.BOOLEAN, default: true }
]
const models = ['model-a', 'model-b'].map((model) => ({
  model,
  model_type: AiModelTypeEnum.LLM,
  label: { en_US: model },
  fetch_from: FetchFrom.PREDEFINED_MODEL,
  model_properties: { context_size: 128000 }
}))
const catalog: ICopilotWithProvider[] = ['one', 'two'].map((id) => ({
  id,
  role: AiProviderRole.Primary,
  name: id,
  modelProvider: { id: `provider-${id}` },
  providerWithModels: { provider: id, label: { en_US: id }, models }
}))

@Component({
  imports: [CopilotModelSelectComponent, FormsModule],
  template: `<copilot-model-select [modelType]="type" [(ngModel)]="value" />
    <button id="save" (click)="save()">Save</button>`
})
class SettingsHost {
  type = AiModelTypeEnum.LLM
  value: ICopilotModel = {
    copilotId: 'one',
    model: 'model-a',
    modelType: AiModelTypeEnum.LLM,
    options: { temperature: 0.2 }
  }
  saved = ''
  save() {
    this.saved = JSON.stringify(this.value)
  }
}

// Render the real selector/popover/CVAs together; isolated input tests miss parent normalization feedback.
describe('model settings parameter editing', () => {
  let fixture: ComponentFixture<CopilotModelSelectComponent>
  let saved: ICopilotModel
  let ruleUpdates: BehaviorSubject<ParameterRule[]>

  async function mount(value: ICopilotModel) {
    fixture = TestBed.createComponent(CopilotModelSelectComponent)
    fixture.componentRef.setInput('modelType', AiModelTypeEnum.LLM)
    fixture.componentInstance.registerOnChange((value) => {
      saved = value
    })
    fixture.componentInstance.writeValue(value)
    saved = value
    fixture.autoDetectChanges()
    await fixture.whenStable()
  }

  async function openParameters() {
    const trigger = fixture.debugElement
      .queryAll(By.directive(CdkMenuTrigger))
      .find((element) => element.references['parametersTrigger'])
    trigger.nativeElement.click()
    await fixture.whenStable()
    return TestBed.inject(OverlayContainer).getContainerElement()
  }

  async function inputValue(input: HTMLInputElement, value: string, blur = true) {
    input.focus()
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    if (blur) input.dispatchEvent(new Event('blur'))
    await fixture.whenStable()
  }

  beforeEach(async () => {
    ruleUpdates = new BehaviorSubject(rules)
    await TestBed.configureTestingModule({
      imports: [CopilotModelSelectComponent, SettingsHost, TranslateModule.forRoot()],
      providers: [
        { provide: CopilotServerService, useValue: { getCopilotModels: () => of(catalog) } },
        {
          provide: CopilotProviderService,
          useValue: {
            getModelParameterRules: (provider: string, type: AiModelTypeEnum, model: string) =>
              provider === 'provider-one' && model === 'model-a'
                ? ruleUpdates
                : of(rules.map(({ default: _, ...rule }) => rule))
          }
        }
      ]
    }).compileComponents()
    await mount({
      copilotId: 'one',
      model: 'model-a',
      modelType: AiModelTypeEnum.LLM,
      options: { temperature: 0, top_p: 0.95, max_tokens: 16384, enable_thinking: false, maxRetries: 3 }
    })
  })

  afterEach(() => {
    fixture.destroy()
    ruleUpdates.complete()
  })

  it.each(['model', 'provider'])(
    'resets generation options when switching %s, retaining client controls',
    async (kind) => {
      fixture.componentInstance.setModel(catalog[kind === 'provider' ? 1 : 0], models[kind === 'model' ? 1 : 0])
      await fixture.whenStable()
      expect(saved.options).toEqual({ context_size: 128000, maxRetries: 3 })
      const restored = JSON.parse(JSON.stringify(saved))
      fixture.destroy()
      await mount(restored)
      expect(saved.options).toEqual({ context_size: 128000, maxRetries: 3 })
      expect(
        resolveModelParameterOptions(
          saved.options,
          rules.map(({ default: _, ...rule }) => rule)
        )
      ).toEqual({ context_size: 128000, maxRetries: 3 })
    }
  )

  it('retains explicit zero and false when reopening or reselecting the same model', async () => {
    fixture.componentInstance.setModel(catalog[0], models[0])
    await fixture.whenStable()
    expect(saved.options).toMatchObject({ temperature: 0, enable_thinking: false, maxRetries: 3 })
    const restored = JSON.parse(JSON.stringify(saved))
    fixture.destroy()
    await mount(restored)
    expect(saved.options).toMatchObject({ temperature: 0, enable_thinking: false })
  })

  it('allows incremental integer/decimal drafts and synchronizes committed input with the real slider', async () => {
    const overlay = await openParameters()
    const inputs = overlay.querySelectorAll<HTMLInputElement>('input[type="number"]')
    await inputValue(inputs[1], '', false)
    await inputValue(inputs[1], '1', false)
    expect(inputs[1].value).toBe('1') // Below min while typing 1024 must not become 64.
    await inputValue(inputs[1], '1024')
    expect(saved.options.max_tokens).toBe(1024)
    await inputValue(inputs[0], '', false)
    await inputValue(inputs[0], '0', false)
    await inputValue(inputs[0], '0.6')
    expect(saved.options.temperature).toBe(0.6)
    const sliders = overlay.querySelectorAll<HTMLElement>('[role="slider"]')
    expect(Number(sliders[0].getAttribute('aria-valuenow'))).toBe(0.6)
    expect(Number(sliders[2].getAttribute('aria-valuenow'))).toBe(0.95)
    sliders[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await fixture.whenStable()
    expect(saved.options.temperature).toBe(0.61)
    expect(inputs[0].value).toBe('0.61')
  })

  it('commits a cleared input through the outer form before an immediate Save click', async () => {
    fixture.destroy()
    const host = TestBed.createComponent(SettingsHost)
    host.autoDetectChanges()
    await host.whenStable()
    const trigger = host.debugElement
      .queryAll(By.directive(CdkMenuTrigger))
      .find((element) => element.references['parametersTrigger'])
    trigger.nativeElement.click()
    await host.whenStable()
    const input = TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector<HTMLInputElement>('input[type="number"]')
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur'))
    host.nativeElement.querySelector('#save').click()
    expect(JSON.parse(host.componentInstance.saved).options.temperature).toBeNull()
    host.destroy()
  })

  it('keeps cleared optional fields unset through rule refresh, JSON save/reopen and request resolution', async () => {
    let overlay = await openParameters()
    for (const input of overlay.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
      await inputValue(input, '')
    }
    ruleUpdates.next(rules.map((rule) => ({ ...rule })))
    await fixture.whenStable()
    expect(saved.options).toMatchObject({ temperature: null, max_tokens: null, top_p: null, enable_thinking: false })
    const restored = JSON.parse(JSON.stringify(saved))
    fixture.destroy()
    await mount(restored)
    overlay = await openParameters()
    expect(
      Array.from(overlay.querySelectorAll<HTMLInputElement>('input[type="number"]'), (input) => input.value)
    ).toEqual(['', '', ''])
    const slider = overlay.querySelector<HTMLElement>('[role="slider"]')
    slider.dispatchEvent(new FocusEvent('focus'))
    slider.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await fixture.whenStable()
    expect(saved.options.temperature).toBeNull()
    const request = resolveModelParameterOptions(saved.options, rules)
    for (const key of ['temperature', 'max_tokens', 'top_p']) expect(request).not.toHaveProperty(key)
    expect(request.enable_thinking).toBe(false)
  })
})
