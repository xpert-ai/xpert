import { EntitySubscriberInterface, EventSubscriber } from "typeorm";
import faker from 'faker';
import { Organization } from "./organization.entity";

@EventSubscriber()
export class OrganizationSubscriber implements EntitySubscriberInterface<Organization> {

    /**
    * Indicates that this subscriber only listen to Organization events.
    */
    listenTo() {
        return Organization;
    }

    /**
    * Called after entity is loaded.
    */
    afterLoad(entity: Organization) {
        if (!entity.brandColor) {
            entity.brandColor = faker.internet.color();
        }
    }
}