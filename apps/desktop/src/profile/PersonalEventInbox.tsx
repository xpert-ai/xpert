import { useEffect, useState } from 'react'
import type { OpenConversationAction, XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { Button } from '@xpert-ai/shadcn-ui'
import { ArrowLeft } from 'lucide-react'
import { invoke } from '../host'
import { t } from '../i18n'
import { ProfileError, ProfileLoading } from './ProfileState'
import { RemoteProfileView } from './RemoteProfileView'

export function PersonalEventInbox({
  onClose,
  onOpenConversation
}: {
  onClose: () => void
  onOpenConversation: (action: OpenConversationAction) => void
}) {
  const [view, setView] = useState<XpertExtensionViewManifest>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    invoke('personalInboxViews').then(
      ([manifest]) => {
        if (!active) return
        if (manifest) setView(manifest)
        else setError(t('This profile operation is not available.'))
      },
      (error: Error) => {
        if (active) setError(error.message)
      }
    )
    return () => {
      active = false
    }
  }, [retry])
  return (
    <>
      <header className="flex items-center gap-2 border-b p-2">
        <Button autoFocus size="icon" variant="ghost" aria-label={t('Back')} onClick={onClose}>
          <ArrowLeft />
        </Button>
        <h1>{t('My events')}</h1>
      </header>
      {error ? (
        <ProfileError message={error} retry={() => setRetry((n) => n + 1)} />
      ) : view ? (
        <RemoteProfileView
          scope="personal-inbox"
          onOpenConversation={onOpenConversation}
          manifest={view}
          active
          onBusy={() => {}}
          onClose={onClose}
        />
      ) : (
        <ProfileLoading />
      )}
    </>
  )
}
