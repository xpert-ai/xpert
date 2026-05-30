import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

export const WORKBENCH_FILE_OPEN_COMMAND = 'workbench.file.open'

export type WorkbenchOpenFile = {
  id?: string
  fileId?: string
  fileAssetId?: string
  storageFileId?: string
  name: string
  mimeType?: string
  size?: number
  url: string
  previewUrl?: string
}

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

  return {
    id: getString(payload.id) ?? getString(payload.fileAssetId) ?? getString(payload.fileId),
    fileId: getString(payload.fileId) ?? getString(payload.fileAssetId),
    fileAssetId: getString(payload.fileAssetId) ?? getString(payload.fileId),
    storageFileId: getString(payload.storageFileId),
    name: getString(payload.name) ?? getString(payload.originalName) ?? 'source-document',
    mimeType: getString(payload.mimeType) ?? getString(payload.mimetype),
    size: typeof payload.size === 'number' && Number.isFinite(payload.size) ? payload.size : undefined,
    url,
    previewUrl: getString(payload.previewUrl) ?? url
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
