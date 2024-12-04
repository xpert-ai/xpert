import { IChatBIModel } from '@metad/contracts'
import { nonNullable } from '@metad/ocap-core'

export function markdownCubes(models: IChatBIModel[]) {
    return models.filter(nonNullable).map((item) => `- dataSource: ${item.modelId}
  cubeName: ${item.entity}
  cubeCaption: ${item.entityCaption}
  cubeDescription: ${item.entityDescription}`).join('\n')
}