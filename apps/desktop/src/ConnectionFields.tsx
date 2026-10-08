import { t } from './i18n'
import { chatkitUrl, followsWebUrl } from '../electron/connection/urls.mjs'
import { Input, Label, Switch } from '@xpert-ai/shadcn-ui'
import type { ConnectionConfig } from './types'
import { ConnectionCertificates } from './connection/ConnectionCertificates'

export function ConnectionFields({
  draft,
  onChange
}: {
  draft: ConnectionConfig
  onChange: (config: ConnectionConfig) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="api-url" className="text-sm leading-5">
          {t('API service URL')}
        </Label>
        <Input
          className="h-10 text-sm"
          id="api-url"
          type="url"
          required
          value={draft.apiUrl}
          onChange={(e) => onChange({ ...draft, apiUrl: e.target.value })}
          placeholder="https://api.xpertai.cn/api/"
        />
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          {t('Enter the API URL, including /api. Existing service root URLs also work.')}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="web-url" className="text-sm leading-5">
          {t('Xpert web URL')}
        </Label>
        <Input
          className="h-10 text-sm"
          id="web-url"
          type="url"
          required
          value={draft.webUrl}
          onChange={(e) => {
            const webUrl = e.target.value
            const followsWeb = followsWebUrl(draft.frameUrl, draft.webUrl)
            onChange({
              ...draft,
              webUrl,
              ...(followsWeb ? { frameUrl: chatkitUrl(webUrl) } : {})
            })
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="frame-url" className="text-sm leading-5">
          {t('ChatKit URL')}
        </Label>
        <Input
          className="h-10 text-sm"
          id="frame-url"
          type="url"
          required
          value={draft.frameUrl}
          onChange={(e) => onChange({ ...draft, frameUrl: e.target.value })}
        />
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          {t('Use the ChatKit page deployed by this service. Chats connect to this URL.')}
        </p>
      </div>
      <ConnectionCertificates draft={draft} />
      <div className="space-y-2 border-t pt-6">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="allow-untrusted-certificates" className="text-sm leading-5">
            {t('Allow untrusted service certificates')}
          </Label>
          <Switch
            id="allow-untrusted-certificates"
            checked={draft.allowUntrustedCertificates === true}
            disabled={!window.xpertDesktop}
            aria-describedby="certificate-setting-description"
            onCheckedChange={(allowUntrustedCertificates) => onChange({ ...draft, allowUntrustedCertificates })}
          />
        </div>
        <p id="certificate-setting-description" className="text-[0.8125rem] leading-5 text-muted-foreground">
          {t(
            'For self-signed certificates or private deployments you trust. Applies only to the configured API, web, and ChatKit hosts. Certificate identity will not be verified for these hosts.'
          )}
        </p>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          {window.xpertDesktop
            ? t('Changing this setting reloads the connection and requires signing in again.')
            : t(
                'This certificate setting is available in the Bosi desktop app; browser certificate settings are managed by your browser.'
              )}
        </p>
      </div>
    </div>
  )
}
