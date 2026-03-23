import { EntitySubscriberInterface, EventSubscriber, LoadEvent, RemoveEvent } from 'typeorm'
import { IStorageFile } from '@metad/contracts'
import { StorageFile } from './storage-file.entity'
import { FileStorage } from '../file/file-storage/file-storage'

@EventSubscriber()
export class StorageFileSubscriber implements EntitySubscriberInterface<StorageFile> {
	/**
	 * Indicates that this subscriber only listen to StorageFile events.
	 */
	listenTo() {
		return StorageFile
	}

	/**
	 * Called after entity is loaded from the database.
	 *
	 * @param entity
	 * @param event
	 */
	afterLoad(entity: StorageFile | Partial<StorageFile>, event?: LoadEvent<StorageFile>): void | Promise<any> {
		try {
			if (entity instanceof StorageFile) {
				const { storageProvider } = entity
				const store = new FileStorage().setProvider(storageProvider)
				if (entity.file) {
					entity.fileUrl = store.getProviderInstance().url(entity.file)
				}
				// entity.thumbUrl = store.getProviderInstance().url(entity.thumb);
			}
		} catch (error) {
			console.log(error)
		}
	}

	/**
	 * Called after entity is removed from the database.
	 *
	 * @param event
	 */
	async afterRemove(event: RemoveEvent<StorageFile>): Promise<any | void> {
		try {
			if (event.entityId) {
				const entity: IStorageFile = event.entity
				const { storageProvider } = entity

				const instance = new FileStorage().setProvider(storageProvider).getProviderInstance()

				if (entity.file) {
					await instance.deleteFile(entity.file)
				}
				if (entity.thumb) {
					await instance.deleteFile(entity.thumb)
				}
			}
		} catch (error) {
			console.log(error)
		}
	}
}
