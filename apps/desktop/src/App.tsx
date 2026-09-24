import { t, useLocale, setLocale, localizeValidation, clearValidation } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { Bot as BotIcon, LoaderCircle } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { ConnectionSettings } from './ConnectionSettings'
import { Login } from './Login'
import { Sidebar } from './Sidebar'
import { CatalogDialog } from './CatalogDialog'
import { HostError, invoke } from './host'
import type { AppState, Bot, ConnectionConfig } from './types'
import { applyDesktopTheme } from './theme'
import { defaultAppearance } from './appearance-types'

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [fatal, setFatal] = useState('')
  const [bots, setBots] = useState<Bot[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(false)
  const [catalog, setCatalog] = useState(false)
  const [dark, setDark] = useState(false)
  const [preview, setPreview] = useState<Pick<ConnectionConfig, 'theme' | 'appearance' | 'locale'> | null>(null)
  const locale = useLocale()
  const savedLocale = useRef<ConnectionConfig['locale'] | undefined>(undefined)
  useEffect(() => {
    setLocale(preview?.locale ?? state?.config.locale ?? 'en')
  }, [preview?.locale, state?.config.locale])
  const theme = preview?.theme ?? state?.config.theme
  const appearance = preview?.appearance ?? state?.config.appearance
  const request = useRef(0)
  const binding = `${state?.profile?.user.id || ''}:${state?.profile?.organizationId || ''}`

  const initialize = useCallback(async () => {
    setFatal('')
    try {
      setState(await invoke('state'))
    } catch (error) {
      setFatal(error instanceof Error ? error.message : t('Could not load Xpert.'))
    }
  }, [])
  useEffect(() => {
    void initialize()
  }, [initialize])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      const value = theme === 'dark' || (theme !== 'light' && media.matches)
      document.documentElement.classList.toggle('dark', value)
      applyDesktopTheme(appearance ?? defaultAppearance(), value)
      setDark(value)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme, appearance])

  const loadBots = useCallback(async () => {
    const current = ++request.current
    setPending(true)
    setError('')
    try {
      const items = await invoke('listBots')
      if (current !== request.current) return
      setBots(items)
      setSelected((id) => (items.some((item) => item.id === id) ? id : items[0]?.id || null))
    } catch (error) {
      if (current !== request.current) return
      setError(error instanceof Error ? error.message : t('Could not load Bots.'))
      if (error instanceof HostError && error.status === 401) {
        setState(await invoke('logout'))
      }
    } finally {
      if (current === request.current) setPending(false)
    }
  }, [])
  useEffect(() => {
    request.current++
    setBots([])
    setSelected(null)
    setCatalog(false)
    setError('')
    if (state?.profile?.organizationId) void loadBots()
    return () => {
      request.current++
    }
    // Binding deliberately scopes Bot selection to a user and organization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, loadBots])
  useEffect(() => {
    const changed = savedLocale.current !== undefined && savedLocale.current !== state?.config.locale
    savedLocale.current = state?.config.locale
    if (changed && state?.profile?.organizationId) void loadBots()
    // Refresh localized metadata without clearing the selected Bot or its conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.config.locale])

  if (!state)
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
        {fatal ? (
          <div role="alert" className="space-y-4 text-center">
            <p>{fatal}</p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => void initialize()}>{t('Reconnect')}</Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setState(await invoke('logout'))
                  setSettings(true)
                }}
              >
                {t('Sign in again or change connection')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <LoaderCircle className="size-5 animate-spin" />
            {t('Opening Xpert…')}
          </>
        )}
      </div>
    )
  const bot = bots.find((item) => item.id === selected)
  return (
    <div className="contents" onInvalidCapture={localizeValidation} onInputCapture={clearValidation}>
      {state.profile ? (
        <div className="flex h-full">
          <Sidebar
            key={binding}
            state={state}
            bots={bots}
            selected={selected}
            pending={pending}
            error={error}
            onSelect={setSelected}
            onRefresh={() => void loadBots()}
            onSettings={() => setSettings(true)}
            onBrowse={() => setCatalog(true)}
            onLogout={async () => setState(await invoke('logout'))}
            onOrganization={async (id) => {
              request.current++
              setBots([])
              setSelected(null)
              setPending(true)
              try {
                setState(await invoke('selectOrganization', id))
              } catch (error) {
                setError(error instanceof Error ? error.message : t('Could not switch organization.'))
                setPending(false)
              }
            }}
          />
          <main className="flex min-w-0 flex-1 flex-col">
            {bot ? (
              <ChatPanel
                key={`${binding}:${bot.id}`}
                bot={bot}
                config={{ ...state.config, appearance, locale }}
                dark={dark}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10 text-center">
                <BotIcon className="mb-5 size-10 text-primary" />
                <h1 className="text-xl font-semibold">
                  {pending ? t('Getting your Bots ready') : t('Start with a Bot')}
                </h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  {pending
                    ? t('Connecting to your Xpert workspace…')
                    : t('Choose a Bot from the sidebar, or add experts, apps and assistants from the catalog.')}
                </p>
                {!pending && (
                  <Button variant="outline" className="mt-6" onClick={() => setCatalog(true)}>
                    {t('Discover & add')}
                  </Button>
                )}
              </div>
            )}
          </main>
        </div>
      ) : (
        <Login state={state} onLogin={setState} onSettings={() => setSettings(true)} />
      )}
      {settings && (
        <ConnectionSettings
          config={state.config}
          open
          onPreview={setPreview}
          onClose={() => {
            setPreview(null)
            setSettings(false)
          }}
          onSave={async (config) => setState(await invoke('configure', config))}
        />
      )}
      {catalog && state.profile && (
        <CatalogDialog
          key={binding}
          organization={
            state.profile.organizations.find((org) => org.id === state.profile?.organizationId)?.name ||
            t('Current organization')
          }
          webUrl={state.config.webUrl}
          onClose={() => setCatalog(false)}
          onUse={async (id) => {
            const current = ++request.current
            setPending(true)
            try {
              const items = await invoke('listBots')
              if (current !== request.current)
                throw new Error(t('The organization changed. Select an assistant again.'))
              setBots(items)
              if (!items.some((item) => item.id === id))
                throw new Error(
                  t(
                    'The assistant is not available yet. Check its publishing status and access permissions, then retry.'
                  )
                )
              setSelected(id)
              setError('')
              setCatalog(false)
            } finally {
              if (current === request.current) setPending(false)
            }
          }}
        />
      )}
    </div>
  )
}
