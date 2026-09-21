import type { Router } from '@angular/router'
import type { XpertProjectTypeRef } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import type { XpertProjectApiService } from './project-api.service'
import { navigateProjectEntry } from './project-entry'

export type ChatProjectCreateRequest =
  | { kind: 'create'; name: string; projectType?: XpertProjectTypeRef }
  | { kind: 'entry'; projectType: XpertProjectTypeRef }

function projectType(value: unknown): XpertProjectTypeRef | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('applicationKey' in value) ||
    !('projectTypeKey' in value) ||
    typeof value.applicationKey !== 'string' ||
    typeof value.projectTypeKey !== 'string' ||
    !value.applicationKey ||
    !value.projectTypeKey
  )
    return undefined
  return { applicationKey: value.applicationKey, projectTypeKey: value.projectTypeKey }
}

/** Parse ChatKit bridge events once and reject malformed type references before calling the host API. */
export function chatProjectCreateRequest(event: {
  name: string
  data?: Record<string, unknown>
}): ChatProjectCreateRequest | null {
  if (event.name === 'project.create-entry') {
    const type = projectType(event.data)
    return type ? { kind: 'entry', projectType: type } : null
  }
  if (event.name !== 'project.create') return null
  const name = event.data?.['name']
  if (typeof name !== 'string' || !name.trim()) return null
  const type = projectType(event.data?.['projectType'])
  if (event.data?.['projectType'] !== undefined && !type) return null
  return { kind: 'create', name: name.trim(), projectType: type }
}

/** Route entity creation through its governed application entry; select direct Projects after creation. */
export async function executeChatProjectCreate(
  api: XpertProjectApiService,
  router: Router,
  request: ChatProjectCreateRequest,
  assistantId: string,
  select: (projectId: string) => void
) {
  if (request.kind === 'entry') {
    const entry = await firstValueFrom(api.typeEntry(request.projectType, { xpertId: assistantId }))
    await navigateProjectEntry(router, entry)
    return
  }
  const project = await firstValueFrom(
    api.create({
      name: request.name,
      xpertIds: [assistantId],
      ...(request.projectType ? { projectType: request.projectType } : {})
    })
  )
  select(project.id)
}
