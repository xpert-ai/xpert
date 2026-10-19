import { Injectable } from '@nestjs/common'
import {
    ProjectPipelineRuntimeAdapterRegistry,
    type ProjectPipelineOperationContext,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import type {
    ProjectPipelineEvidenceRef,
    ProjectPipelineNodeDefinition,
    ProjectPipelineOperationReceipt,
    ProjectPipelineJsonValue
} from '@xpert-ai/contracts'
import { pipelineDigest } from '../persistence/pipeline-identity'

/** Evidence is reread under the actor's access; stored references never grant access by themselves. */
@Injectable()
export class ProjectPipelineEvidenceService {
    constructor(private readonly adapters: ProjectPipelineRuntimeAdapterRegistry) {}

    async verify(context: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef, expectedSchema?: string) {
        if (expectedSchema && reference.schemaRef !== expectedSchema)
            throw new Error('PIPELINE_EVIDENCE_SCHEMA_MISMATCH')
        const value = await this.adapters
            .resolve('evidence', reference.resolverRef, context.actor)
            .read(context, reference)
        if (pipelineDigest(value) !== reference.digest) throw new Error('PIPELINE_EVIDENCE_DIGEST_MISMATCH')
        return this.adapters.resolve('schema', reference.schemaRef, context.actor).parse(value)
    }

    async inputs(context: ProjectPipelineOperationContext) {
        for (const input of Object.values(context.inputs)) {
            if (input.kind === 'evidence') await this.verify(context, input.value)
            else if (input.kind === 'evidence_collection')
                for (const ref of input.value) await this.verify(context, ref)
        }
    }

    async outputs(
        context: ProjectPipelineOperationContext,
        node: ProjectPipelineNodeDefinition,
        receipt: ProjectPipelineOperationReceipt
    ) {
        if (receipt.status !== 'succeeded') return
        const expected = node.outputPorts ?? {}
        if (Object.keys(expected).length !== Object.keys(receipt.outputs).length)
            throw new Error('PIPELINE_OUTPUT_PORT_MISMATCH')
        const values: Record<string, ProjectPipelineJsonValue> = {}
        for (const [port, schema] of Object.entries(expected)) {
            const ref = receipt.outputs[port]
            if (!ref || ref.producerOperationId !== context.work.operationId)
                throw new Error('PIPELINE_OUTPUT_PRODUCER_MISMATCH')
            values[port] = await this.verify(context, ref, schema)
        }
        if (node.kind === 'work' && node.outputSchemaRef)
            this.adapters.resolve('schema', node.outputSchemaRef, context.actor).parse(values)
    }
}
