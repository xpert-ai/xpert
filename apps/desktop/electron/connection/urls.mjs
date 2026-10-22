// Accept both the API endpoint and older saved service-root URLs.
export function apiRootUrl(apiUrl) {
  return apiUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

export function chatkitUrl(webUrl) {
  return `${webUrl.trim().replace(/\/+$/, '')}/chatkit`
}

// Blank fields use the same packaged defaults in forms, saves and TLS diagnostics.
export function resolveConnectionUrls(value, defaults) {
  const fallback = (url, defaultUrl) => (typeof url === 'string' && !url.trim() ? defaultUrl : (url ?? defaultUrl))
  const webUrl = fallback(value.webUrl, defaults.webUrl)
  const usesDefaultWeb =
    typeof webUrl === 'string' && webUrl.trim().replace(/\/+$/, '') === defaults.webUrl.replace(/\/+$/, '')
  const defaultFrame = usesDefaultWeb || typeof webUrl !== 'string' ? defaults.frameUrl : chatkitUrl(webUrl)
  return {
    apiUrl: fallback(value.apiUrl, defaults.apiUrl),
    webUrl,
    frameUrl: fallback(value.frameUrl, defaultFrame)
  }
}

export function followsWebUrl(frameUrl, webUrl) {
  const frame = frameUrl.replace(/\/+$/, '')
  const base = chatkitUrl(webUrl)
  return frame === base || frame === `${base}/index.html`
}
