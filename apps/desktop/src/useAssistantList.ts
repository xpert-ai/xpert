import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from './host'
import { t } from './i18n'
import type { BotActivity, ConversationNotice, SidebarState, SidebarUpdate } from './assistant-list-types'

export const emptySidebar: SidebarState = { width: 320, collapsed: false, sections: [], items: [], copies: [] }
export function useAssistantList(binding: string, botIds: string, notice?: ConversationNotice) {
  const [sidebar, setSidebar] = useState<SidebarState>(emptySidebar)
  const [activities, setActivities] = useState<BotActivity[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = generation.current
    try {
      const items = await invoke('botActivity')
      if (current === generation.current) {
        setActivities(items)
        setError('')
      }
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : t('Could not refresh conversations.'))
    }
  }, [])
  useEffect(() => {
    const current = ++generation.current
    setSidebar(emptySidebar)
    setActivities([])
    setBusy(false)
    setError('')
    void invoke('sidebarState')
      .then((value) => {
        if (generation.current === current) setSidebar(value)
      })
      .catch((error: Error) => {
        if (generation.current === current) setError(error.message)
      })
    return () => {
      generation.current++
    }
  }, [binding])
  useEffect(() => {
    let pending = false
    const poll = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        await refresh()
      } finally {
        pending = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 15000)
    window.addEventListener('focus', poll)
    document.addEventListener('visibilitychange', poll)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', poll)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [binding, botIds, refresh])
  useEffect(() => {
    if (!notice?.threadId || document.visibilityState === 'hidden') return
    const current = generation.current
    void invoke('markBotRead', { botId: notice.botId, threadId: notice.threadId })
      .then(async () => {
        if (current !== generation.current) return
        const value = await invoke('sidebarState')
        if (current !== generation.current) return
        setSidebar(value)
        await refresh()
      })
      .catch((error: Error) => {
        if (current === generation.current) setError(error.message)
      })
  }, [notice, refresh])
  const update = useCallback(async (input: SidebarUpdate) => {
    const current = generation.current
    const next = await invoke('updateSidebar', input)
    if (current === generation.current) setSidebar(next)
  }, [])
  const run = async (action: () => Promise<void>) => {
    const current = generation.current
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  return { sidebar, setSidebar, activities, refresh, update, run, busy, error, setError }
}
