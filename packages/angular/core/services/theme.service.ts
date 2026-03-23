import { Injectable, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { resolveTheme } from '../models'

@Injectable({
  providedIn: 'root'
})
export class NgmThemeService {
  readonly #themeClass$ = signal<string>('')

  readonly themeClass$ = toObservable(this.#themeClass$)
  readonly themeClass = this.#themeClass$.asReadonly()

  constructor() {
    const initialClass = resolveTheme(document.documentElement.dataset['theme'])
    this.#themeClass$.set(initialClass)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const newClass = resolveTheme(document.documentElement.dataset['theme'])
          if (newClass !== this.#themeClass$()) {
            this.#themeClass$.set(newClass)
          }
        }
      }
    })

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
}
