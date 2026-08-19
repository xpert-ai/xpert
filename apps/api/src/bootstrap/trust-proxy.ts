import type { NestExpressApplication } from '@nestjs/platform-express'

export function configureTrustProxy(
  app: NestExpressApplication,
  options: {
    value?: string
    cloudDeployment: boolean
  }
) {
  const trustProxy = resolveTrustProxy(options.value)
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy)
  } else if (options.cloudDeployment) {
    app.set('trust proxy', 1)
  }
}

export function resolveTrustProxy(value?: string): boolean | number | string | undefined {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }
  if (normalized === 'true' || normalized === 'false') {
    return normalized === 'true'
  }
  if (/^\d+$/.test(normalized)) {
    return Number(normalized)
  }
  return normalized
}
