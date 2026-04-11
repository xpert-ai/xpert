import { Injectable, inject } from '@angular/core'
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  CanActivateFn,
  ResolveFn,
  Router,
  RouterStateSnapshot
} from '@angular/router'
import { StoriesService, StoryPointsService, convertStoryResult } from '@xpert-ai/cloud/state'
import { WasmAgentService } from '@xpert-ai/ocap-angular/wasm-agent'
import { Story } from '@xpert-ai/story/core'
import { EMPTY, Observable, catchError, map } from 'rxjs'
import { AccessEnum, IStoryPoint } from '../types'
import { ToastrService } from './toastr.service'

export const storyResolver: ResolveFn<Story> = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router)
  return inject(StoriesService)
    .getOne(route.paramMap.get('id')!, null, route.queryParamMap.get('token'))
    .pipe(
      map(convertStoryResult),
      catchError((err) => {
        console.error(err)
        router.navigate(['/404'])
        return EMPTY
      })
    )
}

@Injectable()
export class StoryPublicResolver {
  constructor(private storyService: StoriesService, private wasmAgent: WasmAgentService) {}
  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Story | Observable<Story> | Promise<Story> {
    const storyId = route.paramMap.get('id')
    return this.storyService.getPublicOne(storyId).pipe(map(convertStoryResult))
  }
}

export const storyPointResolver: ResolveFn<IStoryPoint> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const router = inject(Router)
  return inject(StoryPointsService)
    .getOne(
      route.paramMap.get('id')!,
      [
        'widgets',
        'story',

        'story.models',
        'story.models.dataSource',
        'story.models.dataSource.type',
        'story.models.indicators',

        'createdBy'
      ],
      route.queryParamMap.get('token')
    )
    .pipe(
      catchError((err) => {
        console.error(err)
        router.navigate(['/404'])
        return EMPTY
      })
    )
}

export const canActivateStoryEdit: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router)
  const toastr = inject(ToastrService)

  return inject(StoriesService)
    .getAccess(route.paramMap.get('id')!)
    .pipe(
      map(({ access }) => {
        if (access === AccessEnum.Write) {
          return true
        } else {
          toastr.error('PAC.MESSAGE.NoEditAuthorization', '', { Default: 'No edit authorization' })
          router.navigate(['../'])
          return false
        }
      })
    )
}
