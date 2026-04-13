import { Injectable } from '@angular/core'
import { NxCoreService } from '@xpert-ai/core'
import { ComponentStore } from '@xpert-ai/store'

export interface SettingsState {
  theme: string
  autoNightMode: boolean
  // nightTheme: string
  stickyHeader: boolean
  pageAnimations: boolean
  pageAnimationsDisabled: boolean
  elementsAnimations: boolean
  hour: number
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService extends ComponentStore<SettingsState> {
  get _className_() {
    return SettingsService.name
  }
  public settings$ = this.select(state => state)

  constructor(
    private coreService: NxCoreService
  ) {
    super({theme: 'default', stickyHeader: true} as SettingsState)
    // this.sync(new StorageStore(`ANALYTICS_CLOUD_STATE`), {watchProperty: ['theme', 'language']})
  }

  readonly changeTheme = this.updater((state, theme: string) => {
    state.theme = theme
    this.coreService.changeTheme(theme)
  })
}
