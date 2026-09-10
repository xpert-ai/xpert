import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { isDocumentKnowledgebaseType } from '@xpert-ai/contracts'
import { KnowledgebaseService, ToastrService } from '../../../../@core'
import { getKnowledgebaseDefaultRoute, isKnowledgebaseWikiEnabled } from './knowledgebase-route'

export const knowledgebaseWikiGuard: CanActivateFn = async (route) => {
  const service = inject(KnowledgebaseService)
  const router = inject(Router)
  const toastr = inject(ToastrService)
  const id = route.pathFromRoot.map((ancestor) => ancestor.paramMap.get('id')).find((value) => !!value)
  if (!id) return router.createUrlTree(['/xpert/w'])
  try {
    const knowledgebase = await firstValueFrom(service.getDetail(id))
    if (isDocumentKnowledgebaseType(knowledgebase.type) && isKnowledgebaseWikiEnabled(knowledgebase)) return true
    return router.createUrlTree(getKnowledgebaseDefaultRoute({ id, type: knowledgebase.type }), {
      queryParams: route.queryParams
    })
  } catch (error) {
    toastr.danger(error)
    return router.createUrlTree(['/xpert/w'])
  }
}
