import { FeatureStatusEnum } from '@metad/contracts'
import { toggleFeatures } from '@metad/server-config'
import { isNil } from 'lodash'
import { EntitySubscriberInterface, EventSubscriber } from 'typeorm'
import { shuffle } from 'underscore'
import { FileStorage } from './../core/file-storage'
import { Feature } from './feature.entity'

@EventSubscriber()
export class FeatureSubscriber implements EntitySubscriberInterface<Feature> {
	/**
	 * Indicates that this subscriber only listen to Feature events.
	 */
	listenTo() {
		return Feature
	}

	/**
	 * Called after entity is loaded.
	 */
	afterLoad(entity: any) {
		if (!entity.status) {
			entity.status = shuffle(Object.values(FeatureStatusEnum))[0]
		}

		if (!isNil(toggleFeatures[entity.code])) {
			const feature = toggleFeatures[entity.code]
			entity.isEnabled = feature
		} else {
			entity.isEnabled = true
		}

		if (entity.image) {
			entity.imageUrl = new FileStorage().getProvider().url(entity.image)
		}
	}
}
