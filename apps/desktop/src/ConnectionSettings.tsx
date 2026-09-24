import { ShellSettings } from './ShellSettings'
import { t, languages } from './i18n'
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { LoaderCircle, RotateCcw, X } from 'lucide-react'
import type { ConnectionConfig } from './types'
import { ThemeSelect } from './ThemeFields'
import { defaultAppearance } from './appearance-types'
import { AppearanceSettings } from './AppearanceSettings'
import { ConnectionFields } from './ConnectionFields'
import { ThemeIconToggle, appearanceModes } from './ThemeIconToggle'

export function ConnectionSettings({
  config,
  open,
  onClose,
  onSave,
  onPreview
}: {
  config: ConnectionConfig
  open: boolean
  onClose: () => void
  onSave: (config: ConnectionConfig) => Promise<void>
  onPreview: (config: Pick<ConnectionConfig, 'theme' | 'appearance' | 'locale'>) => void
}) {
  const [draft, setDraft] = useState(() => ({ ...config, appearance: config.appearance ?? defaultAppearance() }))
  const [tab, setTab] = useState('appearance')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const scroller = useRef<HTMLFormElement>(null)
  useEffect(() => {
    onPreview({ theme: draft.theme, appearance: draft.appearance, locale: draft.locale })
  }, [draft.theme, draft.appearance, draft.locale, onPreview])
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose()
      }}
    >
      <DialogContent
        className="block h-[min(760px,calc(100dvh-48px))] overflow-hidden rounded-xl p-0 sm:max-w-[760px]"
        showCloseButton={false}
      >
        <form
          ref={scroller}
          aria-label={t('Connection and appearance settings')}
          className="h-full overflow-y-auto overscroll-contain scroll-pt-40 scroll-pb-24 [scrollbar-width:thin]"
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending) return
            setPending(true)
            setError('')
            try {
              await onSave(draft)
              onClose()
            } catch (error) {
              setError(error instanceof Error ? error.message : t('Could not save settings.'))
            } finally {
              setPending(false)
            }
          }}
        >
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value)
              scroller.current?.scrollTo({ top: 0 })
            }}
            className="min-h-full gap-0"
          >
            <header className="sticky top-0 z-20 shrink-0 border-b bg-background px-6 pt-5 pb-3">
              <DialogHeader className="pr-9 text-left">
                <DialogTitle>{t('Connection & appearance')}</DialogTitle>
                <DialogDescription>
                  {t('Customize your desktop and chat. Preview changes live, then save to apply.')}
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('Close settings')}
                className="absolute top-4 right-4 size-8 text-muted-foreground"
                disabled={pending}
                onClick={onClose}
              >
                <X className="size-4" />
              </Button>
              <TabsList aria-label={t('Settings sections')} variant="line" className="mt-4">
                <TabsTrigger value="appearance" disabled={pending}>
                  {t('Appearance')}
                </TabsTrigger>
                <TabsTrigger value="shell" disabled={pending}>
                  {t('Desktop Shell')}
                </TabsTrigger>
                <TabsTrigger value="connection" disabled={pending}>
                  {t('Connection')}
                </TabsTrigger>
              </TabsList>
            </header>
            <fieldset disabled={pending} className="min-w-0 flex-1 px-6 py-5">
              <TabsContent value="appearance" className="space-y-5">
                <div className="space-y-2">
                  <ThemeSelect
                    label={t('Language')}
                    value={draft.locale}
                    options={languages}
                    onChange={(locale) => setDraft({ ...draft, locale })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('Choose your desktop language. ChatKit follows where supported.')}
                  </p>
                </div>
                <ThemeIconToggle
                  label={t('Appearance mode')}
                  value={draft.theme}
                  options={appearanceModes}
                  onChange={(theme) => setDraft({ ...draft, theme })}
                />
                <AppearanceSettings
                  value={draft.appearance}
                  dark={
                    draft.theme === 'dark' ||
                    (draft.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
                  }
                  onChange={(appearance) => setDraft({ ...draft, appearance })}
                />
              </TabsContent>
              <TabsContent value="shell">
                <ShellSettings />
              </TabsContent>
              <TabsContent value="connection">
                <p className="mb-4 text-xs leading-5 text-muted-foreground">
                  {t(
                    'Changing service URLs requires signing in again. Appearance and language changes keep your session and chats.'
                  )}
                </p>
                <ConnectionFields
                  draft={draft}
                  onChange={(next) => setDraft({ ...next, appearance: next.appearance ?? defaultAppearance() })}
                />
              </TabsContent>
            </fieldset>
            <footer className="sticky bottom-0 z-20 mt-auto shrink-0 space-y-3 border-t bg-background px-6 py-4">
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className={tab === 'appearance' ? '' : 'invisible'}
                  onClick={() => setDraft({ ...draft, appearance: defaultAppearance() })}
                >
                  <RotateCcw className="size-4" />
                  {t('Reset appearance')}
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
                    {t('Cancel')}
                  </Button>
                  <Button disabled={pending}>
                    {pending && <LoaderCircle className="animate-spin" />}
                    {t('Save settings')}
                  </Button>
                </div>
              </div>
            </footer>
          </Tabs>
        </form>
      </DialogContent>
    </Dialog>
  )
}
