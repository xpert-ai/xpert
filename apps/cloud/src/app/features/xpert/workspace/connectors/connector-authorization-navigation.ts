// OAuth stays in the browser that started the request and holds the callback binding cookie.
export function navigateConnectorAuthorization(value: string) {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Invalid authorization URL')
  window.location.assign(url.href)
}
