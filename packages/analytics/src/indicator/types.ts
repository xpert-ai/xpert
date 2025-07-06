import { IIndicator } from "@metad/contracts";
import { pick } from "@metad/server-common";
import { RequestContext } from "@metad/server-core";

export const JOB_EMBEDDING_INDICATORS = 'embedding-indicators'
export const EMBEDDING_INDICATOR_FIELDS = ['code', 'name', 'entity', 'business']
export type TJobEmbeddingIndicators = {
    userId: string;
    projectId: string;
}

export function createIndicatorNamespace(projectId: string) {
    return ['project', projectId || RequestContext.currentUserId(), 'indicators']
}

export function pickEmbeddingIndicator(indicator: IIndicator) {
    return pick(indicator, [
        'id',
        'code',
        'name',
        'type',
        'unit',
        'entity',
        'modelId',
        'options',
        'business',
        'validity',
        'principal',
        'certification',
        'tags'
    ])
}