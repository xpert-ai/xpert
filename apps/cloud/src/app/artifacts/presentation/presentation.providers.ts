import { DestroyRef, inject, provideEnvironmentInitializer } from '@angular/core'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import { registerArtifactPresentationOpenCommand } from './presentation-open-command'

/** Opt in at the application composition root; the registry stays domain-independent. */
export function provideArtifactPresentationCommands() {
  return provideEnvironmentInitializer(() => {
    const unregister = registerArtifactPresentationOpenCommand(inject(ViewClientCommandRegistry))
    inject(DestroyRef).onDestroy(unregister)
  })
}
