import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import branding from '../electron/branding.json'
import { defaultAppearance } from './appearance-types'
import { BrandLogo } from './branding/BrandLogo'
import { invoke } from './host'
import { languages, setLocale, t, useLocale, type Locale } from './i18n'
import { desktopThemeStyle } from './theme'
import type { AppState } from './types'

const welcomeTheme = desktopThemeStyle(defaultAppearance(), 'dark')

export function FirstRunLanguage({ onConfirm }: { onConfirm: (state: AppState) => void }) {
  const locale = useLocale()
  const selected = languages.findIndex((language) => language.value === locale)
  const list = useRef<HTMLDivElement>(null)
  const wheel = useRef({ distance: 0, last: -Infinity, moved: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function choose(value: Locale) {
    if (saving) return
    setError('')
    setLocale(value)
  }
  function step(direction: number) {
    choose(languages[(selected + direction + languages.length) % languages.length].value)
  }
  async function confirm() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      onConfirm(await invoke('confirmInitialLanguage', locale))
    } catch {
      setError(t('Could not save settings.'))
      setSaving(false)
    }
  }
  function navigate(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
        step(-1)
        break
      case 'ArrowDown':
        step(1)
        break
      case 'Home':
        choose(languages[0].value)
        break
      case 'End':
        choose(languages[languages.length - 1].value)
        break
      case 'Enter':
        void confirm()
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <main
      data-theme="dark"
      style={welcomeTheme}
      className="relative flex h-full flex-col overflow-y-auto bg-card text-foreground"
    >
      <div aria-hidden="true" className="window-drag absolute inset-x-0 top-0 h-12" />
      <div className="mx-auto my-auto flex w-full max-w-sm flex-col items-center px-8 py-12 text-center">
        <div className="flex items-center gap-4">
          <BrandLogo className="size-20" />
          <span className="text-[2.625rem] leading-none font-semibold tracking-tighter">{branding.name}</span>
        </div>
        <h1 id="language-prompt" className="mt-8 text-sm font-medium text-muted-foreground">
          {t('Choose your language')}
        </h1>
        <div className="relative mt-3 w-full">
          <div
            ref={list}
            role="listbox"
            tabIndex={0}
            aria-labelledby="language-prompt"
            aria-activedescendant={`language-${locale}`}
            aria-disabled={saving}
            onKeyDown={navigate}
            onWheel={(event) => {
              if (!event.deltaY || event.ctrlKey) return
              const now = performance.now()
              if (now - wheel.current.last > 160) {
                wheel.current.distance = 0
                wheel.current.moved = false
              }
              wheel.current.last = now
              if (wheel.current.moved) return
              wheel.current.distance += event.deltaY * (event.deltaMode ? 48 : 1)
              if (Math.abs(wheel.current.distance) >= 28) {
                step(Math.sign(wheel.current.distance))
                wheel.current.moved = true
              }
            }}
            className="group relative h-36 w-full cursor-default overflow-hidden rounded-xl outline-none"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-12 h-12 rounded-xl border border-foreground/5 bg-foreground/5 group-focus-visible:border-primary"
            />
            {languages.map(({ value, label, glyph }, index) => {
              const distance = (index - selected + languages.length) % languages.length
              const offset = distance === languages.length - 1 ? -1 : distance
              const active = offset === 0
              return (
                <div
                  key={value}
                  id={`language-${value}`}
                  role="option"
                  aria-selected={active}
                  lang={value}
                  onClick={() => {
                    choose(value)
                    list.current?.focus()
                  }}
                  style={{ transform: `translateY(${offset * 100}%)` }}
                  className={`absolute inset-x-0 top-12 flex h-12 cursor-pointer items-center justify-center gap-3 motion-safe:transition-[transform,opacity] motion-safe:duration-200 ${active ? 'text-xl font-semibold text-foreground' : 'text-base font-medium text-muted-foreground'} ${offset > 1 ? 'pointer-events-none opacity-0' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-6 place-items-center rounded-md border text-xs ${active ? 'border-primary/30 text-primary' : 'border-current/25'}`}
                  >
                    {glyph}
                  </span>
                  {label}
                </div>
              )
            })}
          </div>
          <div className="absolute top-1/2 left-full ml-1 flex -translate-y-1/2 flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={saving}
              aria-label={t('Previous language')}
              onClick={() => step(-1)}
              className="size-8 text-muted-foreground"
            >
              <ChevronUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={saving}
              aria-label={t('Next language')}
              onClick={() => step(1)}
              className="size-8 text-muted-foreground"
            >
              <ChevronDown />
            </Button>
          </div>
        </div>
        <Button
          type="button"
          disabled={saving}
          onClick={() => void confirm()}
          className="mt-7 h-11 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          {t('Continue')}
          <ArrowRight aria-hidden="true" />
        </Button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
