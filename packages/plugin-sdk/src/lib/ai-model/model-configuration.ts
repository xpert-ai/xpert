import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ModelConfiguration,
  ModelPropertyKey,
  ParameterType
} from '@xpert-ai/contracts'

/** Apply an explicit saved configuration without mutating a shared predefined schema. */
export function applyModelConfiguration(
  model: string,
  configuration: ModelConfiguration,
  schema?: AIModelEntity | null
): AIModelEntity {
  const result: AIModelEntity = {
    ...schema,
    model,
    label: schema?.label ?? { en_US: model, zh_Hans: model },
    model_type: configuration.modelType,
    fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
    model_properties: { ...schema?.model_properties, [ModelPropertyKey.CONTEXT_SIZE]: configuration.contextSize },
    parameter_rules: [...(schema?.parameter_rules ?? [])]
  }
  if (configuration.modelType === AiModelTypeEnum.LLM) {
    result.features = [...configuration.features]
    result.model_properties[ModelPropertyKey.MODE] = 'chat'
    result.parameter_rules = [
      ...result.parameter_rules.filter((rule) => rule.name !== 'max_tokens'),
      {
        name: 'max_tokens',
        label: { en_US: 'Max output tokens', zh_Hans: '最大输出 Token' },
        type: ParameterType.INT,
        min: 1,
        max: configuration.maxOutputTokens,
        default: configuration.defaultMaxTokens
      }
    ]
  }
  return result
}
