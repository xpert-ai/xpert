import { inject } from '@angular/core'
import { Router } from '@angular/router'
import type { WorkbenchExtensionViewOpenRequest, XpertViewHostEventMessage } from '@xpert-ai/contracts'
import { ViewHostEventBus } from '../../../../../@shared/view-extension/view-host-event-bus.service'
import {
  KNOWLEDGEBASE_WORKBENCH_VIEW_KEY,
  getKnowledgebaseCitationTarget,
  type KnowledgebaseCitationTarget
} from './knowledgebase'

export function injectKnowledgebaseCitationNavigation(options: {
  available: (key: string) => boolean
  openView: (request: WorkbenchExtensionViewOpenRequest) => Promise<boolean | void>
}) {
  const router = inject(Router)
  const events = inject(ViewHostEventBus)
  return async (event: XpertViewHostEventMessage) => {
    const target = getKnowledgebaseCitationTarget(event)
    events.publish(event)
    if (!target) return
    if (
      !target.faqId &&
      !target.wikiPageId &&
      target.documentId &&
      options.available(KNOWLEDGEBASE_WORKBENCH_VIEW_KEY)
    ) {
      try {
        const opened = await options.openView({
          viewKey: KNOWLEDGEBASE_WORKBENCH_VIEW_KEY,
          parameters: {
            ...(target.knowledgebaseId ? { knowledgebaseId: target.knowledgebaseId } : {}),
            documentId: target.documentId,
            ...(target.chunkId ? { chunkId: target.chunkId } : {})
          }
        })
        if (opened !== false) return
      } catch {
        // View availability can change between discovery and the authorized open.
      }
    }
    await openFallback(router, target)
  }
}

function openFallback(router: Router, target: KnowledgebaseCitationTarget) {
  if (!target.knowledgebaseId) {
    return Promise.resolve(false)
  }

  if (target.faqId) {
    return router.navigate(['/xpert/knowledges', target.knowledgebaseId, 'faq'], {
      queryParams: { faqId: target.faqId }
    })
  }

  if (target.wikiPageId) {
    return router.navigate(['/xpert/knowledges', target.knowledgebaseId, 'wiki'], {
      queryParams: {
        wikiPageId: target.wikiPageId,
        ...(target.section ? { section: target.section } : {})
      }
    })
  }

  if (!target.documentId) {
    return Promise.resolve(false)
  }

  const queryParams: Record<string, string> = {}
  if (target.chunkId) queryParams['chunkId'] = target.chunkId
  if (target.page) {
    queryParams['view'] = 'analysis'
    queryParams['page'] = String(target.page)
  } else if (target.chunkId) {
    queryParams['view'] = 'chunks'
  }
  if (target.sourceBlockIds?.[0]) queryParams['block'] = target.sourceBlockIds[0]

  return router.navigate(
    ['/xpert/knowledges', target.knowledgebaseId, 'documents', target.documentId],
    Object.keys(queryParams).length || target.evidenceText
      ? {
          ...(Object.keys(queryParams).length ? { queryParams } : {}),
          ...(target.evidenceText
            ? {
                state: {
                  knowledgeEvidence: {
                    text: target.evidenceText.slice(0, 4000),
                    ...(target.chunkId ? { chunkId: target.chunkId } : {}),
                    ...(target.page ? { page: target.page } : {}),
                    ...(target.sourceBlockIds?.length ? { sourceBlockIds: target.sourceBlockIds } : {})
                  }
                }
              }
            : {})
        }
      : undefined
  )
}
