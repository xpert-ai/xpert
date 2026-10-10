import { useEffect, useState } from 'react'
import { invoke } from '../host'
import { t } from '../i18n'
import type { GroupSummary } from './types'

export function useGroupList(binding: string, revision: number, selected: string | null) {
  const [state, setState] = useState<{ binding: string; items: GroupSummary[] }>({ binding, items: [] })
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const reload = () => setRefresh((value) => value + 1)
  useEffect(() => {
    let active = true
    setError('')
    const load = () =>
      invoke('listGroups')
        .then((items) => {
          if (active) {
            setState({ binding, items })
            setError('')
          }
        })
        .catch((error: unknown) => {
          if (active) setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
        })
    void load()
    const timer = setInterval(() => void load(), 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [binding, revision, refresh, selected])
  const change = async (group: GroupSummary, key: 'pinned' | 'archived') => {
    try {
      await invoke('groupPreference', { id: group.id, key, value: !group[key] })
      reload()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    }
  }
  return { items: state.binding === binding ? state.items : [], error, reload, change }
}
