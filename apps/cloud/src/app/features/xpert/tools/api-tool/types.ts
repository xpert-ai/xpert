import { FormGroup } from "@angular/forms";
import { BehaviorSubject } from "rxjs";

export abstract class XpertConfigureToolComponent {
    protected refresh$ = new BehaviorSubject<void>(null)
    abstract isValid(): boolean
    abstract isDirty(): boolean

    abstract formGroup: FormGroup

    refreshForm() {
        this.refresh$.next()
    }
}