import { DSCoreService, EntityType } from "@metad/ocap-core"

export type ChatBIContext = {
	dsCoreService: DSCoreService
	entityType: EntityType
	// subscriber: Subscriber<any>
}