/** Older runtime plugins can still send this event; new emissions use ON_CHAT_EVENT. */
export const RESOURCE_CARD_EVENT = 'xpert.resource_card'
export { emitResourceCard } from '../resource-card'
