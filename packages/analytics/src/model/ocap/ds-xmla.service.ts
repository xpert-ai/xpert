import { EntityService } from "@metad/ocap-core"
import { XmlaDataSource } from "@metad/ocap-xmla"
import { MyXmlaEntityService } from "./entity.service"


/**
 * DataSource for XMLA
 */
export class MyXmlaDataSource extends XmlaDataSource {
  createEntityService<T>(entitySet: string): EntityService<T> {
    return new MyXmlaEntityService<T>(this, entitySet)
  }
}
