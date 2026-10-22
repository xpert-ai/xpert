export function apiRootUrl(apiUrl: string): string
export interface ConnectionUrls {
  apiUrl: string
  webUrl: string
  frameUrl: string
}
export function resolveConnectionUrls(value: ConnectionUrls, defaults: ConnectionUrls): ConnectionUrls
export function chatkitUrl(webUrl: string): string
export function followsWebUrl(frameUrl: string, webUrl: string): boolean
