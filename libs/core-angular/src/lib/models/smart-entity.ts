import { EntityBusinessState, PresentationVariant, SelectionVariant } from "@xpert-ai/ocap-core";

export interface SmartEntityDataOptions<T> extends EntityBusinessState {
    selectionVariant?: SelectionVariant
    presentationVariant?: PresentationVariant
}
