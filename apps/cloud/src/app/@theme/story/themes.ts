import { ElementRef, Renderer2, Signal, effect, inject, isSignal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NxCoreService } from '@metad/core'
import { isEqual } from '@metad/ocap-core'
import { NxStoryService } from '@metad/story/core'
import { registerTheme } from 'echarts/core'
import { firstValueFrom } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { AppService } from '../../app.service'
import { ThemesEnum } from '@metad/ocap-angular/core'

const LEGACY_DARK_GREEN_THEME = 'dark-green'

export function registerStoryThemes(storyService: NxStoryService) {
  return storyService.echartsTheme$
    .pipe(filter(Boolean), distinctUntilChanged(isEqual), takeUntilDestroyed())
    .subscribe(async (echartsTheme) => {
      const story = await firstValueFrom(storyService.story$)
      const key = story.key || story.id
      Object.values(ThemesEnum).forEach((theme) => {
        if (echartsTheme?.[theme]) {
          registerTheme(`${theme}-${key}`, echartsTheme[theme])
        }
      })
    })
}

export function effectStoryTheme(elementRef: Signal<ElementRef<unknown>> | ElementRef<unknown>) {
  const storyService = inject(NxStoryService)
  const coreService = inject(NxCoreService)
  const appService = inject(AppService)
  const renderer = inject(Renderer2)

  const storyKey$ = toSignal(storyService.story$.pipe(map((story) => story.key || story.id)))
  const echartsTheme$ = toSignal(storyService.story$.pipe(map((story) => story.options?.echartsTheme)))

  return effect(() => {
    const key = storyKey$()
    const echartsTheme = echartsTheme$()

    const nativeElement = isSignal(elementRef) ? elementRef()?.nativeElement : elementRef.nativeElement
    if (!nativeElement) {
      return
    }

    Object.values(ThemesEnum).forEach((theme) => {
      renderer.removeClass(nativeElement, 'ngm-theme-' + theme)
      renderer.removeClass(nativeElement, theme)
    })

    let current = storyService.themeName()
    if (String(current) === LEGACY_DARK_GREEN_THEME) {
      current = ThemesEnum.dark
    }

    if (current && current !== ThemesEnum.default && current !== ThemesEnum.system) {
      renderer.addClass(nativeElement, 'ngm-theme-' + current)
      renderer.addClass(nativeElement, current)
    }

    if (current === ThemesEnum.system || current === ThemesEnum.default || !current) {
      const { primary } = appService.theme$()
      current = primary as ThemesEnum
    }
    if (echartsTheme?.[current]) {
      coreService.changeTheme(`${current}-${key}`)
    } else {
      coreService.changeTheme(current)
    }
  })
}
