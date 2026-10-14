import type { TemplateReadiness } from '@xpert-ai/contracts'
import { Button } from '@xpert-ai/shadcn-ui'
import { t } from '../i18n'

export function TemplateManifestDetails({
  readiness,
  onManage
}: {
  readiness?: TemplateReadiness
  onManage: () => void
}) {
  if (!readiness) return null
  return (
    <section className="space-y-3 border-t border-border pt-4" aria-label={t('Template requirements')}>
      <h3 className="font-medium">
        {t('Template requirements')}
        {readiness.manifestVersion ? ` · v${readiness.manifestVersion}` : ''}
      </h3>
      {readiness.legacy && (
        <p className="text-sm text-muted-foreground">{t('Legacy template: requirements were not declared.')}</p>
      )}
      {readiness.capabilities && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            {t('Assistant capabilities from the template. Runtime access depends on current permissions and bindings.')}
          </p>
          {readiness.capabilities.agents.map((agent) => (
            <div key={agent.key}>
              <strong>{agent.label}</strong>
              {agent.middleware.map((middleware, index) => (
                <div key={index} className="text-muted-foreground">
                  {middleware.provider}
                  {middleware.toolNames.length ? ` · ${middleware.toolNames.join(', ')}` : ''}
                </div>
              ))}
            </div>
          ))}
          {readiness.capabilities.skills.map((skill, index) => (
            <div key={index}>Skill · {skill.componentKey}</div>
          ))}
          <div>
            {t('Seed memories')}: {readiness.capabilities.seedMemoryCount}
          </div>
          {readiness.capabilities.sandbox && <div>{t('Server sandbox')}</div>}
        </div>
      )}
      <ul className="space-y-2 text-sm">
        {readiness.checks.map((check, index) => (
          <li key={`${check.kind}:${check.key}:${index}`} className="flex justify-between gap-3">
            <span className="min-w-0 break-words">
              {check.key}
              {check.version ? ` · ${check.version}` : ''}
              <span className="ml-2 text-muted-foreground">{t(check.required ? 'Required' : 'Optional')}</span>
            </span>
            <span
              className={
                ['ready', 'pending-configuration'].includes(check.status) ? 'text-muted-foreground' : 'text-destructive'
              }
            >
              {check.message}
            </span>
          </li>
        ))}
      </ul>
      {readiness.files && (
        <div className="space-y-2 text-sm">
          <p>
            {t(
              readiness.files.scope === 'user'
                ? 'Initial files are isolated for each user.'
                : 'Initial files are shared by authorized users.'
            )}
          </p>
          <ul>
            {readiness.files.entries.map((entry) => (
              <li key={entry.path} className="font-mono text-xs">
                {entry.path}
                {entry.version ? ` · ${entry.version}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">{t('Existing files and ledger entries are preserved on retry.')}</p>
        </div>
      )}
      {readiness.checks.some(
        (check) => ['plugin', 'resource'].includes(check.kind) && ['missing', 'incompatible'].includes(check.status)
      ) && (
        <Button type="button" variant="outline" onClick={onManage}>
          {t('Manage template dependencies')}
        </Button>
      )}
    </section>
  )
}
