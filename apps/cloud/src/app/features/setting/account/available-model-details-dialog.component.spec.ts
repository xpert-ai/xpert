import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  FetchFrom,
  ICopilotWithProvider,
  IModelAccessCatalogItem,
  ModelAccessChannelEnum,
  ModelAccessOwnershipScopeEnum,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@xpert-ai/contracts'
import { defer, of, throwError } from 'rxjs'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { AvailableModelDetailsDialogComponent } from './available-model-details-dialog.component'
import { findAvailableModelMetadata, modelParameterValue } from './available-model-metadata'

const item: IModelAccessCatalogItem = {
  key: 'catalog-key',
  channel: ModelAccessChannelEnum.Xpert,
  copilotId: 'config-a',
  copilotModelId: 'reasoner',
  provider: 'provider-a',
  model: 'reasoner',
  modelType: AiModelTypeEnum.LLM,
  ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
  allowed: true,
  planIncluded: true,
  requestable: false
}
const copilot: ICopilotWithProvider = {
  id: 'config-a',
  modelProvider: { id: 'provider-instance-a', providerName: 'provider-a' },
  providerWithModels: {
    provider: 'provider-a',
    models: [
      {
        model: 'reasoner',
        model_type: AiModelTypeEnum.LLM,
        label: { en_US: 'Reasoner' },
        fetch_from: FetchFrom.PREDEFINED_MODEL,
        model_properties: { [ModelPropertyKey.CONTEXT_SIZE]: '131072' },
        features: [ModelFeature.VISION, ModelFeature.TOOL_CALL]
      }
    ]
  }
}

describe('available model properties and parameters', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('matches the exact configuration, provider, model and type without inventing missing properties', () => {
    expect(findAvailableModelMetadata(item, [copilot])?.contextSize).toBe(131072)
    expect(findAvailableModelMetadata({ ...item, copilotId: 'config-b' }, [copilot])).toBeNull()
    expect(findAvailableModelMetadata({ ...item, provider: 'provider-b' }, [copilot])).toBeNull()
    expect(findAvailableModelMetadata({ ...item, modelType: AiModelTypeEnum.TEXT_EMBEDDING }, [copilot])).toBeNull()
    expect(findAvailableModelMetadata({ ...item, copilotModelId: 'another-model' }, [copilot])).toBeNull()
    const model = copilot.providerWithModels.models[0]
    expect(
      findAvailableModelMetadata(item, [
        {
          ...copilot,
          providerWithModels: {
            ...copilot.providerWithModels,
            models: [{ ...model, model_properties: { context_size: '128K' } }]
          }
        }
      ])?.contextSize
    ).toBeUndefined()
    expect(modelParameterValue(0)).toBe('0')
    expect(modelParameterValue(false)).toBe('false')
    expect(modelParameterValue(undefined)).toBeNull()
    expect(modelParameterValue({ apiKey: 'never-display-object-values' })).toBeNull()
  })

  it('uses scoped parameter definitions, displays zero and false, and retries a failed read', () => {
    let failed = true
    const providerService = {
      getModelParameterRules: jest.fn(() =>
        defer(() =>
          failed
            ? throwError(() => new Error('Unavailable'))
            : of([
                {
                  name: 'temperature',
                  type: ParameterType.FLOAT,
                  label: { en_US: 'Temperature' },
                  default: 0,
                  min: 0,
                  max: 2
                },
                { name: 'thinking', type: ParameterType.BOOLEAN, label: { en_US: 'Thinking' }, default: false },
                { name: 'format', type: ParameterType.STRING, label: { en_US: 'Format' }, options: ['text', 'json'] }
              ])
        )
      )
    }
    const close = jest.fn()
    TestBed.configureTestingModule({
      imports: [AvailableModelDetailsDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { item } },
        { provide: DialogRef, useValue: { close } },
        { provide: CopilotServerService, useValue: { getCopilotModels: () => of([copilot]) } },
        { provide: CopilotProviderService, useValue: providerService }
      ]
    })
    const fixture = TestBed.createComponent(AvailableModelDetailsDialogComponent)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(providerService.getModelParameterRules).toHaveBeenCalledWith(
      'provider-instance-a',
      AiModelTypeEnum.LLM,
      'reasoner'
    )
    expect(host.textContent).toContain('XP.ModelSettings.PropertiesFailed')
    expect(host.textContent).toContain('131,072')
    failed = false
    host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click()
    fixture.detectChanges()
    const rows = [...host.querySelectorAll('tbody tr')].map((row) => row.textContent)
    expect(rows[0]).toContain('0 ～ 2')
    expect(rows[1]).toContain('false')
    expect(rows[2]).toContain('text / json')
    expect(rows[2]).toContain('XP.ModelSettings.NotProvided')
    expect(host.textContent).not.toContain('XP.ModelSettings.PropertiesFailed')
    fixture.componentInstance.close()
    expect(close).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })

  it('does not fetch another configuration when model metadata is unavailable', () => {
    const getModelParameterRules = jest.fn()
    TestBed.configureTestingModule({
      imports: [AvailableModelDetailsDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { item } },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: CopilotServerService, useValue: { getCopilotModels: () => of([{ ...copilot, id: 'config-b' }]) } },
        { provide: CopilotProviderService, useValue: { getModelParameterRules } }
      ]
    })
    const fixture = TestBed.createComponent(AvailableModelDetailsDialogComponent)
    fixture.detectChanges()
    expect(getModelParameterRules).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).toContain('XP.ModelSettings.NoParameters')
    fixture.destroy()
  })
  it('reuses the dialog for managed catalog metadata without consulting the consumer catalog', () => {
    const metadata = findAvailableModelMetadata(item, [copilot])
    const getCopilotModels = jest.fn()
    const getModelParameterRules = jest.fn(() => of([]))
    TestBed.configureTestingModule({
      imports: [AvailableModelDetailsDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { item, metadata } },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: CopilotServerService, useValue: { getCopilotModels } },
        { provide: CopilotProviderService, useValue: { getModelParameterRules } }
      ]
    })
    const fixture = TestBed.createComponent(AvailableModelDetailsDialogComponent)
    fixture.detectChanges()
    expect(getCopilotModels).not.toHaveBeenCalled()
    expect(getModelParameterRules).toHaveBeenCalledWith('provider-instance-a', AiModelTypeEnum.LLM, 'reasoner')
    expect(fixture.nativeElement.textContent).toContain('131,072')
    fixture.destroy()
  })
})
