import type { XpertViewHostEventSubscription } from '@xpert-ai/contracts'
import type { XpertViewHostEventMessage, XpertRemoteViewHostEventMessage } from '../view-host-event-bus.service'

// Explicit runtime data scopes take precedence over host identity when forwarding events.
export function matchesHost(
  event: XpertViewHostEventMessage,
  hostType: string,
  hostId: string,
  dataScopeKey: string | undefined,
  requiresDataScopeKey: boolean
) {
  const eventDataScopeKey = event.dataScopeKey?.trim() || undefined
  if (requiresDataScopeKey) {
    return Boolean(eventDataScopeKey && dataScopeKey && eventDataScopeKey === dataScopeKey)
  }
  if (eventDataScopeKey || dataScopeKey) {
    return eventDataScopeKey === dataScopeKey
  }
  if (event.hostType && event.hostType !== hostType) {
    return false
  }
  if (event.hostId && event.hostId !== hostId) {
    return false
  }
  return true
}

export function matchesSubscription(event: XpertViewHostEventMessage, subscription: XpertViewHostEventSubscription) {
  if (event.type !== subscription.event) {
    return false
  }

  const filter = subscription.filter
  if (!filter) {
    return true
  }

  return (
    matchesOptionalFilter(filter.sources, event.source) &&
    matchesOptionalFilter(filter.toolNames, event.toolName) &&
    matchesOptionalFilter(filter.viewKeys, event.visualization?.viewKey) &&
    matchesOptionalFilter(filter.visualizationTypes, event.visualization?.type)
  )
}

function matchesOptionalFilter(values: string[] | undefined, actual: string | undefined) {
  return !values?.length || (Boolean(actual) && values.includes(actual))
}

// Routing identity stays in the trusted host; embedded views receive only event content.
export function createRemoteHostEvent(event: XpertViewHostEventMessage): XpertRemoteViewHostEventMessage {
  const { hostType: _hostType, hostId: _hostId, dataScopeKey: _dataScopeKey, ...remoteEvent } = event
  return remoteEvent
}
