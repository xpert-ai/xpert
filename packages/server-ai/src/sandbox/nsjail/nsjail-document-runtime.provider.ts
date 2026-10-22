import { Injectable } from '@nestjs/common'
import { SandboxJobRuntimeError, SandboxRuntimeProviderStrategy } from '@xpert-ai/plugin-sdk'
import {
    SandboxRuntimeDefinitionRegistry,
    DOCUMENT_NODE_RUNTIME_PROFILE,
    DOCUMENT_JAVA_RUNTIME_PROFILE
} from '../sandbox-job/sandbox-runtime-definition.registry'
import { getNsjailMessage } from './nsjail-i18n'
import { NsjailJobRuntimeProvider } from './nsjail-job-runtime.provider'

export const NSJAIL_DOCUMENT_PROVIDER = 'nsjail-document'

@Injectable()
@SandboxRuntimeProviderStrategy(NSJAIL_DOCUMENT_PROVIDER)
export class NsjailDocumentRuntimeProvider extends NsjailJobRuntimeProvider {
    constructor(definitions: SandboxRuntimeDefinitionRegistry) {
        super(
            definitions,
            NSJAIL_DOCUMENT_PROVIDER,
            [
                {
                    name: DOCUMENT_NODE_RUNTIME_PROFILE,
                    bindingId: 'nsjail-document:node-20-v1',
                    route: '/v1/document/node',
                    healthTimeoutMs: 75_000,
                    digest: 'manifest'
                },
                {
                    name: DOCUMENT_JAVA_RUNTIME_PROFILE,
                    bindingId: 'nsjail-document:java-17-v1',
                    route: '/v1/document/java',
                    healthTimeoutMs: 75_000,
                    digest: 'manifest'
                }
            ],
            unavailable,
            invalidPolicy
        )
    }
}

function unavailable(capacity = false): SandboxJobRuntimeError {
    return new SandboxJobRuntimeError(
        capacity ? 'SANDBOX_CAPACITY_UNAVAILABLE' : 'SANDBOX_START_FAILED',
        getNsjailMessage(
            'NsJailDocumentUnavailable',
            'NsJail Document Runtime is unavailable. Check the Runner image, managed document dependencies and cgroup v2 isolation.'
        ),
        true
    )
}

function invalidPolicy(): Error {
    return new Error(
        getNsjailMessage(
            'NsJailDocumentInvalidPolicy',
            'The NsJail Document request does not match the supported runtime policy.'
        )
    )
}
