import type { ConversationNotice } from './assistant-list-types'
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
import { AssistantPreviewScope } from './profile/PreviewScope'
import type { SettingsSection } from './settings/sections'
import { BosiOnboarding } from './bosi/BosiOnboarding'
import { subscribeAppActivation } from './app-activation'

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [fatal, setFatal] = useState('')
  const [bots, setBots] = useState<Bot[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [initialThread, setInitialThread] = useState<string | null>(null)
  const [notice, setNotice] = useState<ConversationNotice>()
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [bosiReady, setBosiReady] = useState(false)
  const selectBot = (id: string, threadId: string | null = null) => {
    setSelected(id)
    setInitialThread(threadId)
    setSelectionVersion((value) => value + 1)
    setNotice(undefined)
  }
  const onConversationRead = useCallback((botId: string, threadId: string | null) => {
    setNotice((value) => ({ botId, threadId, revision: (value?.revision ?? 0) + 1 }))
  }, [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const settingsOpener = useRef<HTMLElement | null>(null)
  const openSettings = (section: SettingsSection = 'general') => {
    settingsOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSettingsSection(section)
    setCatalog(false)
    setSettings(true)
  }
  const [catalog, setCatalog] = useState(false)
  const [dark, setDark] = useState(false)
  const [preview, setPreview] = useState<Pick<ConnectionConfig, 'theme' | 'appearance' | 'locale'> | null>(null)
  const locale = useLocale()
  const savedLocale = useRef<ConnectionConfig['locale'] | undefined>(undefined)
  useEffect(() => {
    const selectedLocale = preview?.locale ?? state?.config.locale
    if (selectedLocale) setLocale(selectedLocale)
  }, [preview?.locale, state?.config.locale])
  const theme = preview?.theme ?? state?.config.theme
  const appearance = preview?.appearance ?? state?.config.appearance
  const request = useRef(0)
  const loadingBots = useRef<number | null>(null)
  const binding = `${state?.config.apiUrl || ''}:${state?.profile?.user.tenantId || ''}:${state?.profile?.user.id || ''}:${state?.profile?.organizationId || ''}`

  const bindingRef = useRef(binding)
  bindingRef.current = binding

  const initialize = useCallback(async () => {
    setFatal('')
    try {
      setState(await invoke('state'))
    } catch (error) {
      setFatal(error instanceof Error ? error.message : t('Could not load Bosi.'))
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

  const loadBots = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (background && loadingBots.current === request.current) return
    const current = ++request.current
    loadingBots.current = current
    if (!background) {
      setPending(true)
      setError('')
    }
    try {
      const items = await invoke('listBots')
      if (current !== request.current) return
      setBots(items)
      setError('')
      setSelected((id) => (items.some((item) => item.id === id) ? id : items[0]?.id || null))
    } catch (error) {
      if (current !== request.current) return
      if (!background) setError(error instanceof Error ? error.message : t('Could not load Bots.'))
      if (error instanceof HostError && error.status === 401) {
        setState(await invoke('logout'))
      }
    } finally {
      if (loadingBots.current === current) loadingBots.current = null
      if (current === request.current) {
        setPending(false)
      }
    }
  }, [])
  useEffect(() => {
    request.current++
    setBots([])
    setBosiReady(false)
    setSelected(null)
    setInitialThread(null)
    setNotice(undefined)
    setCatalog(false)
    setError('')
    if (state?.profile?.organizationId) void loadBots()
    return () => {
      request.current++
    }
    // Binding scopes Bot selection to its server, tenant, user and organization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, loadBots])
  useEffect(() => {
    const changed = savedLocale.current !== undefined && savedLocale.current !== state?.config.locale
    savedLocale.current = state?.config.locale
    if (changed && state?.profile?.organizationId) void loadBots()
    // Refresh localized metadata without clearing the selected Bot or its conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.config.locale])
  useEffect(() => {
    if (!bosiReady || !state?.profile?.organizationId) return
    let refreshedAt = 0
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - refreshedAt < 1000) return
      refreshedAt = Date.now()
      void loadBots({ background: true })
    }
    return subscribeAppActivation(refresh)
  }, [binding, bosiReady, state?.profile?.organizationId, loadBots])

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
                  openSettings('connection')
                }}
              >
                {t('Sign in again or change connection')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <LoaderCircle className="size-5 animate-spin" />
            {t('Opening Bosi…')}
          </>
        )}
      </div>
    )
  const bot = bots.find((item) => item.id === selected)
  return (
    <div className="contents" onInvalidCapture={localizeValidation} onInputCapture={clearValidation}>
      <div className={settings ? 'hidden' : 'contents'} inert={settings}>
        {state.profile ? (
          <div className="flex h-full">
            <AssistantPreviewScope key={binding}>
              <Sidebar
                key={binding}
                state={state}
                bots={bots}
                selected={selected}
                pending={pending}
                error={error}
                onSelect={selectBot}
                notice={notice}
                onBotSaved={async (id) => {
                  await loadBots()
                  selectBot(id)
                }}
                onRefresh={() => void loadBots()}
                onRefreshOrganizations={async () => {
                  try {
                    setState(await invoke('refreshProfile'))
                  } catch (error) {
                    if (error instanceof HostError && error.status === 409) return
                    setError(error instanceof Error ? error.message : t('Could not switch organization.'))
                    if (error instanceof HostError && error.status === 401) setState(await invoke('logout'))
                  }
                }}
                onSettings={() => openSettings()}
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
            </AssistantPreviewScope>
            <main className="flex min-w-0 flex-1 flex-col">
              {!bosiReady && state.profile.organizationId ? (
                <BosiOnboarding
                  key={binding}
                  organizationId={state.profile.organizationId}
                  onReady={async (id, threadId) => {
                    if (bindingRef.current !== binding) return
                    await loadBots()
                    if (bindingRef.current !== binding) return
                    selectBot(id, threadId)
                    setBosiReady(true)
                  }}
                />
              ) : bot ? (
                <ChatPanel
                  key={`${binding}:${bot.id}:${selectionVersion}`}
                  initialThread={initialThread}
                  onConversationRead={onConversationRead}
                  bot={bot}
                  config={{ ...state.config, appearance, locale }}
                  dark={dark}
                  onAppearanceSaved={loadBots}
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
          <Login state={state} onLogin={setState} onSettings={() => openSettings('connection')} />
        )}
      </div>
      {settings && (
        <ConnectionSettings
          config={state.config}
          signedIn={!!state.profile}
          userName={state.profile?.user.name}
          usageContext={
            state.profile
              ? {
                  key: `${state.config.apiUrl}:${state.profile.user.tenantId}:${state.profile.user.id}:${state.profile.organizationId}`,
                  organizationName: state.profile.organizations.find((org) => org.id === state.profile?.organizationId)
                    ?.name
                }
              : undefined
          }
          initialSection={settingsSection}
          onPreview={setPreview}
          onClose={() => {
            setPreview(null)
            setSettings(false)
            requestAnimationFrame(() => settingsOpener.current?.focus())
          }}
          onSave={async (config) => {
            const next = await invoke('configure', config)
            setState(next)
            return next.config
          }}
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
              selectBot(id)
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
