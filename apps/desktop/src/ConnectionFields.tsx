import { t } from './i18n'
import { Input, Label } from '@xpert-ai/shadcn-ui'
import type { ConnectionConfig } from './types'

export function ConnectionFields({
  draft,
  onChange
}: {
  draft: ConnectionConfig
  onChange: (config: ConnectionConfig) => void
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="api-url">{t('API service URL')}</Label>
        <Input
          id="api-url"
          type="url"
          required
          value={draft.apiUrl}
          onChange={(e) => onChange({ ...draft, apiUrl: e.target.value })}
          placeholder="https://api.example.com"
        />
        <p className="text-xs text-muted-foreground">{t('Enter the service root URL, without /api.')}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="web-url">{t('Xpert web URL')}</Label>
        <Input
          id="web-url"
          type="url"
          required
          value={draft.webUrl}
          onChange={(e) => {
            const webUrl = e.target.value
            const followsWeb = draft.frameUrl === `${draft.webUrl.replace(/\/$/, '')}/chatkit/index.html`
            onChange({
              ...draft,
              webUrl,
              ...(followsWeb ? { frameUrl: `${webUrl.replace(/\/$/, '')}/chatkit/index.html` } : {})
            })
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="frame-url">{t('ChatKit URL')}</Label>
        <Input
          id="frame-url"
          type="url"
          required
          value={draft.frameUrl}
          onChange={(e) => onChange({ ...draft, frameUrl: e.target.value })}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('Use the ChatKit page deployed by this service. Chats connect to this URL.')}
        </p>
      </div>
    </div>
  )
}
