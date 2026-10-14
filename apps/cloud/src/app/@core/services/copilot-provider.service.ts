import { inject, Injectable } from '@angular/core'
import { AiModelTypeEnum, OrganizationBaseCrudService } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { API_COPILOT_PROVIDER } from '../constants/app.constants'
import { ICopilotProvider, ICopilotProviderModel, ParameterRule } from '../types'
import { ModelDiscoveryResult, ModelImportInput, ModelImportResult, ProviderModelCatalog } from '@xpert-ai/contracts'

@Injectable({ providedIn: 'root' })
export class CopilotProviderService extends OrganizationBaseCrudService<ICopilotProvider> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_COPILOT_PROVIDER)
  }

  getModelParameterRules(providerId: string, modelType: AiModelTypeEnum, model: string) {
    return this.httpClient.get<ParameterRule[]>(this.apiBaseUrl + `/${providerId}/model-parameter-rules`, {
      params: {
        model,
        modelType
      }
    })
  }

  getModels(providerId: string) {
    return this.httpClient.get<ProviderModelCatalog>(this.apiBaseUrl + `/${providerId}/model`)
  }

  discoverModels(providerId: string) {
    return this.httpClient.get<ModelDiscoveryResult>(`${this.apiBaseUrl}/${providerId}/model-discovery`)
  }

  importModels(providerId: string, input: ModelImportInput) {
    return this.httpClient.post<ModelImportResult>(`${this.apiBaseUrl}/${providerId}/model-discovery`, input)
  }

  getModel(providerId: string, modelId: string) {
    return this.httpClient.get<ICopilotProviderModel>(this.apiBaseUrl + `/${providerId}/model/${modelId}`)
  }

  createModel(providerId: string, model: Partial<ICopilotProviderModel>) {
    return this.httpClient.post<ICopilotProviderModel>(this.apiBaseUrl + `/${providerId}/model`, model)
  }

  updateModel(providerId: string, modelId: string, model: Partial<ICopilotProviderModel>) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/${providerId}/model/${modelId}`, model)
  }

  deleteModel(providerId: string, modelId: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${providerId}/model/${modelId}`)
  }
}

export function injectCopilotProviderService() {
  return inject(CopilotProviderService)
}
