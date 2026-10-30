import { modelGatewayCurlExample } from './model-gateway-examples'

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
