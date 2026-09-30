import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@xpert-ai/shadcn-ui'
import { Check, CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react'
import { t } from './i18n'
import type { ConnectionConfig } from './types'
import { defaultAppearance, type ColorMode } from './appearance-types'
import { AppearanceSettings } from './AppearanceSettings'
import { ChatKitAppearance } from './ChatKitAppearance'
import { ConnectionFields } from './ConnectionFields'
import { ShellSettings } from './shell/ShellSettings'
import { GeneralSettings } from './settings/GeneralSettings'
import { SettingsSidebar } from './settings/SettingsSidebar'
import { settingsItems, type SettingsSection } from './settings/sections'

const withAppearance = (config: ConnectionConfig) => ({
  ...config,
  appearance: config.appearance ?? defaultAppearance()
})

export function ConnectionSettings({
  config,
  signedIn,
  userName,
  initialSection = 'general',
  onClose,
  onSave,
  onPreview
}: {
  config: ConnectionConfig
  signedIn: boolean
  userName?: string
  initialSection?: SettingsSection
  onClose: () => void
  onSave: (config: ConnectionConfig) => Promise<ConnectionConfig>
  onPreview: (config: Pick<ConnectionConfig, 'theme' | 'appearance' | 'locale'>) => void
}) {
  const [saved, setSaved] = useState(() => withAppearance(config))
  const [draft, setDraft] = useState(() => withAppearance(config))
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [savedNotice, setSavedNotice] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [shellVisited, setShellVisited] = useState(initialSection === 'shell')
  const [shellDirty, setShellDirty] = useState(false)
  const [shellBusy, setShellBusy] = useState(false)
  const [resetVersion, setResetVersion] = useState(0)
  const [paletteMode, setPaletteMode] = useState<ColorMode>(() =>
    config.theme === 'dark' || (config.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light'
  )
  const scrollArea = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const busy = pending || shellBusy
  const unsaved = dirty || shellDirty
  const current = settingsItems.find((item) => item.id === section)!

  useEffect(() => {
    onPreview({ theme: draft.theme, appearance: draft.appearance, locale: draft.locale })
  }, [draft.theme, draft.appearance, draft.locale, onPreview])
  useEffect(() => {
    scrollArea.current?.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [section])

  const selectSection = (value: SettingsSection) => {
    if (busy) return
    if (value === 'shell') setShellVisited(true)
    setSection(value)
  }
  const updateDraft = (next: ConnectionConfig) => {
    setSavedNotice(false)
    setDraft(withAppearance(next))
  }
  const discard = () => {
    setDraft(structuredClone(saved))
    setResetVersion((version) => version + 1)
    setError('')
    setSavedNotice(false)
  }
  const back = () => {
    if (busy) return
    if (unsaved) setConfirmLeave(true)
    else onClose()
  }
  return (
    <div className="flex h-full min-h-0 bg-background">
      <SettingsSidebar
        section={section}
        query={query}
        pending={busy}
        signedIn={signedIn}
        userName={userName}
        onQuery={setQuery}
        onSection={selectSection}
        onBack={back}
      />
      <form
        aria-label={t('Settings')}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy || !dirty) return
          setPending(true)
          setError('')
          try {
            const next = withAppearance(await onSave(draft))
            setSaved(next)
            setDraft(next)
            setSavedNotice(true)
          } catch (error) {
            setError(error instanceof Error ? error.message : t('Could not save settings.'))
          } finally {
            setPending(false)
          }
        }}
      >
        <div className="window-drag h-12 shrink-0" />
        <div
          ref={scrollArea}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]"
        >
          <div className="mx-auto max-w-[1080px] px-7 pt-6 pb-10 lg:px-12 lg:pt-7 xl:px-16">
            <header className="mb-8">
              <h2
                ref={heading}
                tabIndex={-1}
                className="text-[2rem] leading-tight font-semibold tracking-tight outline-none"
              >
                {t(current.label)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(current.description)}</p>
            </header>
            <fieldset disabled={busy} className="min-w-0">
              {section === 'general' && (
                <GeneralSettings draft={draft} onChange={updateDraft} onDesktop={() => selectSection('desktop')} />
              )}
              {section === 'desktop' && (
                <AppearanceSettings
                  value={draft.appearance}
                  dark={
                    draft.theme === 'dark' ||
                    (draft.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
                  }
                  onChange={(appearance) => updateDraft({ ...draft, appearance })}
                />
              )}
              {section === 'chat' && (
                <ChatKitAppearance
                  value={draft.appearance}
                  mode={paletteMode}
                  onMode={setPaletteMode}
                  onChange={(appearance) => updateDraft({ ...draft, appearance })}
                />
              )}
              {section === 'connection' && (
                <div className="space-y-6">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(
                      'Changing service URLs requires signing in again. Appearance and language changes keep your session and chats.'
                    )}
                  </p>
                  <ConnectionFields draft={draft} onChange={updateDraft} />
                </div>
              )}
            </fieldset>
            {shellVisited && (
              <div hidden={section !== 'shell'} inert={section !== 'shell'}>
                <ShellSettings
                  resetVersion={resetVersion}
                  onDirtyChange={setShellDirty}
                  onBusyChange={setShellBusy}
                  disabled={pending}
                />
              </div>
            )}
          </div>
        </div>
        <footer className="shrink-0 border-t bg-background px-6 py-4 lg:px-8">
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {(section === 'desktop' || section === 'chat') && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  className="h-10 px-2 text-muted-foreground"
                  onClick={() => {
                    const defaults = defaultAppearance()
                    updateDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        [section === 'desktop' ? 'desktop' : 'chatkit']:
                          defaults[section === 'desktop' ? 'desktop' : 'chatkit']
                      }
                    })
                  }}
                >
                  <RotateCcw className="size-4" />
                  {t('Reset appearance')}
                </Button>
              )}
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                {unsaved ? (
                  <CircleAlert className="size-4 shrink-0" />
                ) : savedNotice ? (
                  <Check className="size-4 shrink-0" />
                ) : null}
                {shellDirty
                  ? t('Apply terminal changes in this section.')
                  : dirty
                    ? t('Changes not saved')
                    : savedNotice
                      ? t('Settings saved')
                      : t('No unsaved changes')}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-5 text-sm"
                disabled={busy || !unsaved}
                onClick={discard}
              >
                {t('Cancel changes')}
              </Button>
              <Button type="submit" className="h-10 px-5 text-sm" disabled={busy || !dirty}>
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                {t('Save settings')}
              </Button>
            </div>
          </div>
        </footer>
      </form>
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('Discard unsaved changes?')}</DialogTitle>
            <DialogDescription>{t('Your changes will be lost when you leave settings.')}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="outline" className="h-10" onClick={() => setConfirmLeave(false)}>
              {t('Keep editing')}
            </Button>
            <Button type="button" className="h-10" onClick={onClose}>
              {t('Discard and go back')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
