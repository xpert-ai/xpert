import { Injectable } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import { IXpert } from "@cloud/app/@core";
import { linkedModel } from "@metad/ocap-angular/core";
import { injectParams } from "ngxtension/inject-params";
import { Subject } from "rxjs";

@Injectable()
export class XpertService {
    readonly #paramId = injectParams('id')

    readonly paramId = linkedModel({
        initialValue: null,
        compute: () => this.#paramId(),
        update: (value) => value
    })
    readonly paramId$ = toObservable(this.paramId)

    readonly published$ = new Subject<IXpert>()
}