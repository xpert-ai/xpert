import { HttpParams } from '@angular/common/http'

export function normalizeOptionalQueryValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const normalizedValue = String(value).trim()
  if (!normalizedValue || normalizedValue === 'undefined' || normalizedValue === 'null') {
    return null
  }

  return normalizedValue
}

export function createOptionalQueryParams(query: Record<string, unknown>) {
  let params = new HttpParams()

  for (const [key, value] of Object.entries(query)) {
    const normalizedValue = normalizeOptionalQueryValue(value)
    if (normalizedValue !== null) {
      params = params.append(key, normalizedValue)
    }
  }

  return params.keys().length ? params : undefined
}

export function appendOptionalQueryParam(
  params: HttpParams | null | undefined,
  key: string,
  value: unknown
) {
  const normalizedValue = normalizeOptionalQueryValue(value)
  if (normalizedValue === null) {
    return params ?? undefined
  }

  return (params ?? new HttpParams()).set(key, normalizedValue)
}

export function appendOrganizationIdQueryParam(
  params: HttpParams | null | undefined,
  organizationId?: string
) {
  return appendOptionalQueryParam(params, 'organizationId', organizationId)
}
