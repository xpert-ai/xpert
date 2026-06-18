import { WorkflowChunkerNodeStrategy, WorkflowChunkerNodeValidator } from './chunker/index'
import { WorkflowKnowledgeBaseNodeStrategy, WorkflowKnowledgeBaseNodeValidator } from './knowledgebase'
import { LocalFileStrategy } from './local-files.strategy'
import { WorkflowProcessorNodeStrategy, WorkflowProcessorValidator } from './processor'
import { RetrieverCommonStrategies } from './retriever-common'
import { WorkflowSourceNodeStrategy, WorkflowSourceNodeValidator } from './source/index'
import { TextSplitterCommonStrategies } from './textsplitter-common'
import { TransformerCommonStrategies } from './transformer-common'
import { WorkflowUnderstandingNodeStrategy, WorkflowUnderstandingNodeValidator } from './understanding'

export * from './local-files.strategy'
export * from './source/index'
export * from './knowledgebase/index'
export * from './chunker/index'

export const Validators = [
    WorkflowSourceNodeValidator,
    WorkflowKnowledgeBaseNodeValidator,
    WorkflowChunkerNodeValidator,
    WorkflowProcessorValidator,
    WorkflowUnderstandingNodeValidator
]

export const Strategies = [
    LocalFileStrategy,
    ...RetrieverCommonStrategies,
    ...TextSplitterCommonStrategies,
    ...TransformerCommonStrategies,
    WorkflowSourceNodeStrategy,
    WorkflowKnowledgeBaseNodeStrategy,
    WorkflowChunkerNodeStrategy,
    WorkflowProcessorNodeStrategy,
    WorkflowUnderstandingNodeStrategy
]
