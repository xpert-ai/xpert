import { Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { Connection, EntitySubscriberInterface, UpdateEvent } from 'typeorm'
import { DataSource } from './data-source.entity'
import { DataSourceUpdatedEvent } from './events'

/**
 * 没有解决 typeorm Subscriber 与注入 nestjs EventBus 的问题
 */
@Injectable()
export class DataSourceSubscriber implements EntitySubscriberInterface<DataSource> {
	constructor(
		private connection: Connection,
		private eventBus: EventBus
	) {
		connection.subscribers.push(this)
	}

	listenTo(): any {
		return DataSource
	}

	afterUpdate(event: UpdateEvent<DataSource>): Promise<any> | void {
		if (event.entity?.id) {
			this.eventBus.publish(new DataSourceUpdatedEvent(event.entity.id))
		}
	}
}
