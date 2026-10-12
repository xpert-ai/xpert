import { useState } from 'react'
import { Button, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/shadcn-ui'
import { t } from '../i18n'
import { ApplicationToolsetEditor } from './ApplicationToolsetEditor'
import type { ApplicationInput, ApplicationSetup, ApplicationToolsetSelection } from '../catalog-types'

export function ApplicationToolsets({
  application,
  setup,
  selections,
  onSelections,
  disabled,
  webUrl,
  onRefresh,
  onBusy,
  onEditing
}: {
  application: ApplicationInput
  setup: ApplicationSetup
  selections: ApplicationToolsetSelection[]
  onSelections: (selections: ApplicationToolsetSelection[]) => void
  disabled: boolean
  webUrl: string
  onRefresh: () => void
  onBusy: (busy: boolean) => void
  onEditing: (editing: boolean) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const select = (key: string, toolsetId: string) =>
    onSelections([...selections.filter((item) => item.key !== key), { key, toolsetId }])
  const close = () => {
    setEditing(null)
    onEditing(false)
  }
  if (!setup.toolsetRequirements.length) return null
  return (
    <section className="space-y-5 border-t pt-5" aria-label={t('Tool configurations')}>
      <div className="space-y-2">
        <h3 className="font-medium">{t('Tool configurations')}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'Select an existing configuration or create one for this app. Required tools must be configured before installation.'
          )}
        </p>
      </div>
      {setup.toolsetRequirements.map((requirement) => (
        <div className="space-y-3" key={requirement.key}>
          <Label htmlFor={`app-toolset-${requirement.key}`}>{requirement.label}</Label>
          {requirement.instanceName && <p className="text-xs text-muted-foreground">{requirement.instanceName}</p>}
          {!requirement.providerAvailable ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('Install the required tool provider plugin: {{plugin}}', { plugin: requirement.pluginName })}
            </p>
          ) : (
            <>
              <Select
                value={
                  requirement.configuredToolsetId ??
                  selections.find((item) => item.key === requirement.key)?.toolsetId ??
                  ''
                }
                onValueChange={(id) => select(requirement.key, id)}
                disabled={disabled || !!editing || !!requirement.configuredToolsetId}
              >
                <SelectTrigger id={`app-toolset-${requirement.key}`} className="w-full">
                  <SelectValue placeholder={t('Select a tool configuration')} />
                </SelectTrigger>
                <SelectContent>
                  {requirement.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name} · {option.workspaceName || t('Personal workspace')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!requirement.options.length && (
                <p className="text-xs text-muted-foreground">
                  {t('No available configuration. Create one to continue.')}
                </p>
              )}
              {requirement.configuredToolsetId && (
                <p className="text-xs text-muted-foreground">{t('Configured for this app')}</p>
              )}
              {setup.canConfigure && editing !== requirement.key && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || !!editing}
                  onClick={() => {
                    setEditing(requirement.key)
                    onEditing(true)
                  }}
                >
                  {requirement.configuredToolsetId ? t('Edit configuration') : t('New configuration')}
                </Button>
              )}
              {editing === requirement.key && (
                <ApplicationToolsetEditor
                  application={application}
                  requirement={requirement}
                  webUrl={webUrl}
                  onBusy={onBusy}
                  onClose={close}
                  onSaved={(selection) => {
                    select(selection.key, selection.toolsetId)
                    close()
                    onRefresh()
                  }}
                />
              )}
            </>
          )}
        </div>
      ))}
    </section>
  )
}
