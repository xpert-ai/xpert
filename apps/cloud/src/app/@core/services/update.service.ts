import { ApplicationRef, Injectable } from '@angular/core'
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker'
import { concat, filter, first, firstValueFrom, interval, race, timer } from 'rxjs'
import { ToastrService } from './toastr.service'

@Injectable()
export class UpdateService {
  constructor(
    appRef: ApplicationRef,
    public updates: SwUpdate,
    private toastrService: ToastrService
  ) {
    // Allow the app to stabilize first, before starting
    // polling for updates with `interval()`.
    const appIsStable$ = appRef.isStable.pipe(first((isStable) => isStable))
    const everySixHours$ = interval(6 * 60 * 60 * 1000)
    const everySixHoursOnceAppIsStable$ = concat(race(appIsStable$, timer(3000)), everySixHours$)

    updates.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(async (evt) => {
        if (await this.promptUser()) {
          // Reload the page to update to the latest version.
          document.location.reload()
        }
      })

    everySixHoursOnceAppIsStable$.subscribe(async () => {
      try {
        const updateFound = await updates.checkForUpdate()
        console.log(updateFound ? 'A new version is available.' : 'Already on the latest version.')
      } catch (err) {
        console.error('Failed to check for updates:', err)
      }
    })
  }

  private async promptUser() {
    return await firstValueFrom(
      this.toastrService.confirm(
        { code: 'XP.MESSAGE.NewVersionUpdate', params: { Default: 'A new version is available. Update now?' } },
        { duration: Number.MAX_SAFE_INTEGER, verticalPosition: 'top' }
      )
    )
  }
}
