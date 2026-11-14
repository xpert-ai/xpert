import { useEffect, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { t } from '../i18n'
export function WindowActivity() {
  const [current, setCurrent] = useState<{ name: string; title: string } | null>(null)
  useEffect(() => {
    const host = window.xpertDesktop
    if (!host?.supportsWindowControl || !host.windowControl) return
    let active = true
    const check = () =>
      void host
        .windowControl('active')
        .then((value) => {
          if (active) setCurrent(value)
        })
        .catch(() => {})
    check()
    const timer = setInterval(check, 800)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  return current?.title ? (
    <div
      role="status"
      className="absolute inset-x-0 top-10 z-20 mx-auto flex w-fit items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow"
    >
      {current.name} · {current.title}
      <Button size="sm" variant="outline" onClick={() => void window.xpertDesktop?.windowControl('stop')}>
        {t('Stop window control')}
      </Button>
    </div>
  ) : null
}
