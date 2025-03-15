import { inject } from '@angular/core'
import { EventSourceMessage, EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source'
import { firstValueFrom, Observable } from 'rxjs'
import { AuthStrategy } from '../auth'
import { Store } from './store.service'
import { injectLanguage } from '../providers'

export function injectFetchEventSource<T extends BodyInit | null>() {
  const store = inject(Store)
  const auth = inject(AuthStrategy)
  const lang = injectLanguage()


  return (url: string, data: T) => {
    return new Observable<EventSourceMessage>((subscriber) => {
      const ctrl = new AbortController()
      const organization = store.selectedOrganization ?? { id: null }

      // For retry 1 when unauthorized.
      let unauthorized = false
      function req() {
        // Has retry request
        let haveTry = false
        const token = store.token
        fetchEventSource(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Organization-Id': `${organization.id}`,
            Language: lang(),
            'Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          body: data,
          openWhenHidden: true,
          signal: ctrl.signal,
          onopen: async (response) => {
            if (!unauthorized && response.status === 401) {
              unauthorized = true
              await firstValueFrom(auth.refreshToken())
              haveTry = true
              return req()
            }

            const contentType = response.headers.get('content-type')
            if (
              !(contentType === null || contentType === void 0
                ? void 0
                : contentType.startsWith(EventStreamContentType))
            ) {
              throw new Error(`Expected content-type to be ${EventStreamContentType}, Actual: ${contentType}`)
            }
          },
          onmessage(msg) {
            subscriber.next(msg)
          },
          onclose() {
            if (!haveTry) {
              subscriber.complete()
            }
          },
          onerror(err) {
            subscriber.error(err)
            throw err
          }
        })
      }

      req()

      return () => ctrl.abort()
    })
  }
}
