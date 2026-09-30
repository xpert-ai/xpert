import { ArrowLeft, Search, X } from 'lucide-react'
import { Button, Input } from '@xpert-ai/shadcn-ui'
import { t } from '../i18n'
import branding from '../../electron/branding.json'
import { settingsGroups, type SettingsSection } from './sections'

export function SettingsSidebar({
  section,
  query,
  pending,
  signedIn,
  userName,
  onQuery,
  onSection,
  onBack
}: {
  section: SettingsSection
  query: string
  pending: boolean
  signedIn: boolean
  userName?: string
  onQuery: (query: string) => void
  onSection: (section: SettingsSection) => void
  onBack: () => void
}) {
  const needle = query.trim().toLocaleLowerCase()
  const groups = settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [group.label, item.label, item.description, ...item.keywords].some((key) =>
          t(key).toLocaleLowerCase().includes(needle)
        )
      )
    }))
    .filter((group) => group.items.length)
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-muted/70 lg:w-[312px]">
      <div className="window-drag h-12 shrink-0" />
      <div className="shrink-0 px-4 pt-2 pb-6 lg:px-5">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-start gap-3 bg-transparent px-4 text-sm"
          disabled={pending}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
          {signedIn ? t('Back to workspace') : t('Back to sign in')}
        </Button>
        <h1 className="mt-6 mb-4 px-1 text-2xl font-semibold">{t('Settings')}</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            disabled={pending}
            aria-label={t('Search settings')}
            placeholder={t('Search settings…')}
            className="h-10 border-transparent bg-muted pl-9 pr-8 text-sm shadow-none"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-8"
              aria-label={t('Clear search')}
              onClick={() => onQuery('')}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <nav
        aria-label={t('Settings sections')}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 [scrollbar-width:thin]"
      >
        {groups.map((group) => (
          <section
            key={group.label}
            aria-label={t(group.label)}
            className="mt-6 border-t pt-5 first:mt-0 first:border-0 first:pt-0"
          >
            <h2 className="mb-2 px-3 text-sm font-medium text-muted-foreground">{t(group.label)}</h2>
            <div className="space-y-1">
              {group.items.map(({ id, label, icon: Icon }) => (
                <Button
                  type="button"
                  key={id}
                  variant="ghost"
                  disabled={pending}
                  aria-current={section === id ? 'page' : undefined}
                  title={t(label)}
                  className={`h-11 w-full justify-start gap-3 px-3 text-base ${section === id ? 'bg-accent font-medium text-accent-foreground' : 'font-normal text-foreground'}`}
                  onClick={() => onSection(id)}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="truncate">{t(label)}</span>
                </Button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && (
          <p role="status" className="px-3 py-5 text-sm text-muted-foreground">
            {t('No matching settings.')}
          </p>
        )}
      </nav>
      <div className="flex min-w-0 shrink-0 items-center gap-3 px-6 py-5">
        <span className="text-2xl font-semibold tracking-tight text-primary">{branding.name}</span>
        <span className="min-w-0 truncate border-l pl-3 text-sm text-muted-foreground" title={userName}>
          {userName || (signedIn ? t('Xpert user') : t('Not signed in'))}
        </span>
      </div>
    </aside>
  )
}
