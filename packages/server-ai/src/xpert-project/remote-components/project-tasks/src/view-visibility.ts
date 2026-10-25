import { useSyncExternalStore } from 'react'

let visible = false
const listeners = new Set<() => void>()
export function setViewVisible(value: boolean) {
    if (visible === value) return
    visible = value
    listeners.forEach((notify) => notify())
}
export const isViewVisible = () => visible && !document.hidden
export function useViewVisible() {
    return useSyncExternalStore((notify) => {
        listeners.add(notify)
        document.addEventListener('visibilitychange', notify)
        return () => {
            listeners.delete(notify)
            document.removeEventListener('visibilitychange', notify)
        }
    }, isViewVisible)
}
