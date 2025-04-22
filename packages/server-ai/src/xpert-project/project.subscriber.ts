import { EntitySubscriberInterface, EventSubscriber, LoadEvent } from 'typeorm'
import { XpertProject } from './project.entity'

@EventSubscriber()
export class XpertProjectSubscriber implements EntitySubscriberInterface<XpertProject> {
	/**
	 * Indicates that this subscriber only listen to XpertProject events.
	 */
	listenTo() {
		return XpertProject
	}

	afterLoad(entity: XpertProject, event?: LoadEvent<XpertProject>): Promise<any> | void {
		entity.ownerId ??= entity.createdById
		entity.owner ??= entity.createdBy
	}
}
