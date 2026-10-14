import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AssistantTemplateOverview } from '@xpert-ai/contracts'
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@xpert-ai/shadcn-ui'
import { invoke } from '../host'
import { t } from '../i18n'

const sections = [
  ['memories', 'Memories', 'What it knows at the start'],
  ['skills', 'Skills', 'Playbooks it can run'],
  ['routines', 'Routines', 'Work it can run on a schedule'],
  ['integrations', 'Integrations', 'Apps and services it can use']
]
const decision = { allow: 'Allow', approve: 'Ask for approval', deny: 'Deny' }
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  )
}
function Copy({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-wrap break-words leading-7 text-muted-foreground">{children}</p>
}

export function TemplateOverview({ id, onInstall }: { id: string; onInstall: () => void }) {
  const [detail, setDetail] = useState<AssistantTemplateOverview | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setDetail(null)
    setError('')
    void invoke('templateOverview', { id })
      .then((result) => {
        if (current) setDetail(result)
      })
      .catch((error: unknown) => {
        if (current) setError(error instanceof Error ? error.message : 'Could not load the template introduction.')
      })
    return () => {
      current = false
    }
  }, [id, revision])
  if (error)
    return (
      <div role="alert" className="space-y-4 px-6 py-10">
        <p>{t(error)}</p>
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
          {t('Retry')}
        </Button>
      </div>
    )
  if (!detail)
    return (
      <p role="status" className="px-6 py-10 text-muted-foreground">
        {t('Loading template…')}
      </p>
    )
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 [scrollbar-gutter:stable]">
      <header className="space-y-4 border-b pb-6">
        <p className="text-sm text-muted-foreground">
          {t('By')} {detail.publisher}
          {detail.version ? ` · v${detail.version}` : ''}
        </p>
        <Copy>{detail.description}</Copy>
        <Button onClick={onInstall}>{t('Import Assistant')}</Button>
      </header>
      <Tabs defaultValue="memories" orientation="vertical" className="mt-6 gap-6">
        <TabsList className="w-52 shrink-0 self-start justify-start rounded-xl bg-muted/40 p-1">
          {sections.map(([key, label, hint]) => (
            <TabsTrigger
              key={key}
              value={key}
              className="h-auto flex-none justify-start rounded-lg px-4 py-3 text-left whitespace-normal"
            >
              <span>
                <strong className="block text-sm">{t(label)}</strong>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{t(hint)}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="memories" className="min-w-0 flex-1 space-y-7 rounded-xl bg-muted/30 p-6">
          <Block title={t('Role & working instructions')}>
            <Copy>{detail.instructions || detail.description}</Copy>
          </Block>
          <Block title={`${t('Initial knowledge')} · ${detail.memories.length}`}>
            {detail.memories.length ? (
              detail.memories.map((memory, index) => (
                <div key={index} className="space-y-2 border-b pb-4">
                  <h4 className="font-medium">{memory.title}</h4>
                  <Copy>{memory.content || t('Structured initial knowledge is included in this template.')}</Copy>
                </div>
              ))
            ) : (
              <Copy>{t('No initial memories declared.')}</Copy>
            )}
          </Block>
          {detail.onboarding && (
            <Block title={t('Getting started')}>
              <Copy>{detail.onboarding.completionCriteria}</Copy>
              <p>
                {t('Preferences to collect')}: {detail.onboarding.preferences.join(', ') || '—'}
              </p>
            </Block>
          )}
          {detail.files && (
            <Block title={t('Working files')}>
              <Copy>
                {t(
                  detail.files.scope === 'user'
                    ? 'Each user has a separate file workspace.'
                    : 'Authorized users share this Assistant’s file workspace.'
                )}
              </Copy>
              <ul className="space-y-2">
                {detail.files.paths.map((path) => (
                  <li key={path} className="break-all font-mono text-sm">
                    {path}
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </TabsContent>
        <TabsContent value="skills" className="min-w-0 flex-1 space-y-6 rounded-xl bg-muted/30 p-6">
          <h2 className="text-xl font-semibold">{t('Skills')}</h2>
          {detail.skills.length ? (
            detail.skills.map((skill, index) => (
              <Block key={index} title={skill.componentKey}>
                <Copy>{skill.pluginName}</Copy>
                {skill.componentKey === detail.onboarding?.skill && (
                  <p>
                    {t('Getting started')} · {detail.onboarding.completionCriteria}
                  </p>
                )}
              </Block>
            ))
          ) : (
            <Copy>{t('No portable skill dependencies declared. See its role and tools below.')}</Copy>
          )}
          <Block title={t('Roles & tools')}>
            {detail.agents.map((agent) => (
              <div key={agent.key} className="space-y-2">
                <h4 className="font-medium">{agent.label}</h4>
                {agent.middleware.map((item, index) => (
                  <Copy key={index}>
                    {item.provider}
                    {item.toolNames.length ? ` · ${item.toolNames.join(', ')}` : ''}
                  </Copy>
                ))}
              </div>
            ))}
          </Block>
        </TabsContent>
        <TabsContent value="routines" className="min-w-0 flex-1 space-y-6 rounded-xl bg-muted/30 p-6">
          <h2 className="text-xl font-semibold">{t('Routines')}</h2>
          <Copy>
            {t('Routines start paused. After importing, review the schedule and timezone before enabling them.')}
          </Copy>
          {detail.routines.length ? (
            detail.routines.map((routine) => (
              <Block key={routine.key} title={routine.key}>
                <Copy>{routine.output}</Copy>
                <p className="text-sm text-muted-foreground">
                  {t('Skill')}: {routine.skill}
                </p>
                <p className="text-sm text-muted-foreground">
                  {routine.expression} · {t(routine.timezone === 'user' ? 'User timezone' : 'Organization timezone')}
                </p>
                {routine.trigger === 'event' && (
                  <Copy>{t('Event triggers are declared but are not supported by the current runtime.')}</Copy>
                )}
              </Block>
            ))
          ) : (
            <Copy>{t('No routines declared.')}</Copy>
          )}
        </TabsContent>
        <TabsContent value="integrations" className="min-w-0 flex-1 space-y-6 rounded-xl bg-muted/30 p-6">
          <h2 className="text-xl font-semibold">{t('Integrations')}</h2>
          <Copy>
            {t('These are template requirements. Availability and account connections are checked during setup.')}
          </Copy>
          {detail.integrations.length ? (
            detail.integrations.map((item) => (
              <Block key={item.key} title={`${item.label} · ${t(item.required ? 'Required' : 'Optional')}`}>
                <Copy>{item.description}</Copy>
                {item.permissions.length > 0 && (
                  <p className="break-words text-sm text-muted-foreground">
                    {t('Requested permissions')}: {item.permissions.join(', ')}
                  </p>
                )}
              </Block>
            ))
          ) : (
            <Copy>{t('No external integrations declared.')}</Copy>
          )}
          <Block title={t('Action approval rules')}>
            {detail.operationPolicy ? (
              <>
                <p>
                  {t('Default action')}: {t(decision[detail.operationPolicy.default])}
                </p>
                {detail.operationPolicy.rules.map((rule) => (
                  <p key={rule.tool} className="break-words text-sm">
                    <strong>{rule.tool}</strong> · {t(decision[rule.decision])}
                    {rule.reason ? ` — ${rule.reason}` : ''}
                  </p>
                ))}
              </>
            ) : (
              <Copy>{t('No additional template approval rules. Platform and tool policies still apply.')}</Copy>
            )}
          </Block>
        </TabsContent>
      </Tabs>
    </div>
  )
}
