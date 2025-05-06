import { EntitySubscriberInterface, EventSubscriber } from 'typeorm'
import { XpertProjectTask } from './project-task.entity'

@EventSubscriber()
export class XpertProjectTaskSubscriber implements EntitySubscriberInterface<XpertProjectTask> {
	/**
	 * Indicates that this subscriber only listen to Entity events.
	 */
	listenTo() {
		return XpertProjectTask
	}

	afterLoad(entity: XpertProjectTask): void {
		if (entity?.steps) {
			entity.steps.sort((a, b) => a.stepIndex - b.stepIndex)
		}
	}
}
