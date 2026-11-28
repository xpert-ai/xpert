import { useEffect, useState } from 'react'
import { HostError, invoke } from '../host'
import { t } from '../i18n'
import type { GroupSummary } from './types'

export function useGroupList(binding: string, revision: number, selected: string | null) {
  const [state, setState] = useState<{ binding: string; items: GroupSummary[]; membershipRequired: boolean }>({
    binding,
    items: [],
    membershipRequired: false
  })
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const reload = () => setRefresh((value) => value + 1)
  useEffect(() => {
    let active = true
    let membershipRequired = false
    let pending = false
    setError('')
    const load = () => {
      if (pending) return
      pending = true
      return invoke('listGroups')
        .then((items) => {
          if (active) {
            membershipRequired = false
            setState({ binding, items, membershipRequired: false })
            setError('')
          }
        })
        .catch((error: unknown) => {
          if (!active) return
          membershipRequired =
            error instanceof HostError &&
            error.status === 403 &&
            error.errorCode === 'GROUP_ORGANIZATION_MEMBERSHIP_REQUIRED'
          if (membershipRequired) {
            setState({ binding, items: [], membershipRequired: true })
            setError('')
          } else {
            setState((current) => ({ ...current, membershipRequired: false }))
            setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
          }
        })
        .finally(() => {
          pending = false
        })
    }
    void load()
    const timer = setInterval(() => {
      if (!membershipRequired) void load()
    }, 30000)
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
  return {
    items: state.binding === binding ? state.items : [],
    membershipRequired: state.binding === binding && state.membershipRequired,
    error,
    reload,
    change
  }
}
