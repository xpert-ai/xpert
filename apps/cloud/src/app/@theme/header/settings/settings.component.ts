// import { CdkMenuModule } from '@angular/cdk/menu'
// import { CommonModule } from '@angular/common'
// import { Component, computed, inject } from '@angular/core'
// import { toSignal } from '@angular/core/rxjs-interop'
// import { FormsModule } from '@angular/forms'
// import { Router } from '@angular/router'
// import { ThemesEnum } from '@metad/ocap-angular/core'
// import { DisplayBehaviour } from '@metad/ocap-core'
// import { TranslateModule, TranslateService } from '@ngx-translate/core'
// import { startWith } from 'rxjs'
// import { LANGUAGES, LanguagesMap, Store } from '../../../@core'
// import { UserProfileInlineComponent } from '../../../@shared/'

// const THEMES = [
//   {
//     key: 'system',
//     caption: 'System',
//     icon: 'settings_suggest'
//   },
//   {
//     key: 'light',
//     caption: 'Light',
//     icon: 'light_mode'
//   },
//   {
//     key: 'dark',
//     caption: 'Dark',
//     icon: 'dark_mode'
//   },
//   {
//     key: 'dark-green',
//     caption: 'Dark Green',
//     icon: 'dark_mode'
//   }
// ]

// @Component({
//   standalone: true,
//   imports: [CommonModule, FormsModule, CdkMenuModule, TranslateModule, UserProfileInlineComponent],
//   selector: 'pac-header-settings',
//   templateUrl: './settings.component.html'
// })
// export class HeaderSettingsComponent {
//   languages = LANGUAGES
//   DisplayBehaviour = DisplayBehaviour
//   ThemesEnum = ThemesEnum

//   readonly store = inject(Store)
//   readonly router = inject(Router)
//   readonly #translate = inject(TranslateService)

//   readonly preferredTheme$ = toSignal(this.store.preferredTheme$)
//   readonly preferredThemeIcon$ = computed(() => THEMES.find((item) => item.key === this.preferredTheme$())?.icon)

//   readonly userSignal = toSignal(this.store.user$)
//   // readonly isAuthenticated$ = computed(() => Boolean(this.store.user))
//   readonly language$ = toSignal(this.store.preferredLanguage$.pipe(startWith(this.#translate.currentLang)))

//   readonly themesT$ = toSignal(this.#translate.stream('PAC.Themes'))

//   readonly themeOptions$ = computed(() => {
//     const translate = this.themesT$()
//     return THEMES.map((item) => ({
//       ...item,
//       caption: translate[item.caption] ?? item.caption
//     }))
//   })

//   readonly langLabel = computed(() => LANGUAGES.find((_) => _.value === this.language$())?.label)
//   readonly themeLabel = computed(
//     () => this.themeOptions$().find((_) => _.key === (this.preferredTheme$() ?? ThemesEnum.system))?.caption
//   )

//   onLanguageSelect(language: string): void {
//     this.store.preferredLanguage = LanguagesMap[language] ?? language
//   }
//   onThemeSelect(mode: string): void {
//     this.store.preferredTheme = mode
//   }
//   onProfile() {
//     this.router.navigate(['/settings/account'])
//   }
//   onLogoutClick(): void {
//     this.router.navigate(['/auth/logout'])
//   }
// }
