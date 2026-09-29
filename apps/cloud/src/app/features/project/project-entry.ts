import type { Router } from '@angular/router'
import type { XpertProjectEntry } from '@xpert-ai/contracts'

/** Preserve Project scope while navigating a host-authorized application view or platform Project. */
export function navigateProjectEntry(router: Router, entry: XpertProjectEntry) {
  if (entry.kind === 'project')
    return entry.projectId ? router.navigate(['/project', entry.projectId]) : Promise.resolve(false)
  const commands = entry.projectId ? ['/chat/x', entry.slug, 'p', entry.projectId, 'c'] : ['/chat/x', entry.slug, 'c']
  return router.navigate(commands, {
    queryParams: {
      view: entry.viewKey,
      viewSelection: entry.selectionId
    }
  })
}
