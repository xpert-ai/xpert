import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { CurrentUserHydrationService } from '@xpert-ai/cloud/state'
import { from, of, race, timer } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { AiFeatureEnum, AnalyticsFeatures, FeatureEnum, Store } from '../@core'

const FEATURE_HYDRATION_TIMEOUT_MS = 3000

export function hydrateFeatureContext(options: { skipSessionCache?: boolean } = {}) {
  const currentUserHydrationService = inject(CurrentUserHydrationService)
  const hydration = currentUserHydrationService.getFeatureHydration(options)

  return race(
    from(hydration).pipe(
      map((user) => !!user),
      catchError(() => of(false))
    ),
    timer(FEATURE_HYDRATION_TIMEOUT_MS).pipe(map(() => false))
  )
}

export function featureGate(
  featureKeys: Array<AiFeatureEnum | AnalyticsFeatures | FeatureEnum>,
  redirectCommands: Parameters<Router['createUrlTree']>[0] = ['/chat']
) {
  return () => {
    const store = inject(Store)
    const router = inject(Router)

    return hydrateFeatureContext({ skipSessionCache: true }).pipe(
      map((hydrated) =>
        hydrated && featureKeys.every((featureKey) => store.hasFeatureEnabled(featureKey))
          ? true
          : router.createUrlTree(redirectCommands)
      )
    )
  }
}
