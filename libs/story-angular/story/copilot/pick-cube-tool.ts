import { signal } from '@angular/core'
import { DynamicTool } from '@langchain/core/tools'
import { calcEntityTypePrompt, markdownEntityType } from '@xpert-ai/core'
import { EntityType } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { firstValueFrom } from 'rxjs'

export function createStoryPickCubeTool(storyService: NxStoryService) {
  const defaultDataSource = signal<string>(null)
  const defaultCube = signal<EntityType>(null)
  const tool = new DynamicTool({
    name: 'pick_default_cube',
    description: 'Pick a default cube',
    func: async () => {
      const result = await storyService.openDefultDataSettings()

      if (result?.dataSource && result?.entities[0]) {
        defaultDataSource.set(result.dataSource)
        const entityType = await firstValueFrom(
          storyService.selectEntityType({ dataSource: result.dataSource, entitySet: result.entities[0] })
        )
        defaultCube.set(entityType)
      }
      return `The cube is:
\`\`\`
${markdownEntityType(defaultCube())}
\`\`\`
`
    }
  })
  return { defaultDataSource, defaultCube, tool }
}
