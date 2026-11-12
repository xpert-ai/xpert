import { DestroyRef, inject, provideEnvironmentInitializer } from '@angular/core'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import { registerArtifactPresentationOpenCommand } from './presentation-open-command'
import { registerArtifactGrantAuthoringCommand } from './grant-authoring-command'
import { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'

/** Opt in at the application composition root; the registry stays domain-independent. */
export function provideArtifactPresentationCommands() {
  return provideEnvironmentInitializer(() => {
    const unregister = registerArtifactPresentationOpenCommand(inject(ViewClientCommandRegistry))
    inject(DestroyRef).onDestroy(unregister)
    const unregisterGrants = registerArtifactGrantAuthoringCommand(
      inject(ViewClientCommandRegistry),
      inject(ViewExtensionApiService)
    )
    inject(DestroyRef).onDestroy(unregisterGrants)
  })
}
