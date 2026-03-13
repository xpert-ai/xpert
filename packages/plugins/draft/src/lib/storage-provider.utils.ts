import { FileStorageOption } from '@metad/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import moment from 'moment'
import { posix } from 'path'
import { v4 as uuid } from 'uuid'

export function normalizeKey(...segments: Array<string | undefined>) {
  return posix.join(...segments.filter(Boolean).map((segment) => `${segment}`.replace(/\\/g, '/'))).replace(/^\/+/, '')
}

export function resolveFileName(
  file: any,
  ext: string | undefined,
  filename?: FileStorageOption['filename'],
  prefix = 'file'
) {
  if (filename) {
    return typeof filename === 'string' ? filename : filename(file, ext)
  }

  return `metad-${prefix}-${moment().unix()}-${parseInt(`${Math.random() * 1000}`, 10)}.${ext}`
}

export function buildTenantScopedObjectKey(
  rootPath: string | undefined,
  file: any,
  dest: FileStorageOption['dest'],
  filename?: FileStorageOption['filename'],
  prefix?: string
) {
  const ext = file.originalname.split('.').pop()
  const resolvedFileName = resolveFileName(file, ext, filename, prefix)
  const directory = typeof dest === 'function' ? `${dest(file)}` : `${dest || ''}`
  const tenantId = RequestContext.currentTenantId() || uuid()

  return normalizeKey(rootPath, directory, tenantId, resolvedFileName)
}

export function buildPublicUrl(baseUrl: string | undefined, key: string) {
  const base = `${baseUrl || ''}`.replace(/\/+$/, '')
  const normalizedKey = `${key || ''}`.replace(/^\/+/, '')

  if (!base) {
    return normalizedKey
  }

  return [base, normalizedKey].filter(Boolean).join('/')
}
