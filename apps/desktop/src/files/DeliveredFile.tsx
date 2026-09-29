import { useEffect, useRef, useState } from 'react'
import { CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT } from '@xpert-ai/chatkit-types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button } from '@xpert-ai/shadcn-ui'
import { Download, LoaderCircle } from 'lucide-react'
import { invoke } from '../host'
import { t } from '../i18n'

type Delivery = { blob: Blob; url: string; name: string; mimeType: string }

export function useDeliveredFile() {
  const [visible, setVisible] = useState(false)
  const [file, setFile] = useState<Delivery | null>(null)
  const [error, setError] = useState('')
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current++
    },
    []
  )
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url)
    },
    [file]
  )
  const close = () => {
    request.current++
    setVisible(false)
    setFile(null)
  }
  const open = async (event: { name: string; data?: unknown }) => {
    if (
      event.name !== CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT ||
      !event.data ||
      typeof event.data !== 'object' ||
      !('resource' in event.data)
    )
      return
    const resource = event.data.resource
    if (!resource || typeof resource !== 'object' || !('type' in resource) || resource.type !== 'artifact') return
    const generation = ++request.current
    setVisible(true)
    setFile(null)
    setError('')
    try {
      if (
        !('artifactId' in resource) ||
        typeof resource.artifactId !== 'string' ||
        !('artifactVersionId' in resource) ||
        typeof resource.artifactVersionId !== 'string'
      )
        throw new Error(t('Invalid file delivery.'))
      const preview = await invoke('deliveredFilePreview', {
        artifactId: resource.artifactId,
        artifactVersionId: resource.artifactVersionId
      })
      if (generation !== request.current) return
      const bytes = Uint8Array.from(atob(preview.base64), (character) => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: preview.mimeType })
      if (generation === request.current)
        setFile({ blob, url: URL.createObjectURL(blob), name: preview.name, mimeType: preview.mimeType })
    } catch (e) {
      if (generation === request.current)
        setError(e instanceof Error ? e.message : t('Could not load the delivered file.'))
    }
  }
  return {
    open,
    dialog: (
      <Dialog
        open={visible}
        onOpenChange={(value) => {
          if (!value) close()
        }}
      >
        <DialogContent className="flex h-[85vh] max-w-[90vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle className="truncate">{file?.name || t('File preview')}</DialogTitle>
            <DialogDescription>{t('Preview of the delivered version.')}</DialogDescription>
          </DialogHeader>
          {error ? (
            <div role="alert" className="p-6 text-destructive">
              {error}
            </div>
          ) : file ? (
            <FileContent file={file} />
          ) : (
            <div role="status" className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              {t('Loading file…')}
            </div>
          )}
          {file && (
            <div className="flex shrink-0 justify-end border-t px-6 py-3">
              <Button asChild variant="outline">
                <a href={file.url} download={file.name}>
                  <Download className="size-4" />
                  {t('Download')}
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }
}

function FileContent({ file }: { file: Delivery }) {
  const [document, setDocument] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const docx = file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  useEffect(() => {
    if (!docx) return
    let active = true
    const render = async () => {
      // Render off-DOM, then isolate document markup and links from the application.
      const host = window.document.createElement('div')
      const { renderAsync } = await import('docx-preview')
      await renderAsync(file.blob, host, undefined, { useBase64URL: true, renderAltChunks: false })
      if (active)
        setDocument(
          `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">${host.innerHTML}`
        )
    }
    void render().catch(() => {
      if (active) setError(true)
    })
    return () => {
      active = false
    }
  }, [file, docx])
  if (error)
    return (
      <p role="alert" className="p-6 text-muted-foreground">
        {t('Preview unavailable. Download the file to view it.')}
      </p>
    )
  if (docx)
    return document ? (
      <iframe title={file.name} srcDoc={document} sandbox="" className="min-h-0 w-full flex-1 border-0" />
    ) : (
      <div role="status" className="flex flex-1 items-center justify-center gap-2">
        <LoaderCircle className="size-4 animate-spin" />
        {t('Rendering document…')}
      </div>
    )
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimeType))
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <img src={file.url} alt={file.name} className="mx-auto max-w-full" />
      </div>
    )
  if (file.mimeType === 'application/pdf')
    return (
      <iframe title={file.name} src={file.url} sandbox="allow-same-origin" className="min-h-0 w-full flex-1 border-0" />
    )
  return <p className="p-6 text-muted-foreground">{t('Preview unavailable. Download the file to view it.')}</p>
}
