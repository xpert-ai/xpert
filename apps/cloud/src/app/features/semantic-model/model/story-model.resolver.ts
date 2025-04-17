import { Injectable, inject } from '@angular/core'
import { ActivatedRouteSnapshot, ResolveFn, Router, RouterStateSnapshot } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { EMPTY, Observable, catchError } from 'rxjs'
import { ISemanticModel } from '../../../@core'

/**
 * @deprecated use function semanticModelResolver
 */
@Injectable()
export class StoryModelResolver  {
  constructor(private modelsService: SemanticModelServerService) {}

  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): ISemanticModel | Observable<ISemanticModel> | Promise<ISemanticModel> {
    const modelId = route.paramMap.get('id')
    return this.modelsService.getById(modelId, {
      relations: [
        'dataSource',
        'dataSource.type',
        'stories',
        'stories.createdBy',
        'roles',
        'roles.users',
        'indicators',
        'indicators.createdBy',
        // 'queries'
      ]
    })
  }
}


export const semanticModelResolver: ResolveFn<ISemanticModel> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const router = inject(Router)
  return resolveSemanticModel(inject(SemanticModelServerService), route.paramMap.get('id')!)
    .pipe(
      catchError((err) => {
        console.error(err)
        router.navigate(['/404'])
        return EMPTY
      })
    )
}

export function resolveSemanticModel(modelsService: SemanticModelServerService, id: string) {
  return modelsService.getById(id, {
    relations: [
      'dataSource',
      'dataSource.type',
      'stories',
      'stories.createdBy',
      'roles',
      'roles.users',
      'indicators',
      'indicators.createdBy',
      // 'queries'
    ]
  })
}
