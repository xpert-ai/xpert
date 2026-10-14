import { useState } from 'react'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
import type { TemplatePublicationPreview, TemplateUpgradePreview, TemplateUpgradeInput } from '@xpert-ai/contracts'
import { invoke } from '../host'
import { t } from '../i18n'

export function TemplateLifecyclePanel({ botId, webUrl }: { botId: string; webUrl: string }) {
  const [publication, setPublication] = useState<TemplatePublicationPreview | null>(null)
  const [upgrade, setUpgrade] = useState<TemplateUpgradePreview | null>(null)
  const [sources, setSources] = useState<import('@xpert-ai/contracts').TemplateUpgradeSource[]>([])
  const [targetTemplateId, setTargetTemplateId] = useState('')
  const [choices, setChoices] = useState<NonNullable<TemplateUpgradeInput['choices']>>({})
  const [version, setVersion] = useState('1.0.0')
  const [visibility, setVisibility] = useState<'team' | 'public'>('team')
  const [notes, setNotes] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await work()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const loadPublication = async () => {
    const result = await invoke('templatePublicationPreview', { botId })
    setPublication(result)
    setUpgrade(null)
    setReviewed(false)
    if (result.publication) {
      const parts = result.publication.version.split('.')
      parts[2] = String(Number(parts[2]) + 1)
      setVersion(parts.join('.'))
      setVisibility(result.publication.visibility)
    }
  }
  const loadUpgrade = async () => {
    const result = await invoke('templateUpgradePreview', { botId, targetTemplateId: targetTemplateId || undefined })
    setUpgrade(result)
    setPublication(null)
    setChoices(
      Object.fromEntries(
        result.changes.filter((change) => !change.conflict).map((change) => [change.section, 'replace'])
      )
    )
  }
  return (
    <section className="space-y-4 border-t pt-4">
      <h3 className="font-medium">{t('Template publishing & upgrades')}</h3>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void run(async () => setSources(await invoke('templateUpgradeSources', { botId })))}
      >
        {t('Select template source')}
      </Button>
      {!!sources.length && (
        <Label className="block space-y-1">
          {t('Target template source')}
          <select
            className="w-full rounded-md border border-input bg-background p-2"
            value={targetTemplateId}
            onChange={(event) => {
              setTargetTemplateId(event.target.value)
              setUpgrade(null)
            }}
          >
            <option value="">{t('Current template source')}</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} · {source.source || 'builtin'}
              </option>
            ))}
          </select>
        </Label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(loadPublication)}>
          {t('Preview publication')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(loadUpgrade)}>
          {t('Check for template updates')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {publication && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              'Review all text before sharing. Account and model bindings, business files, runtime memories, preferences and enabled routines are excluded.'
            )}
          </p>
          {!!publication.blocked.length && (
            <p role="alert">
              {t('Portable adapters are required for')}: {publication.blocked.join(', ')}
            </p>
          )}
          <details>
            <summary>{t('Portable template content')}</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
              {publication.content}
            </pre>
          </details>
          <Label className="block space-y-1">
            {t('Template version')}
            <Input value={version} onChange={(event) => setVersion(event.target.value)} />
          </Label>
          <Label className="block space-y-1">
            {t('Release notes')}
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Label>
          <Label className="block space-y-1">
            {t('Visibility')}
            <select
              className="w-full rounded-md border border-input bg-background p-2"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value === 'public' ? 'public' : 'team')}
            >
              <option value="team">{t('Current organization')}</option>
              <option value="public">{t('All signed-in platform users')}</option>
            </select>
          </Label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
            {t('I reviewed the portable content and removed private information from its text.')}
          </label>
          <Button
            type="button"
            disabled={busy || !reviewed || !!publication.blocked.length || !/^\d+\.\d+\.\d+$/.test(version)}
            onClick={() =>
              void run(async () => {
                await invoke('publishAssistantTemplate', {
                  botId,
                  input: {
                    revision: publication.revision,
                    contentHash: publication.contentHash,
                    visibility,
                    version,
                    releaseNotes: notes
                  }
                })
                await loadPublication()
                setMessage(t('Template published.'))
              })
            }
          >
            {t('Publish template')}
          </Button>
          {publication.publication && (
            <div className="space-y-2 text-sm">
              <p>
                {publication.publication.version} · {t(publication.publication.revoked ? 'Withdrawn' : 'Published')}
              </p>
              {!publication.publication.revoked && (
                <>
                  <Label className="block space-y-1">
                    {t('Share link')}
                    <Input
                      readOnly
                      value={`${webUrl.replace(/\/$/, '')}/explore/templates/${encodeURIComponent(publication.publication.id)}`}
                    />
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await invoke('revokeAssistantTemplate', { botId })
                        await loadPublication()
                      })
                    }
                  >
                    {t('Withdraw template')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {upgrade && (
        <div className="space-y-4">
          {upgrade.previousTemplateId && upgrade.previousTemplateId !== upgrade.templateId && (
            <p className="break-all text-sm">
              {t('Template source migration')}: {upgrade.previousTemplateId} → {upgrade.templateId}
            </p>
          )}
          <p>
            {t('Source version')}: {upgrade.version || '—'}
          </p>
          <p className="text-sm text-muted-foreground">{upgrade.releaseNotes}</p>
          {!upgrade.baselineAvailable && (
            <p>{t('This installation has no comparison baseline. Review every changed section explicitly.')}</p>
          )}
          {!!upgrade.blocked.length && (
            <p role="alert">
              {t('Portable adapters are required for')}: {upgrade.blocked.join(', ')}
            </p>
          )}
          {!upgrade.changes.length && !upgrade.blocked.length && <p>{t('Template content is up to date.')}</p>}
          {upgrade.changes.map((change) => (
            <div key={change.section} className="space-y-2 border-b pb-3">
              <h4 className="font-medium">
                {t(`Template section: ${change.section}`)}
                {change.conflict ? ` · ${t('Local changes detected')}` : ''}
              </h4>
              <details>
                <summary>{t('Compare changes')}</summary>
                <div className="grid gap-3">
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-xs">
                    {t('Current content')}\n{change.before}
                  </pre>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-xs">
                    {t('Template content')}\n{change.after}
                  </pre>
                </div>
              </details>
              <select
                aria-label={t(`Template section: ${change.section}`)}
                className="w-full rounded-md border border-input bg-background p-2"
                value={choices[change.section] ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'keep' || value === 'replace')
                    setChoices((current) => ({ ...current, [change.section]: value }))
                }}
              >
                <option value="" disabled>
                  {t('Choose how to handle this change')}
                </option>
                <option value="keep">{t('Keep my content')}</option>
                <option value="replace">{t('Use template content')}</option>
              </select>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            {t(
              'Upgrades preserve the Assistant identity, conversations, files and account bindings. New routines stay paused. Save a draft, then publish it explicitly.'
            )}
          </p>
          {(!!upgrade.changes.length || upgrade.previousTemplateId !== upgrade.templateId) && (
            <Button
              type="button"
              disabled={
                busy ||
                !!upgrade.blocked.length ||
                upgrade.changes.some((change) => !choices[change.section]) ||
                ['draft', 'failed'].includes(upgrade.operation?.state ?? '')
              }
              onClick={() =>
                void run(async () => {
                  await invoke('applyTemplateUpgrade', {
                    botId,
                    input: {
                      revision: upgrade.revision,
                      sourceHash: upgrade.sourceHash,
                      targetTemplateId: upgrade.templateId,
                      choices
                    }
                  })
                  await loadUpgrade()
                })
              }
            >
              {t('Save upgrade draft')}
            </Button>
          )}
          {upgrade.operation && (
            <div className="space-y-2">
              <p>{t(`Template upgrade: ${upgrade.operation.state}`)}</p>
              <div className="flex flex-wrap gap-2">
                {upgrade.operation.canResume && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await invoke('resumeTemplateUpgrade', { botId, operationId: upgrade.operation!.id })
                        await loadUpgrade()
                      })
                    }
                  >
                    {t('Publish upgrade')}
                  </Button>
                )}
                {upgrade.operation.canRollback && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await invoke('rollbackTemplateUpgrade', { botId, operationId: upgrade.operation!.id })
                        await loadUpgrade()
                      })
                    }
                  >
                    {t('Restore previous content')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
