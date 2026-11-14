import { useState } from 'react'
import { z } from 'zod'
import { Input, Button } from '@xpert-ai/shadcn-ui'
import { action, mutate, useEditor, Status, Choice, Pager, Search, Confirm, type EditorProps } from './shared'
import { configurationI18n } from '../i18n'
const catalogSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })), total: z.number(), canInvite: z.boolean(),
    invitations: z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), status: z.string() })) })
export function MembersEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale), [page, setPage] = useState(1), [search, setSearch] = useState('')
    const [userId, setUserId] = useState(''), [role, setRole] = useState('member'), [email, setEmail] = useState('')
    const state = useEditor(() => overview.canManage ? action('members', { page, search }, catalogSchema) : Promise.resolve(null),
        [overview.canManage, page, search])
    const roles = (['manager', 'editor', 'member'] as const).map((value) => ({ value, label: t.t(value) }))
    return <div className="space-y-4"><Status {...state} locale={locale} />
        {overview.members.map((member) => <div key={member.id} className="flex flex-wrap items-center gap-2 border-b pb-3">
            <span className="min-w-32 flex-1">{member.name}</span>
            {overview.canManage && member.role !== 'owner' ? <>
                <div className="w-36"><Choice label={t.t('role')} value={member.role} options={roles} disabled={state.busy}
                    onChange={(role) => void state.run(() => mutate('member-role', { userId: member.id, role }))} /></div>
                <Confirm title={t.t('remove')} description={t.t('removeMemberWarning', { name: member.name })} locale={locale} disabled={state.busy}
                    action={() => void state.run(() => mutate('member-remove', { userId: member.id }))} />
                {overview.isOwner && <Confirm title={t.t('transferOwner')} description={t.t('transferOwnerWarning', { name: member.name })} locale={locale} disabled={state.busy}
                    action={() => void state.run(() => mutate('member-owner', { userId: member.id }))} />}
            </> : <span className="text-sm text-muted-foreground">{t.t(member.role)}</span>}
        </div>)}
        {overview.canManage && state.data && <>
            <h3 className="font-medium">{t.t('addMember')}</h3><Search value={search} onChange={(value) => { setSearch(value); setPage(1) }} locale={locale} />
            <Choice label={t.t('selectMember')} value={userId} onChange={setUserId} disabled={state.busy}
                options={state.data.items.filter((item) => !overview.members.some((member) => member.id === item.id)).map((item) => ({ value: item.id, label: item.name }))} />
            <Choice label={t.t('role')} value={role} onChange={setRole} options={roles} disabled={state.busy} />
            <Button disabled={state.busy || !userId} onClick={() => void state.run(() => mutate('member-add', { userId, role }))}>{t.t('add')}</Button>
            <Pager page={page} total={state.data.total} onPage={setPage} busy={state.busy} locale={locale} />
            {state.data.canInvite && <form className="space-y-3 border-t pt-4" onSubmit={(event) => { event.preventDefault(); void state.run(async () => { await mutate('member-invite', { email, role }); setEmail('') }) }}>
                <h3 className="font-medium">{t.t('inviteMember')}</h3><Input type="email" aria-label={t.t('email')} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={state.busy} />
                <Button disabled={state.busy} type="submit">{t.t('sendInvitation')}</Button></form>}
            {state.data.invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-2"><span className="break-all text-sm">{invitation.email}</span>
                {invitation.status === 'pending' && <Button variant="outline" disabled={state.busy} onClick={() => void state.run(() => mutate('invitation-revoke', { invitationId: invitation.id }))}>{t.t('revoke')}</Button>}</div>)}
        </>}
    </div>
}
