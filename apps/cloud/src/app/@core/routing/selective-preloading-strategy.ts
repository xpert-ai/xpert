import { Injectable } from '@angular/core'
import { PreloadAllModules, Route } from '@angular/router'
import { Observable, of } from 'rxjs'
import { environment } from '../../../environments/environment'

@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy extends PreloadAllModules {
  override preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const preload = route.data?.['preload']
    // Development preloading competes with API calls and on-demand component compilation.
    return preload === false || (!environment.production && preload !== true) ? of(null) : super.preload(route, load)
  }
}
