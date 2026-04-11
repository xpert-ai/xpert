import { EntityService } from "@xpert-ai/ocap-core"
import { XmlaDataSource } from "@xpert-ai/ocap-xmla"
import { MyXmlaEntityService } from "./entity.service"


/**
 * DataSource for XMLA
 */
export class MyXmlaDataSource extends XmlaDataSource {
  createEntityService<T>(entitySet: string): EntityService<T> {
    return new MyXmlaEntityService<T>(this, entitySet)
  }
}
