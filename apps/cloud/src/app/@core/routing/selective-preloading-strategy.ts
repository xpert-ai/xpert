import { Injectable } from '@angular/core'
import { PreloadAllModules, Route } from '@angular/router'
import { Observable, of } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy extends PreloadAllModules {
  override preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] === false ? of(null) : super.preload(route, load)
  }
}
