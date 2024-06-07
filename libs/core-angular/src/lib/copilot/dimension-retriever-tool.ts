import { InjectionToken, Signal, inject } from '@angular/core'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { BaseRetriever } from '@langchain/core/retrievers'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { formatDocumentsAsString } from 'langchain/util/document'
import { z } from 'zod'

export abstract class BaseDimensionMemberRetriever extends BaseRetriever {
  model: Signal<string>
  cube: Signal<string>
}

export const MEMBER_RETRIEVER_TOKEN = new InjectionToken<BaseDimensionMemberRetriever>('DimensionMemberRetriever')
export const MEMBER_RETRIEVER_TOOL_NAME = 'dimensionMemberKeySearch'

export function createDimensionMemberRetrieverTool(
  retriever: BaseDimensionMemberRetriever,
  model: Signal<string>,
  cube: Signal<string>
) {
  retriever.model = model
  retriever.cube = cube
  return new DynamicStructuredTool({
    name: MEMBER_RETRIEVER_TOOL_NAME,
    description:
      'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
    schema: z.object({
      dimension: z.string().describe('The dimension to look up in the retriever'),
      member: z.string().describe('The member to look up in the retriever')
    }),
    func: async ({ dimension, member }, runManager?: CallbackManagerForToolRun) => {
      try {
        const docs = await retriever.getRelevantDocuments(`${dimension || ''} ${member}`, runManager?.getChild('retriever'))
        console.log(docs)
        return formatDocumentsAsString(docs)
      }catch(e){
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

export const PROMPT_RETRIEVE_DIMENSION_MEMBER = `Analyze user input to determine whether the sentence involves dimension members. If it involves dimension members, the "${MEMBER_RETRIEVER_TOOL_NAME}" tool needs to be called to retrieve information about the dimension members. Otherwise, proceed to the next step directly.`
