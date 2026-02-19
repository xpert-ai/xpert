import { inject, InjectionToken } from '@angular/core'
import { FewShotPromptTemplate } from '@langchain/core/prompts'
import { VectorStoreInterface, VectorStoreRetrieverInput } from '@langchain/core/vectorstores'

export type ExampleVectorStoreRetrieverInput = VectorStoreRetrieverInput<VectorStoreInterface> & { score?: number }
export const NgmCommandFewShotPromptToken = new InjectionToken<(commandName: string, props?: ExampleVectorStoreRetrieverInput) => FewShotPromptTemplate>(
  'NgmCommandFewShotPromptToken'
)

/**
 * @deprecated use Chatkit
 */
export function injectCommandFewShotPrompt(commandName: string, props?: ExampleVectorStoreRetrieverInput) {
  const createFewShot = inject(NgmCommandFewShotPromptToken)

  return createFewShot(commandName, props)
}
