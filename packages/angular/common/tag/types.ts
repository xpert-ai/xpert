import { ISelectOption } from "@xpert-ai/ocap-angular/core";

export interface ITagOption<T = unknown> extends ISelectOption<T> {
    color?: string
}