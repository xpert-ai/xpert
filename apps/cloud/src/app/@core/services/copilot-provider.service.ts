import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { API_COPILOT_PROVIDER } from '../constants/app.constants'
import { ICopilotProvider, ICopilotProviderModel, ParameterRule, ProviderModel } from '../types'

@Injectable({ providedIn: 'root' })
export class CopilotProviderService extends OrganizationBaseCrudService<ICopilotProvider> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_COPILOT_PROVIDER)
  }

  getModelParameterRules(providerId: string, model: string) {
    return this.httpClient.get<ParameterRule[]>(this.apiBaseUrl + `/${providerId}/model-parameter-rules`, {
      params: {
        model
      }
    })
  }

  getModels(providerId: string) {
    return this.httpClient.get<{ custom: ICopilotProviderModel[]; builtin: ProviderModel[] }>(
      this.apiBaseUrl + `/${providerId}/model`
    )
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
