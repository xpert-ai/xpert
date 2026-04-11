import { AbstractControl, ValidatorFn } from "@angular/forms";
import { isNotEmpty } from "@xpert-ai/ocap-angular/core";
import { isEmpty } from "lodash-es";
import { patterns } from "../../@shared/regex/regex-patterns.const";

export class EmailValidator {

    static pattern(field: string): ValidatorFn {
        return (formGroup: AbstractControl): { [key: string]: boolean } | null => {
            const control = formGroup.get(field);            
            return EmailValidator.validator(control, patterns.email);
        };
    }

    /**
     * Validate emails
     * 
     * @param control 
     * @param pattern 
     * @returns 
     */
    static validator(control: AbstractControl, pattern: RegExp) {
        if (isNotEmpty(control.value)) {
            control.markAsTouched();
            let invalid = false;
            (control.value || []).forEach((email: string) => {
                if (email && !EmailValidator.isValid(email, pattern)) {
                    invalid = true;
                }
            });
            if (invalid) {
                control.setErrors({ invalid: true });
                return { emailValid: false };
            }
        } else if(isEmpty(control.value)) {
            control.setErrors({ required: true });
            return { emailValid: false };
        }
        control.setErrors(null);
        return null;
    }
    
    static isValid(email: string, regExp: RegExp): boolean {
        try {
            return new RegExp(regExp).test(email);
        } catch (TypeError) {
            return false;
        }
    }
}