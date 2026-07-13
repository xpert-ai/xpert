import {
  WORKBENCH_FILE_OPEN_COMMAND,
  type WorkbenchOpenFile,
  type WorkbenchOpenFileEvidence,
  type WorkbenchOpenFileEvidenceBox
} from '@xpert-ai/contracts'

import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

/** Host-only registration behavior; this is not part of the plugin wire contract. */
type WorkbenchFileOpenCommandOptions = {
  openFile?: (file: WorkbenchOpenFile) => void
}

export function registerWorkbenchFileOpenCommand(
  registry: ViewClientCommandRegistry,
  options: WorkbenchFileOpenCommandOptions = {}
) {
  return registry.register(WORKBENCH_FILE_OPEN_COMMAND, async (payload) => {
    const file = toWorkbenchOpenFile(payload)
    if (!file) {
      return {
        success: false,
        code: 'bad_request',
        message: 'Previewable file URL is required.'
      }
    }

    if (options.openFile) {
      options.openFile(file)
    } else {
      window.open(file.previewUrl || file.url, '_blank', 'noopener,noreferrer')
    }

    return {
      success: true,
      status: 'opened',
      file
    }
  })
}

function toWorkbenchOpenFile(payload: unknown): WorkbenchOpenFile | null {
  if (!isRecord(payload)) {
    return null
  }

  const url = getString(payload.previewUrl) ?? getString(payload.url) ?? getString(payload.fileUrl)
  if (!url) {
    return null
  }

  const evidence = toWorkbenchOpenFileEvidence(payload.evidence)
  return {
    id: getString(payload.id) ?? getString(payload.fileAssetId) ?? getString(payload.fileId),
    fileId: getString(payload.fileId) ?? getString(payload.fileAssetId),
    fileAssetId: getString(payload.fileAssetId) ?? getString(payload.fileId),
    storageFileId: getString(payload.storageFileId),
    name: getString(payload.name) ?? getString(payload.originalName) ?? 'source-document',
    mimeType: getString(payload.mimeType) ?? getString(payload.mimetype),
    size: typeof payload.size === 'number' && Number.isFinite(payload.size) ? payload.size : undefined,
    url,
    previewUrl: getString(payload.previewUrl) ?? url,
    ...(evidence ? { evidence } : {})
  }
}

function toWorkbenchOpenFileEvidence(value: unknown): WorkbenchOpenFileEvidence | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const locator = toWorkbenchOpenFileEvidenceLocator(value.locator)
  const confidence = getFiniteNumber(value.confidence)
  const evidence: WorkbenchOpenFileEvidence = {
    ...(getString(value.observationId) ? { observationId: getString(value.observationId) } : {}),
    ...(getString(value.attributeCode) ? { attributeCode: getString(value.attributeCode) } : {}),
    ...(getString(value.displayValue) ? { displayValue: getString(value.displayValue) } : {}),
    ...(getString(value.text) ? { text: getString(value.text) } : {}),
    ...(getString(value.method) ? { method: getString(value.method) } : {}),
    ...(getString(value.region) ? { region: getString(value.region) } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(locator ? { locator } : {})
  }

  return Object.values(evidence).some((item) => item !== undefined) ? evidence : undefined
}

function toWorkbenchOpenFileEvidenceLocator(value: unknown): WorkbenchOpenFileEvidence['locator'] | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const page = getPositiveInteger(value.page)
  const recognitionRotation = getFiniteNumber(value.recognitionRotation)
  const orientationConfidence = getFiniteNumber(value.orientationConfidence)
  const box = toWorkbenchOpenFileEvidenceBox(value.box)
  const locator: NonNullable<WorkbenchOpenFileEvidence['locator']> = {
    ...(getString(value.sourceType) ? { sourceType: getString(value.sourceType) } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(getString(value.coordinateSpace) ? { coordinateSpace: getString(value.coordinateSpace) } : {}),
    ...(recognitionRotation !== undefined ? { recognitionRotation } : {}),
    ...(orientationConfidence !== undefined ? { orientationConfidence } : {}),
    ...(box ? { box } : {})
  }

  return Object.values(locator).some((item) => item !== undefined) ? locator : undefined
}

function toWorkbenchOpenFileEvidenceBox(value: unknown): WorkbenchOpenFileEvidenceBox | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const x = getFiniteNumber(value.x)
  const y = getFiniteNumber(value.y)
  const width = getFiniteNumber(value.width)
  const height = getFiniteNumber(value.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }

  return { x, y, width, height }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}
