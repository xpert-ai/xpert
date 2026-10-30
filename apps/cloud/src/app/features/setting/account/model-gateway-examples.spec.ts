import { modelGatewayCurlExample, modelGatewayVSCodeExample } from './model-gateway-examples'

describe('model gateway curl examples', () => {
  it('escapes every single quote in the URL and JSON body without changing shell metacharacters', () => {
    const example = modelGatewayCurlExample(
      "https://gateway.example/team's/api's/v1",
      "provider/team's/model's-$HOME-$(echo literal)-`echo literal`",
      'disabled'
    )

    expect(example).toBe(
      String.raw`curl 'https://gateway.example/team'\''s/api'\''s/v1/chat/completions' \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "provider/team'\''s/model'\''s-$HOME-$(echo literal)-` +
        '`echo literal`' +
        String.raw`",
  "thinking": {
    "type": "disabled"
  },
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ]
}'`
    )
  })
})

describe('complete VS Code model gateway configuration', () => {
  it('provides a complete JSON document with explicit placeholders when no model is selected', () => {
    expect(JSON.parse(modelGatewayVSCodeExample('https://gateway.example/api/openai/v1', null))).toEqual([
      {
        name: 'Xpert Model Gateway',
        vendor: 'customendpoint',
        apiKey: 'YOUR_API_KEY',
        apiType: 'chat-completions',
        models: [
          {
            id: 'MODEL_ID',
            name: 'MODEL_ID',
            url: 'https://gateway.example/api/openai/v1/chat/completions',
            maxInputTokens: 256000,
            maxOutputTokens: 16000,
            toolCalling: false,
            vision: false,
            streaming: true
          }
        ]
      }
    ])
  })
})
