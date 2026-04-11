import { Injectable, InjectionToken } from '@angular/core'
import { QueryOptions } from '@xpert-ai/ocap-core'
import { Observable, of } from 'rxjs'

/**
 * Intercepts and handles an `HttpRequest` or `HttpResponse`.
 *
 * Most interceptors transform the outgoing request before passing it to the
 * next interceptor in the chain, by calling `next.handle(transformedReq)`.
 * An interceptor may transform the
 * response event stream as well, by applying additional RxJS operators on the stream
 * returned by `next.handle()`.
 *
 * More rarely, an interceptor may handle the request entirely,
 * and compose a new event stream instead of invoking `next.handle()`. This is an
 * acceptable behavior, but keep in mind that further interceptors will be skipped entirely.
 *
 * It is also rare but valid for an interceptor to return multiple responses on the
 * event stream for a single request.
 *
 * @publicApi
 *
 * @see [HTTP Guide](guide/http#intercepting-requests-and-responses)
 *
 * @usageNotes
 *
 * To use the same instance of `HttpInterceptors` for the entire app, import the `HttpClientModule`
 * only in your `AppModule`, and add the interceptors to the root application injector .
 * If you import `HttpClientModule` multiple times across different modules (for example, in lazy
 * loading modules), each import creates a new copy of the `HttpClientModule`, which overwrites the
 * interceptors provided in the root module.
 *
 */
export interface NxSmartEntityInterceptor {
  /**
   * Identifies and handles a given HTTP request.
   * @param req The outgoing request object to handle.
   * @param next The next interceptor in the chain, or the backend
   * if no interceptors remain in the chain.
   * @returns An observable of the event stream.
   */
  intercept(req: QueryOptions, next: NxSmartEntityHandler): Observable<QueryOptions>
}

/**
 * Transforms an `HttpRequest` into a stream of `HttpEvent`s, one of which will likely be a
 * `HttpResponse`.
 *
 * `HttpHandler` is injectable. When injected, the handler instance dispatches requests to the
 * first interceptor in the chain, which dispatches to the second, etc, eventually reaching the
 * `HttpBackend`.
 *
 * In an `HttpInterceptor`, the `HttpHandler` parameter is the next interceptor in the chain.
 *
 * @publicApi
 */
export abstract class NxSmartEntityHandler {
  abstract handle(req: QueryOptions): Observable<QueryOptions>
}

@Injectable()
export class NoopSmartEntityHandler extends NxSmartEntityHandler {
  handle(req: QueryOptions): Observable<QueryOptions> {
    return of(req)
  }
}

/**
 * `HttpHandler` which applies an `HttpInterceptor` to an `HttpRequest`.
 *
 *
 */
export class NxSmartEntityInterceptorHandler implements NxSmartEntityHandler {
  constructor(private next: NxSmartEntityHandler, private interceptor: NxSmartEntityInterceptor) {}

  handle(req: QueryOptions): Observable<QueryOptions> {
    return this.interceptor.intercept(req, this.next)
  }
}

/**
 * A multi-provider token that represents the array of registered
 * `NxSmartEntityInterceptor` objects.
 *
 * @publicApi
 */
export const SMART_ENTITY_INTERCEPTORS = new InjectionToken<NxSmartEntityInterceptor[]>('SMART_ENTITY_INTERCEPTORS')

@Injectable()
export class NoopInterceptor implements NxSmartEntityInterceptor {
  intercept(req: QueryOptions): Observable<QueryOptions> {
    return of(req)
  }
}
