import { ChecklistItem } from "@metad/contracts"

export const QUERY_QUEUE_NAME = 'model-query-queue'

export interface ModelChecklistItem extends ChecklistItem {
	checkType: 'Cube' | 'Dimension' | 'Measure' | 'Join' | 'Hierarchy' | string
	checkKey: string // Cube ID / Dimension ID / Measure ID, etc.
}
