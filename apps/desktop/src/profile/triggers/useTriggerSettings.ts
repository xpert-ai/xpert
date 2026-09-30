import { useEffect, useState } from 'react'
import { presentTriggerSettings, type AssistantTriggerSettings } from './model'
import { invoke } from '../../host'
import { useLocale } from '../../i18n'

export interface TriggerSettingsState {
  data: AssistantTriggerSettings | undefined
  error: string
  loading: boolean
  refresh: () => void
}

// Both tabs edit the same graph revision; keep one snapshot for the profile session.
export function useTriggerSettings(botId: string, enabled: boolean): TriggerSettingsState {
  const locale = useLocale()
  const [data, setData] = useState<AssistantTriggerSettings>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let current = true
    setLoading(true)
    setError('')
    invoke('assistantTriggers', { botId })
      .then((value) => {
        if (current) setData(presentTriggerSettings(value))
      })
      .catch((error: Error) => {
        if (current) setError(error.message)
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [botId, enabled, revision, locale])
  return { data, error, loading, refresh: () => setRevision((value) => value + 1) }
}
