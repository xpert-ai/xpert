import { useEffect, useState } from 'react'
import { LoaderCircle, ShieldAlert, ShieldCheck, Info, RotateCw } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import { invoke } from '../host'
import { t } from '../i18n'
import type { ConnectionConfig } from '../types'
import type { CertificateCheck, ConnectionUrlField } from './certificate-types'

const fieldLabels: Record<ConnectionUrlField, string> = {
  apiUrl: 'API service URL',
  webUrl: 'Xpert web URL',
  frameUrl: 'ChatKit URL'
}
const reasons = {
  authority:
    'This certificate was issued by an authority your device does not trust, such as a self-signed certificate.',
  date: 'This certificate has expired or is not yet valid. Check the certificate and device clock.',
  hostname: 'This certificate does not match the service hostname.',
  other: 'This certificate did not pass the system security checks.'
}

export function ConnectionCertificates({ draft }: { draft: ConnectionConfig }) {
  const { apiUrl, webUrl, frameUrl } = draft
  const query = JSON.stringify([apiUrl, webUrl, frameUrl])
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ query: string; checks: CertificateCheck[] } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!window.xpertDesktop) return
    let active = true
    setResult(null)
    setFailed(false)
    const timer = setTimeout(() => {
      invoke('checkConnectionCertificates', { apiUrl, webUrl, frameUrl }).then(
        (checks) => {
          if (active) setResult({ query, checks })
        },
        () => {
          if (active) setFailed(true)
        }
      )
    }, 600)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [apiUrl, webUrl, frameUrl, query, refresh])
  if (!window.xpertDesktop) return null
  const checks = result?.query === query ? result.checks : null
  const pending = !checks && !failed
  return (
    <div className="space-y-2" aria-live="polite" aria-busy={pending}>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          {pending && <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />}
          {pending ? t('Checking service certificates…') : t('Service certificates')}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10"
          disabled={pending}
          aria-label={t('Recheck certificates')}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      {failed && (
        <p className="text-sm text-muted-foreground">
          {t('Certificate check failed. You can retry without changing your settings.')}
        </p>
      )}
      {checks?.map((check) => {
        const warning = check.status === 'untrusted'
        const Icon = warning ? ShieldAlert : check.status === 'trusted' ? ShieldCheck : Info
        return (
          <div
            key={check.origin || check.fields[0]}
            className={
              warning
                ? 'flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm'
                : 'flex gap-2 text-sm text-muted-foreground'
            }
          >
            <Icon
              aria-hidden="true"
              className={warning ? 'mt-0.5 size-4 shrink-0 text-warning' : 'mt-0.5 size-3.5 shrink-0'}
            />
            <div className="min-w-0 space-y-1">
              <p className={warning ? 'font-medium' : ''}>
                {warning
                  ? t('Untrusted service certificate')
                  : check.status === 'trusted'
                    ? t('Certificate verified')
                    : check.status === 'http'
                      ? t('Local HTTP connection — no TLS certificate')
                      : check.status === 'invalid'
                        ? t('Enter a valid service URL to check its certificate.')
                        : t('Unable to determine certificate trust')}
              </p>
              <p className="break-words text-sm text-muted-foreground">
                {check.origin && <span>{check.origin} · </span>}
                {check.fields.map((field) => t(fieldLabels[field])).join(' / ')}
              </p>
              {check.status === 'untrusted' && (
                <>
                  <p className="text-sm leading-relaxed">{t(reasons[check.reason])}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {draft.allowUntrustedCertificates
                      ? t('Your setting allows this connection after saving. The certificate remains untrusted.')
                      : t('Connections to this host are blocked unless you allow untrusted service certificates.')}
                  </p>
                </>
              )}
              {check.status === 'unreachable' && (
                <p className="text-sm">
                  {t('The service could not be reached. This does not mean its certificate is untrusted.')}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
