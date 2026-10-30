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

function shellQuote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}
