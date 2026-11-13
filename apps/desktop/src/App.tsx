import { NotificationProvider } from './notifications/NotificationProvider'
import { CreateGroupDialog } from './groups/CreateGroupDialog'
import { VoiceProvider } from './voice/VoiceProvider'
import type { ConversationNotice, DesktopLastSession } from './assistant-list-types'
import { t, useLocale, setLocale, localizeValidation, clearValidation } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { Bot as BotIcon, LoaderCircle } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { ConnectionSettings } from './ConnectionSettings'
import { Login } from './Login'
import { Sidebar } from './Sidebar'
import type { DiscoveryWorkspace } from './catalog-types'
import { CatalogDialog } from './CatalogDialog'
import { HostError, invoke } from './host'
import type { AppState, Bot, ConnectionConfig } from './types'
import { applyDesktopTheme } from './theme'
import { defaultAppearance } from './appearance-types'
import { AssistantPreviewScope } from './profile/PreviewScope'
import type { SettingsSection } from './settings/sections'
import { BosiOnboarding } from './bosi/BosiOnboarding'
import { notifyEmbeddedAppActivation, subscribeAppActivation } from './app-activation'

export function App() {
  useEffect(() => subscribeAppActivation(() => notifyEmbeddedAppActivation()), [])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [createGroup, setCreateGroup] = useState(false)
  const [groupRevision, setGroupRevision] = useState(0)
  const [state, setState] = useState<AppState | null>(null)
  const [fatal, setFatal] = useState('')
  const [bots, setBots] = useState<Bot[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const navigationVersion = useRef(0)
  const restorePending = useRef(true)
  const [navigationReady, setNavigationReady] = useState(false)
  const [initialVoice, setInitialVoice] = useState<DesktopLastSession['conversation'] | null>(null)
  const [initialThread, setInitialThread] = useState<string | null>(null)
  const [notice, setNotice] = useState<ConversationNotice>()
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [bosiReady, setBosiReady] = useState(false)
  const selectBot = (id: string, threadId: string | null = null) => {
    navigationVersion.current++
    selectedRef.current = id
    setBosiReady(true)
    setSelectedGroup(null)
    setSelected(id)
    setInitialVoice(null)
    setInitialThread(threadId)
    setSelectionVersion((value) => value + 1)
    setNotice(undefined)
    rememberSession({ botId: id, threadId })
  }
  const onConversationRead = useCallback((botId: string, threadId: string | null) => {
    setNotice((value) => ({ botId, threadId, revision: (value?.revision ?? 0) + 1 }))
  }, [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const settingsOpener = useRef<HTMLElement | null>(null)
  const openSettings = useCallback((section: SettingsSection = 'general') => {
    settingsOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSettingsSection(section)
    setCatalog(false)
    setSettings(true)
  }, [])
  const [catalog, setCatalog] = useState(false)
  const [linkedTemplate, setLinkedTemplate] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [preview, setPreview] = useState<Pick<ConnectionConfig, 'theme' | 'appearance' | 'locale'> | null>(null)
  const signOut = useCallback(async () => {
    try {
      const next = await invoke('logout')
      setPreview(null)
      setSettings(false)
      setState(next)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    }
  }, [])
  const menuReady = state !== null
  useEffect(() => {
    if (!menuReady) return
    return window.xpertDesktop?.onMenuAction?.((action) => {
      if (action === 'settings') openSettings()
      else if (action === 'sign-out') void signOut()
    })
  }, [menuReady, openSettings, signOut])
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
  const nextStartupPage = useRef<Promise<{ bots: Bot[]; next: string | null }> | null>(null)
  const binding = JSON.stringify([
    state?.config.apiUrl ?? null,
    state?.profile?.user.tenantId ?? null,
    state?.profile?.user.id ?? null,
    state?.profile?.organizationId ?? null
  ])

  useEffect(() => {
    let active = true
    const read = () =>
      void window.xpertDesktop?.templateLinks?.read().then((link) => {
        if (active && link && state?.profile?.organizationId) {
          setLinkedTemplate(link.id)
          setCatalog(true)
        }
      })
    read()
    const unsubscribe = window.xpertDesktop?.templateLinks?.onChange(read)
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [binding])

  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceOptions, setWorkspaceOptions] = useState<DiscoveryWorkspace[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  const organizationId = state?.profile?.organizationId
  useEffect(() => {
    setWorkspaceId('')
    setWorkspaceOptions([])
  }, [binding])
  useEffect(() => {
    let active = true
    setWorkspaceError('')
    setWorkspacesLoading(!!organizationId)
    if (organizationId)
      void invoke('discoveryWorkspaces')
        .then((options) => {
          if (!active) return
          setWorkspaceOptions(options)
          setWorkspaceId((current) => (options.some((item) => item.id === current) ? current : ''))
        })
        .catch((reason: Error) => {
          if (active) setWorkspaceError(reason.message)
        })
        .finally(() => {
          if (active) setWorkspacesLoading(false)
        })
    return () => {
      active = false
    }
  }, [binding, organizationId, workspaceRevision])
  const workspace = workspaceOptions.find((option) => option.id === workspaceId)
  const selectWorkspace = (id: string) => {
    setWorkspaceId(id)
    navigationVersion.current++
  }
  const bindingRef = useRef(binding)
  bindingRef.current = binding
  const rememberSession = useCallback(
    (session: DesktopLastSession) => {
      if (bindingRef.current !== binding || selectedRef.current !== session.botId) return
      void invoke('rememberSession', { scope: binding, session }).catch((error) => {
        if (bindingRef.current === binding)
          setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
      })
    },
    [binding]
  )

  const initialize = useCallback(async () => {
    setFatal('')
    try {
      setState(await invoke('state'))
    } catch (error) {
      setFatal(error instanceof Error ? error.message : t('Could not load Bosi.'))
    }
  }, [])
  useEffect(() => window.xpertDesktop?.onNewGroup?.(() => setCreateGroup(true)), [])
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

  const loadBots = useCallback(
    async ({ background = false, startup = false }: { background?: boolean; startup?: boolean } = {}) => {
      if (background && loadingBots.current === request.current) return
      const current = ++request.current
      if (!startup) nextStartupPage.current = null
      const navigation = navigationVersion.current
      loadingBots.current = current
      if (!background) {
        setPending(true)
        setError('')
      }
      try {
        let cursor: string | undefined
        do {
          const fetchPage = startup ? invoke('listBotPage', cursor) : null
          if (fetchPage) nextStartupPage.current = fetchPage
          const page = fetchPage ? await fetchPage : null
          const items = page ? page.bots : await invoke('listBots')
          if (current !== request.current) return
          setBots(items)
          setError('')
          // Absence from a partial page does not mean the saved assistant is inaccessible.
          if (restorePending.current && !page?.awaitingSavedBot) {
            const restored = navigation === navigationVersion.current ? await invoke('restoreSession') : null
            if (current !== request.current) return
            restorePending.current = false
            setNavigationReady(true)
            if (
              navigation === navigationVersion.current &&
              restored &&
              items.some((item) => item.id === restored.botId)
            ) {
              selectedRef.current = restored.botId
              setSelected(restored.botId)
              setInitialThread(restored.threadId)
              setInitialVoice(restored.conversation ?? null)
              setBosiReady(true)
              setSelectionVersion((value) => value + 1)
            }
          }
          if (!page?.next && !items.some((item) => item.id === selectedRef.current)) {
            selectedRef.current = items[0]?.id ?? null
            setSelected(selectedRef.current)
            setInitialThread(null)
            setInitialVoice(null)
          }
          if (!page?.next) return items
          cursor = page.next
        } while (true)
      } catch (error) {
        if (current !== request.current) return
        if (!background) setError(error instanceof Error ? error.message : t('Could not load Bots.'))
        if (error instanceof HostError && error.status === 401) {
          setState(await invoke('logout'))
        }
      } finally {
        if (loadingBots.current === current) loadingBots.current = null
        if (current === request.current) {
          nextStartupPage.current = null
          setPending(false)
        }
      }
    },
    []
  )
  useEffect(() => {
    request.current++
    navigationVersion.current++
    restorePending.current = true
    selectedRef.current = null
    setNavigationReady(false)
    setBots([])
    setSelectedGroup(null)
    setCreateGroup(false)
    setBosiReady(false)
    setSelected(null)
    setInitialThread(null)
    setInitialVoice(null)
    setNotice(undefined)
    setCatalog(false)
    setError('')
    if (state?.profile?.organizationId) void loadBots({ startup: true })
    return () => {
      nextStartupPage.current = null
      request.current++
      selectedRef.current = null
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
  const visibleBots = workspace ? bots.filter((item) => item.workspaceId === workspace.id) : bots
  const chatVisible = !workspace || (!selectedGroup && bot?.workspaceId === workspace.id)
  const showOnboarding =
    !workspace && !selectedGroup && !bosiReady && navigationReady && !!state.profile?.organizationId
  const revealBot = (id: string) => {
    if (workspace && bots.find((item) => item.id === id)?.workspaceId !== workspace.id) setWorkspaceId('')
  }
  return (
    <div className="contents" onInvalidCapture={localizeValidation} onInputCapture={clearValidation}>
      <div className={settings ? 'hidden' : 'contents'} inert={settings}>
        {state.profile ? (
          <NotificationProvider
            key={binding}
            suspended={settings || catalog || createGroup}
            activeThreadId={
              chatVisible && !selectedGroup && !settings && !catalog ? (notice?.threadId ?? initialThread) : null
            }
            onOpen={async (item) => {
              const target = bots.find((bot) => (bot.assistantId || bot.id) === item.action.assistantId)
              if (!target || !item.action.threadId) throw new Error('Unavailable result')
              revealBot(target.id)
              selectBot(target.id, item.action.threadId)
            }}
          >
            <VoiceProvider
              key={`${binding}:${state.config.apiUrl}`}
              onOpen={(target) => {
                revealBot(target.botId)
                selectBot(target.botId, target.threadId)
                if (target.conversationId)
                  setInitialVoice({ assistantId: target.assistantId, conversationId: target.conversationId })
              }}
            >
              <div className="flex h-full">
                <AssistantPreviewScope key={binding}>
                  <Sidebar
                    key={binding}
                    state={state}
                    bots={visibleBots}
                    workspaceId={workspace?.id ?? ''}
                    workspaces={workspaceOptions}
                    onWorkspace={selectWorkspace}
                    workspaceError={workspaceError}
                    retryWorkspaces={() => setWorkspaceRevision((value) => value + 1)}
                    selected={selectedGroup ? null : selected}
                    selectedGroup={selectedGroup}
                    groupRevision={groupRevision}
                    onSelectGroup={(id) => {
                      navigationVersion.current++
                      selectedRef.current = null
                      setSelectedGroup(id)
                    }}
                    onCreateGroup={() => {
                      setWorkspaceId('')
                      setCreateGroup(true)
                    }}
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
                    onLogout={signOut}
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
                  {showOnboarding && state.profile.organizationId ? (
                    <BosiOnboarding
                      key={binding}
                      organizationId={state.profile.organizationId}
                      onReady={async (id, threadId) => {
                        if (bindingRef.current !== binding) return
                        if (!bots.some((item) => item.id === id)) {
                          const navigation = navigationVersion.current
                          let available = false
                          let next = nextStartupPage.current
                          while (next) {
                            const page = await next
                            if (bindingRef.current !== binding || navigation !== navigationVersion.current) return
                            available = page.bots.some((item) => item.id === id)
                            if (available || !page.next || next === nextStartupPage.current) break
                            next = nextStartupPage.current
                          }
                          if (!available) available = (await loadBots())?.some((item) => item.id === id) ?? false
                          if (bindingRef.current !== binding || navigation !== navigationVersion.current) return
                          if (!available)
                            throw new Error(
                              t(
                                'The assistant is not available yet. Check its publishing status and access permissions, then retry.'
                              )
                            )
                        }
                        selectBot(id, threadId)
                      }}
                    />
                  ) : bot || selectedGroup ? (
                    <div className={chatVisible ? 'contents' : 'hidden'} inert={!chatVisible}>
                      <ChatPanel
                        key={binding}
                        groupId={selectedGroup}
                        selectionVersion={selectionVersion}
                        initialThread={initialThread}
                        initialVoice={initialVoice}
                        onConversationRead={onConversationRead}
                        onSessionChange={rememberSession}
                        bot={bot}
                        config={{ ...state.config, appearance, locale }}
                        dark={dark}
                        onAppearanceSaved={async () => {
                          await loadBots()
                        }}
                      />
                    </div>
                  ) : null}
                  {!showOnboarding && (!chatVisible || (!bot && !selectedGroup)) && (
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
            </VoiceProvider>
          </NotificationProvider>
        ) : (
          <Login state={state} onLogin={setState} onSettings={() => openSettings('connection')} />
        )}
      </div>
      {createGroup && state.profile?.organizationId && (
        <CreateGroupDialog
          key={binding}
          onClose={() => setCreateGroup(false)}
          onCreated={(id) => {
            navigationVersion.current++
            selectedRef.current = null
            setSelectedGroup(id)
            setWorkspaceId('')
            setCreateGroup(false)
            setGroupRevision((value) => value + 1)
          }}
        />
      )}
      {settings && (
        <ConnectionSettings
          config={state.config}
          connectionDefaults={state.connectionDefaults}
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
          workspace={workspace}
          workspaces={workspaceOptions}
          workspacesLoading={workspacesLoading}
          onTemplateCreated={() => void loadBots({ background: true })}
          onWorkspace={selectWorkspace}
          workspaceError={workspaceError}
          retryWorkspaces={() => setWorkspaceRevision((value) => value + 1)}
          templateId={linkedTemplate ?? undefined}
          installationScope={binding}
          organizationId={state.profile.organizationId || ''}
          organization={
            state.profile.organizations.find((org) => org.id === state.profile?.organizationId)?.name ||
            t('Current organization')
          }
          webUrl={state.config.webUrl}
          onClose={() => {
            setCatalog(false)
            if (linkedTemplate) void window.xpertDesktop?.templateLinks?.dismiss(linkedTemplate)
            setLinkedTemplate(null)
          }}
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
              if (workspace && items.find((item) => item.id === id)?.workspaceId !== workspace.id) setWorkspaceId('')
              selectBot(id)
              setError('')
              setCatalog(false)
              if (linkedTemplate) await window.xpertDesktop?.templateLinks?.dismiss(linkedTemplate)
              setLinkedTemplate(null)
            } finally {
              if (current === request.current) setPending(false)
            }
          }}
        />
      )}
    </div>
  )
}
