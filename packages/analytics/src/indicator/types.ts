import { IIndicator, IndicatorDraftFields, TIndicator } from "@metad/contracts";
import { pick } from "@metad/server-common";
import { RequestContext } from "@metad/server-core";
import { Indicator } from "./indicator.entity";

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

export function applyIndicatorDraft(indicator: IIndicator) {
    return indicator.draft ? {
        ...indicator,
        ...indicator.draft,
    } : indicator
}

export function extractIndicatorDraft(indicator: IIndicator): Partial<IIndicator> {
    // If a draft already exists, no action is required.
    if (indicator.draft) return indicator
    
    const draft: Partial<TIndicator> = {};
    const rest: Partial<Indicator> = {};

    for (const key of (Object.keys(indicator) as Array<keyof IIndicator>)) {
        if (IndicatorDraftFields.includes(key)) {
            draft[key] = indicator[key];
        } else if (key !== 'draft') {
            rest[key] = indicator[key];
        }
    }

    return { ...rest, draft };
}