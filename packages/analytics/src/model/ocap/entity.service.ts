import { ISlicer, QueryOptions, QueryReturn, Semantics, VariableEntryType } from "@metad/ocap-core"
import { XmlaEntityService } from "@metad/ocap-xmla"
import { RequestContext } from "@metad/server-core"
import { Observable } from "rxjs"

export class MyXmlaEntityService<T> extends XmlaEntityService<T> {

  override selectQuery(query?: QueryOptions<any>): Observable<QueryReturn<T>> {
    const user = RequestContext.currentUser()
    const schema = this.dataSource.options.schema
    const cubeSchema = schema?.cubes?.find((_) => _.name === this.entitySet)
    if (cubeSchema) {
      query ??= {}
			cubeSchema.variables
				?.filter((_) => !_.visible && _.variableEntryType === VariableEntryType.Required)
				.forEach((_) => {
					let key = null
					if (_.semantics?.semantic) {
						switch (_.semantics.semantic) {
							case Semantics['Sys.UserEmail']: {
								key = user?.email
								break
							}
							case Semantics['Sys.UserName']: {
								key = user?.username
								break
							}
							case Semantics['Sys.UserRole']: {
								key = user?.role?.name
								break
							}
							case Semantics['Sys.UserID']: {
								key = user?.id
								break
							}
							case Semantics['Sys.UserThirdPartyId']: {
								key = user?.thirdPartyId
								break
							}
						}
					}

					if (key) {
            query.filters ??= []
						query.filters.push({
							dimension: {
								parameter: _.name,
								dimension: _.referenceDimension,
								hierarchy: _.referenceHierarchy
							},
							members: [
								{
									key
								}
							]
						} as ISlicer)
					}
				})
		}

    return super.selectQuery(query)
  }
}
