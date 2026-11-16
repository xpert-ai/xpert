import { useRef, useState, type FormEvent } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input
} from '@xpert-ai/shadcn-ui'
import { ChevronDown, FileArchive, GitBranch } from 'lucide-react'
import { pluginZipError } from '../electron/plugin-archive.mjs'
import { HostError, invoke, uploadOrganizationPluginZip } from './host'
import { t } from './i18n'

export function OrganizationPluginInstall({
  organization,
  organizationId,
  onInstalled,
  onDenied
}: {
  organization: string
  organizationId: string
  onInstalled: () => void
  onDenied: () => void
}) {
  const [source, setSource] = useState<'zip' | 'git' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const picker = useRef<HTMLInputElement>(null)
  const reset = () => {
    setSource(null)
    setFile(null)
    setNotice('')
    setError('')
  }
  const install = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || !source || (source === 'zip' && !file)) return
    submitting.current = true
    setPending(true)
    setError('')
    try {
      const data = new FormData(event.currentTarget)
      const result =
        source === 'zip' && file
          ? await uploadOrganizationPluginZip(organizationId, file)
          : await invoke('installOrganizationPlugin', {
              organizationId,
              url: String(data.get('url')),
              ref: String(data.get('ref')),
              subdirectory: String(data.get('subdirectory'))
            })
      reset()
      setNotice(t(result.existing ? '{{name}} is already installed.' : 'Installed {{name}}.', { name: result.name }))
      onInstalled()
    } catch (reason) {
      if (reason instanceof HostError && reason.status === 403) onDenied()
      else setError(reason instanceof Error ? reason.message : t('The operation failed. Please retry.'))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto" disabled={pending}>
            {t('Install plugin')} <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          className="w-max max-w-(--radix-dropdown-menu-content-available-width)"
        >
          <DropdownMenuItem onSelect={() => picker.current?.click()}>
            <FileArchive /> {t('Upload ZIP package…')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              reset()
              setSource('git')
            }}
          >
            <GitBranch /> {t('Install from Git repository…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label={t('ZIP plugin package')}
        accept=".zip,application/zip,application/x-zip-compressed"
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!selected || submitting.current) return
          reset()
          const invalid = pluginZipError(selected.name, selected.size)
          if (invalid) {
            setError(t(invalid))
            return
          }
          setFile(selected)
          setSource('zip')
        }}
      />
      {source && (
        <form key={source} className="order-last flex w-full flex-wrap items-end gap-3" onSubmit={install}>
          {source === 'git' ? (
            <>
              <label className="min-w-48 flex-1">
                {t('Git repository URL')}
                <Input className="mt-1" type="url" name="url" placeholder="https://…" required disabled={pending} />
              </label>
              <label>
                {t('Branch, tag or commit')}
                <Input className="mt-1" name="ref" required defaultValue="HEAD" disabled={pending} />
              </label>
              <label>
                {t('Package directory')}
                <Input className="mt-1" name="subdirectory" defaultValue="." disabled={pending} />
              </label>
            </>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 self-center">
              <FileArchive aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium" title={file?.name}>
                {file?.name}
              </span>
            </div>
          )}
          <Button size="sm" variant="ghost" type="button" onClick={reset} disabled={pending}>
            {t('Cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {t(pending ? 'Installing…' : 'Install in {{organization}}', { organization })}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="order-last w-full text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <span role="status" className="order-last w-full">
          {notice}
        </span>
      )}
    </>
  )
}
