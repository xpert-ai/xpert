import { InjectionToken, Signal, inject } from '@angular/core'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { BaseRetriever } from '@langchain/core/retrievers'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { MEMBER_RETRIEVER_TOOL_NAME } from '@xpert-ai/ocap-core'
import { formatDocumentsAsString } from 'langchain/util/document'
import { z } from 'zod'

export { MEMBER_RETRIEVER_TOOL_NAME }

export abstract class BaseDimensionMemberRetriever extends BaseRetriever {
  model: Signal<string>
  cube: Signal<string>
}

export const MEMBER_RETRIEVER_TOKEN = new InjectionToken<BaseDimensionMemberRetriever>('DimensionMemberRetriever')

export function createDimensionMemberRetrieverTool(
  retriever: BaseDimensionMemberRetriever,
  model?: Signal<string>,
  cube?: Signal<string>
) {
  retriever.model = model
  retriever.cube = cube
  return new DynamicStructuredTool({
    name: MEMBER_RETRIEVER_TOOL_NAME,
    description:
      'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
    schema: z.object({
      modelId: z.string().describe('The model ID'),
      cube: z.string().describe('The cube name'),
      dimension: z.string().describe('The dimension to look up in the retriever'),
      hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
      level: z.string().optional().describe('The level to look up in the retriever'),
      member: z.string().describe('The member to look up in the retriever')
    }),
    func: async ({ modelId, cube, dimension, hierarchy, level, member }, runManager?: CallbackManagerForToolRun) => {
      retriever.metadata['modelId'] = modelId
      retriever.metadata['cube'] = cube
      try {
        const docs = await retriever.invoke(
          `${dimension || ''} ${hierarchy ? `hierarchy: ${hierarchy}` : ''} ${level ? `level: ${level}` : ''} ${member}`,
          runManager?.getChild('retriever')
        )
        return formatDocumentsAsString(docs)
      } catch (e) {
        console.error(e)
        return ''
      }
    }
  })
}

export function injectDimensionMemberRetrieverTool(model: Signal<string>, cube: Signal<string>) {
  const memberRetriever = inject(MEMBER_RETRIEVER_TOKEN)
  return createDimensionMemberRetrieverTool(memberRetriever, model, cube)
}

export function injectDimensionMemberTool() {
  const memberRetriever = inject(MEMBER_RETRIEVER_TOKEN)
  return createDimensionMemberRetrieverTool(memberRetriever)
}
