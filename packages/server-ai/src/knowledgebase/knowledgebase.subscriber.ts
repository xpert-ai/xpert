import { EntitySubscriberInterface, EventSubscriber, RemoveEvent } from "typeorm";
import { IKnowledgebase } from "@xpert-ai/contracts";
import { Knowledgebase } from "./knowledgebase.entity";
import { CommandBus } from "@nestjs/cqrs";
import { KnowledgebaseClearCommand } from "./commands";

@EventSubscriber()
export class KnowledgebaseSubscriber implements EntitySubscriberInterface<Knowledgebase> {
    constructor(private readonly commandBus: CommandBus) {}

    /**
    * Indicates that this subscriber only listen to Knowledgebase events.
    */
    listenTo() {
        return Knowledgebase;
    }

    /**
     * Called after entity is removed from the database.
     *
     * @param event
     */
    async afterRemove(event: RemoveEvent<Knowledgebase>):  Promise<any | void> {
        try {
            if (event.entityId) {
                const entity: IKnowledgebase = event.entity;

                await this.commandBus.execute(new KnowledgebaseClearCommand({ entity }))
            }
        } catch (error) {
            console.log(error);
        }
    }
}