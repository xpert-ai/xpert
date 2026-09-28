// Accept both the API endpoint and older saved service-root URLs.
export function apiRootUrl(apiUrl) {
  return apiUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

export function chatkitUrl(webUrl) {
  return `${webUrl.replace(/\/+$/, '')}/chatkit`
}

export function followsWebUrl(frameUrl, webUrl) {
  const frame = frameUrl.replace(/\/+$/, '')
  const base = chatkitUrl(webUrl)
  return frame === base || frame === `${base}/index.html`
}
