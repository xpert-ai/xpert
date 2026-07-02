import { inject, Injectable } from '@angular/core'
import { forkJoin, map } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  type IAssistantBinding,
  type IXpert
} from '../../../@core'

export type ClawXpertBindingTarget = {
  xpertId: string
  workspaceId: string
  label: string
}

@Injectable({ providedIn: 'root' })
export class ClawXpertBindingTargetService {
  readonly #assistantBindingService = inject(AssistantBindingService)

  getCurrentUserTarget() {
    return forkJoin({
      binding: this.#assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER),
      xperts: this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
    }).pipe(map(({ binding, xperts }) => resolveClawXpertBindingTarget(binding, xperts)))
  }
}

export function resolveClawXpertBindingTarget(
  binding: Pick<IAssistantBinding, 'assistantId'> | null | undefined,
  xperts: IXpert[] | null | undefined
): ClawXpertBindingTarget | null {
  const assistantId = readNonEmptyString(binding?.assistantId)
  if (!assistantId) {
    return null
  }

  const xpert = normalizeXperts(xperts).find((item) => item.id === assistantId) ?? null
  const workspaceId = readNonEmptyString(xpert?.workspaceId)
  if (!xpert || !workspaceId) {
    return null
  }

  return {
    xpertId: xpert.id,
    workspaceId,
    label: xpert.title?.trim() || xpert.name?.trim() || xpert.slug?.trim() || xpert.id
  }
}

function normalizeXperts(items: IXpert[] | null | undefined) {
  const seen = new Set<string>()
  return (items ?? []).filter((xpert): xpert is IXpert => {
    if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) {
      return false
    }

    seen.add(xpert.id)
    return true
  })
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
