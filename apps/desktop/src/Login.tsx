import { t } from './i18n'
import { useState } from 'react'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
import { ArrowRight, LoaderCircle, Settings2, ShieldCheck } from 'lucide-react'
import logo from '../../cloud/src/assets/icon.png'
import { invoke } from './host'
import type { AppState } from './types'

export function Login({
  state,
  onLogin,
  onSettings
}: {
  state: AppState
  onLogin: (state: AppState) => void
  onSettings: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function login(local = false) {
    setBusy(true)
    setError('')
    try {
      onLogin(local ? await invoke('loginLocal') : await invoke('login', { email, password }))
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Could not sign in.'))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }
  return (
    <div className="relative flex h-full flex-col bg-background">
      <div className="window-drag h-12 shrink-0" />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-8 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3">
            <img src={logo} alt="" className="size-10 object-contain" />
            <span className="text-2xl font-semibold tracking-tight">Xpert</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Work with your Bots')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t('Sign in to Xpert to continue your chats and work.')}
          </p>
          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              void login()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">{t('Email')}</Label>
              <Input
                className="h-11"
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('Password')}</Label>
              <Input
                className="h-11"
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('Enter your password')}
                disabled={busy}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="h-11 w-full" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
              {t('Sign in')}
            </Button>
          </form>
          {state.localLoginAvailable && (
            <Button variant="outline" className="mt-3 h-11 w-full" disabled={busy} onClick={() => void login(true)}>
              <ShieldCheck />
              {t('Use local development account')}
            </Button>
          )}
          <div className="mt-8 border-t pt-5">
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {t('Current service · {{url}}', { url: state.config.apiUrl })}
            </p>
            <Button className="-ml-3" variant="ghost" onClick={onSettings} disabled={busy}>
              <Settings2 />
              {t('Connection settings')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
