import { useEffect, useId, useState } from 'react'
import { Mail, UserRoundPlus } from 'lucide-react'
import { z } from 'zod'
import { Badge, Button, Input } from '@xpert-ai/shadcn-ui'
import { action, mutate, useEditor, Status, Choice, Pager, Confirm, type EditorProps } from './shared'
import { CatalogPanel, CatalogSearch, CatalogTrigger, EmptyMessage, SectionHeading } from './catalog-layout'
import { configurationI18n } from '../i18n'

const catalogSchema = z.object({
    items: z.array(z.object({ id: z.string(), name: z.string() })), total: z.number(), canInvite: z.boolean(),
    invitations: z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), status: z.string() }))
})

export function MembersEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale)
    const id = useId()
    const [panel, setPanel] = useState<'add' | 'invite' | null>(null)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [role, setRole] = useState('member')
    const [inviteRole, setInviteRole] = useState('member')
    const [email, setEmail] = useState('')
    const [notice, setNotice] = useState('')
    const state = useEditor(() => overview.canManage ? action('members', { page, search }, catalogSchema) : Promise.resolve(null),
        [overview.canManage, page, search])
    const roles = (['member', 'editor', 'manager'] as const).map((value) => ({ value, label: t.t(value) }))
    const total = state.data?.total
    useEffect(() => {
        if (total !== undefined && page > 1 && (page - 1) * 20 >= total) setPage(Math.max(1, Math.ceil(total / 20)))
    }, [page, total])
    function toggle(next: 'add' | 'invite') {
        setPanel(panel === next ? null : next)
        setNotice('')
        setPage(1)
        setSearch('')
    }
    return <div className="space-y-4">
        <SectionHeading title={t.t('members')} count={overview.members.length}>
            {overview.canManage && <>
                {state.data?.canInvite && <CatalogTrigger secondary label={t.t('inviteByEmail')} icon={<Mail />}
                    controls={id + '-invite'} expanded={panel === 'invite'} onClick={() => toggle('invite')} />}
                <CatalogTrigger label={t.t('addMember')} icon={<UserRoundPlus />} controls={id} expanded={panel === 'add'} onClick={() => toggle('add')} />
            </>}
        </SectionHeading>
        <Status {...state} locale={locale} />
        {state.error && <Button variant="outline" size="sm" onClick={() => void state.load()}>{t.t('retry')}</Button>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {overview.canManage && panel === 'add' && <CatalogPanel id={id} title={t.t('memberDirectory')}>
            <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <CatalogSearch label={t.t('memberSearch')} value={search} onChange={(value) => { setSearch(value); setPage(1); setNotice('') }} />
                <div className="flex shrink-0 items-center gap-2 text-sm"><span className="whitespace-nowrap">{t.t('role')}</span>
                    <div className="w-28"><Choice label={t.t('role')} value={role} onChange={setRole} options={roles} disabled={state.busy} /></div></div>
            </div>
            {state.data && <><ul className="divide-y">
                {state.data.items.map((user) => <li key={user.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 break-words text-sm">{user.name}</span>
                    <Button size="sm" variant="outline" disabled={state.busy} onClick={() => void state.run(async () => {
                        await mutate('member-add', { userId: user.id, role })
                        setNotice(t.t('memberAdded', { name: user.name }))
                    })}>{t.t('add')}</Button>
                </li>)}</ul>
                {total === 0 && <EmptyMessage>{t.t(search.trim() ? 'noResults' : 'noMembers')}</EmptyMessage>}
                <Pager page={page} total={state.data.total} onPage={setPage} busy={state.busy} locale={locale} />
            </>}
        </CatalogPanel>}
        {overview.canManage && panel === 'invite' && state.data?.canInvite && <CatalogPanel id={id + '-invite'} title={t.t('inviteMember')}>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
                event.preventDefault()
                void state.run(async () => { await mutate('member-invite', { email: email.trim(), role: inviteRole }); setEmail('') })
            }}>
                <label className="min-w-44 flex-1 space-y-1 text-sm">{t.t('email')}
                    <Input type="email" aria-label={t.t('email')} required placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={state.busy} /></label>
                <div className="space-y-1 text-sm"><span>{t.t('role')}</span>
                    <Choice label={t.t('role')} value={inviteRole} onChange={setInviteRole} options={roles} disabled={state.busy} /></div>
                <Button disabled={state.busy || !email.trim()} type="submit">{t.t('sendInvitation')}</Button>
            </form>
        </CatalogPanel>}
        <ul className="divide-y rounded-lg border px-3 sm:px-4">
            {overview.members.map((member) => <li key={member.id} className="flex flex-wrap items-center gap-2 py-3">
                <span className="min-w-28 flex-1 break-words text-sm font-medium">{member.name}</span>
                {overview.canManage && member.role !== 'owner' ? <>
                    <div className="w-28"><Choice label={t.t('role')} value={member.role} options={roles} disabled={state.busy}
                        onChange={(role) => void state.run(() => mutate('member-role', { userId: member.id, role }))} /></div>
                    <Confirm title={t.t('remove')} description={t.t('removeMemberWarning', { name: member.name })} locale={locale} disabled={state.busy}
                        action={() => void state.run(() => mutate('member-remove', { userId: member.id }))} />
                    {overview.isOwner && <Confirm title={t.t('transferOwner')} description={t.t('transferOwnerWarning', { name: member.name })} locale={locale} disabled={state.busy}
                        action={() => void state.run(() => mutate('member-owner', { userId: member.id }))} />}
                </> : <Badge variant="secondary">{t.t(member.role)}</Badge>}
            </li>)}
        </ul>
        {overview.canManage && state.data?.invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-2 border-t py-2">
            <span className="break-all text-sm">{invitation.email}</span>
            {invitation.status === 'pending' && <Button variant="outline" disabled={state.busy} onClick={() => void state.run(() => mutate('invitation-revoke', { invitationId: invitation.id }))}>{t.t('revoke')}</Button>}
        </div>)}
    </div>
}
