import { ModelFeature, type IModelGatewayCatalogItem } from '@xpert-ai/contracts'

export type ModelGatewayExampleThinking = 'default' | 'enabled' | 'disabled'

export function modelGatewayCurlExample(
  baseUrl: string,
  externalModelId: string,
  thinking: ModelGatewayExampleThinking = 'default'
) {
  const body = JSON.stringify(
    {
      model: externalModelId,
      ...(thinking === 'default' ? {} : { thinking: { type: thinking } }),
      messages: [{ role: 'user', content: 'Hello' }]
    },
    null,
    2
  )
  return [
    `curl ${shellQuote(baseUrl + '/chat/completions')}`,
    '  -H "Authorization: Bearer YOUR_API_KEY"',
    '  -H "Content-Type: application/json"',
    `  -d ${shellQuote(body)}`
  ].join(' \\\n')
}

export function modelGatewayVSCodeExample(
  baseUrl: string,
  model: IModelGatewayCatalogItem | null,
  thinking: ModelGatewayExampleThinking = 'default'
) {
  const capabilities = model?.capabilities ?? []
  const toolCalling = [ModelFeature.TOOL_CALL, ModelFeature.MULTI_TOOL_CALL, ModelFeature.STREAM_TOOL_CALL].some(
    (feature) => capabilities.includes(feature)
  )
  return JSON.stringify(
    [
      {
        name: 'Xpert Model Gateway',
        vendor: 'customendpoint',
        apiKey: 'YOUR_API_KEY',
        apiType: 'chat-completions',
        models: [
          {
            id: model?.externalModelId ?? 'MODEL_ID',
            name: model?.model ?? 'MODEL_ID',
            url: baseUrl + '/chat/completions',
            // Example budgets; the guide tells users to match their model's actual limits.
            maxInputTokens: 256000,
            maxOutputTokens: 16000,
            toolCalling,
            vision: capabilities.includes(ModelFeature.VISION),
            // The gateway requires a separate capability for streaming tool calls.
            streaming: !toolCalling || capabilities.includes(ModelFeature.STREAM_TOOL_CALL),
            ...(thinking === 'default'
              ? {}
              : {
                  thinking: true,
                  supportsReasoningEffort: ['none', 'high'],
                  reasoningEffortFormat: 'chat-completions'
                })
          }
        ]
      }
    ],
    null,
    2
  )
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}
