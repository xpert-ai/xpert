import { useState, useRef, useEffect } from 'react'
import { Input } from '@xpert-ai/shadcn-ui'
import type { ProjectConfigurationSection } from '@xpert-ai/contracts'
import { TypeEditor } from './type'
import { ExpertsEditor } from './experts'
import { MembersEditor } from './members'
import { SkillsEditor } from './skills'
import { ConnectorsEditor } from './connectors'
import { AutomationsEditor } from './automations'
import { mutate, useEditor, Status, Confirm, type EditorProps } from './shared'
import { configurationI18n } from '../i18n'
function DeleteEditor({ overview, locale, onDeleted }: EditorProps) {
    const t = configurationI18n(locale), [name, setName] = useState(''), state = useEditor(async () => null, []), active = useRef(true)
    useEffect(() => () => { active.current = false }, [])
    if (!overview.isOwner || overview.applicationManaged) return <p>{t.t('managed')}</p>
    return <div className="space-y-4"><p className="text-sm text-muted-foreground">{t.t('deleteWarning', { name: overview.name })}</p>
        <Status {...state} locale={locale} /><Input aria-label={t.t('confirmProjectName')} value={name} onChange={(event) => setName(event.target.value)} disabled={state.busy} />
        <Confirm title={t.t('delete')} description={t.t('deleteWarning', { name: overview.name })} locale={locale} disabled={name !== overview.name || state.busy}
            action={() => void state.run(async () => { await mutate('delete', { name }); if (active.current) onDeleted() }, false)} />
    </div>
}
const panels = { type: TypeEditor, experts: ExpertsEditor, members: MembersEditor, skills: SkillsEditor, connectors: ConnectorsEditor, automations: AutomationsEditor, delete: DeleteEditor }
export function ConfigurationEditor({ section, ...props }: EditorProps & { section: ProjectConfigurationSection }) {
    const Panel = panels[section]
    return <Panel {...props} />
}
