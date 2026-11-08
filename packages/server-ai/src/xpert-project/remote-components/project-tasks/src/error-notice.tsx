import { useEffect, useId, useRef } from 'react'
import { Toaster, toast } from '@xpert-ai/shadcn-ui'

export function ErrorNotice({
    message,
    label,
    closeLabel,
    retryLabel,
    onRetry
}: {
    message: string | null
    label: string
    closeLabel: string
    retryLabel: string
    onRetry: () => void
}) {
    const id = useId()
    const retry = useRef(onRetry)
    retry.current = onRetry

    useEffect(() => {
        if (!message) return
        // Keep the error value after dismissal so identical polling failures do not reopen it.
        const toastId = toast.error(message, {
            toasterId: id,
            duration: 6000,
            action: { label: retryLabel, onClick: () => retry.current() }
        })
        return () => {
            toast.dismiss(toastId)
        }
    }, [id, message, retryLabel])

    return (
        <Toaster
            id={id}
            position="bottom-right"
            theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
            closeButton
            containerAriaLabel={label}
            toastOptions={{ closeButtonAriaLabel: closeLabel }}
        />
    )
}
