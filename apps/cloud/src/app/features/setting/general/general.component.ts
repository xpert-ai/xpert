// import { Component, OnInit, inject } from '@angular/core'
// import { LANGUAGES, ROUTE_ANIMATIONS_ELEMENTS, Store } from '../../../@core/index'
// import { toSignal } from '@angular/core/rxjs-interop'
// import { ThemesEnum } from '@xpert-ai/core'

// @Component({
//   selector: 'pac-general',
//   templateUrl: './general.component.html',
//   styleUrls: ['./general.component.scss']
// })
// export class PACGeneralComponent {
//   readonly store = inject(Store)

//   routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS
//   preferredLanguage$ = this.store.preferredLanguage$
//   themes = [
//     { value: ThemesEnum.default, label: 'Default' },
//     { value: ThemesEnum.dark, label: 'Dark' },
//     // { value: 'cosmic', label: 'Cosmic' },
//   ]
//   languages = LANGUAGES

//   readonly preferredTheme$ = toSignal(this.store.preferredTheme$)

//   onLanguageSelect({ value: language }): void {
//     this.store.preferredLanguage = language
//   }

//   onThemeSelect({ value: theme }): void {
//     this.store.preferredTheme = theme
//   }
// }
