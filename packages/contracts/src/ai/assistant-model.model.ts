import type { TCopilotModel } from './copilot-model.model'
import type { TAvatar } from '../types'

export type TAssistantModelSelectionOptions = {
  /** Additional LLM models that an Assistant user may choose at runtime. */
  allowedModels: TCopilotModel[]
}

export type TAssistantModelOption = {
  id: string
  label: string
  description?: string
  /** Copilot model provider avatar displayed by model picker clients. */
  avatar?: Pick<TAvatar, 'url' | 'background'>
  disabled?: boolean
  default?: boolean
}

export type TAssistantModelsResponse = {
  models: TAssistantModelOption[]
  selected_model_id: string | null
  preference_persistable: boolean
}

export type TAssistantModelPreferenceInput = {
  model_id: string | null
}

/** HTTP 400 admission/preference error; clients refresh choices without bypassing model access. */
export type TAssistantModelSelectionError = {
  statusCode: 400
  error: 'Bad Request'
  code: 'ASSISTANT_MODEL_NOT_ALLOWED' | 'ASSISTANT_MODEL_UNAVAILABLE'
  modelId: string
  message: string
}

export type TAssistantPrimaryModelSelectionSource = 'explicit' | 'preference' | 'default' | 'retry' | 'fallback'

export type TAssistantPrimaryModelSelection = {
  id: string
  model: TCopilotModel
  source: TAssistantPrimaryModelSelectionSource
}
