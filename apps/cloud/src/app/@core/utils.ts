import { computed, inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom, Observable } from 'rxjs'
import { ToastrService } from './services'
import { getErrorMessage, LanguagesEnum } from './types'
import { injectLanguage } from './providers'

export function requestFullscreen(document) {
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen()
  } else if (document.documentElement.mozRequestFullScreen) {
    /* Firefox */
    document.documentElement.mozRequestFullScreen()
  } else if (document.documentElement.webkitRequestFullscreen) {
    /* Chrome, Safari and Opera */
    document.documentElement.webkitRequestFullscreen()
  } else if (document.documentElement.msRequestFullscreen) {
    /* IE/Edge */
    document.documentElement.msRequestFullscreen()
  }
}

/* Close fullscreen */
export function exitFullscreen(document) {
  if (document.fullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    } else if (document.mozCancelFullScreen) {
      /* Firefox */
      document.mozCancelFullScreen()
    } else if (document.webkitExitFullscreen) {
      /* Chrome, Safari and Opera */
      document.webkitExitFullscreen()
    } else if (document.msExitFullscreen) {
      /* IE/Edge */
      document.msExitFullscreen()
    }
  }
}

export async function tryHttp<T>(request: Observable<T>, toastrService?: ToastrService) {
  try {
    return await firstValueFrom(request)
  } catch (err) {
    toastrService?.error(getErrorMessage(err))
  }
}

export function omitSystemProperty<T>(obj: T) {
  return Object.keys(obj)
    .filter((key) => !(key.startsWith('__') && key.endsWith('__')))
    .reduce((acc, key) => {
      acc[key] = obj[key]
      return acc
    }, {} as T)
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUUID(id: string) {
  return uuidRegex.test(id)
}

export function getWebSocketUrl(url: string) {
  return (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + url.replace('http:', '').replace('https:', '')
}

/**
 * Inject help website url for language
 * 
 * @returns url of website
 */
export function injectHelpWebsite() {
  const translate = inject(TranslateService)
  const lang = injectLanguage()

  const website = 'https://mtda.cloud'

  return computed(() => {
    const language = lang()
    if ([LanguagesEnum.Chinese, LanguagesEnum.SimplifiedChinese, LanguagesEnum.TraditionalChinese].includes(language)) {
      return website
    } else {
      return `${website}/en`
    }
  })
}
