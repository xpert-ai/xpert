import { CredentialFormSchema, CredentialFormTypeEnum, ParameterType } from "@metad/contracts";


export class CommonValidator {
    protected validateAndFilterCredentialFormSchemas(
        credentialFormSchemas: CredentialFormSchema[], credentials: Record<string, any>
    ): Record<string, any> {
        const needValidateCredentialFormSchemaMap: Record<string, CredentialFormSchema> = {};
        for (const credentialFormSchema of credentialFormSchemas) {
            if (!credentialFormSchema.show_on) {
                needValidateCredentialFormSchemaMap[credentialFormSchema.variable] = credentialFormSchema;
                continue;
            }

            let allShowOnMatch = true;
            for (const showOnObject of credentialFormSchema.show_on) {
                if (!(showOnObject.variable in credentials) || credentials[showOnObject.variable] !== showOnObject.value) {
                    allShowOnMatch = false;
                    break;
                }
            }

            if (allShowOnMatch) {
                needValidateCredentialFormSchemaMap[credentialFormSchema.variable] = credentialFormSchema;
            }
        }

        const validatedCredentials: Record<string, any> = {};
        for (const credentialFormSchema of Object.values(needValidateCredentialFormSchemaMap)) {
            const result = this.validateCredentialFormSchema(credentialFormSchema, credentials);
            if (result !== undefined) {
                validatedCredentials[credentialFormSchema.variable] = result;
            }
        }

        return validatedCredentials;
    }

    private validateCredentialFormSchema(
        credentialFormSchema: CredentialFormSchema, credentials: Record<string, any>
    ): string | number | boolean | undefined {
        if (!(credentialFormSchema.variable in credentials) || !credentials[credentialFormSchema.variable]) {
            if (credentialFormSchema.required) {
                throw new Error(`Variable ${credentialFormSchema.variable} is required`);
            } else {
                return credentialFormSchema.default || undefined;
            }
        }

        let value = credentials[credentialFormSchema.variable];

        if (credentialFormSchema.max_length && value.length > credentialFormSchema.max_length) {
            throw new Error(`Variable ${credentialFormSchema.variable} length should not be greater than ${credentialFormSchema.max_length}`);
        }

        if (typeof value !== 'string') {
            throw new Error(`Variable ${credentialFormSchema.variable} should be string`);
        }

        if ([CredentialFormTypeEnum.SELECT, CredentialFormTypeEnum.RADIO].includes(credentialFormSchema.type as CredentialFormTypeEnum)) {
            if (credentialFormSchema.options && !credentialFormSchema.options.some(option => option.value === value)) {
                throw new Error(`Variable ${credentialFormSchema.variable} is not in options`);
            }
        }

        if (credentialFormSchema.type === ParameterType.BOOLEAN) {
            if (!['true', 'false'].includes(value.toLowerCase())) {
                throw new Error(`Variable ${credentialFormSchema.variable} should be true or false`);
            }
            value = value.toLowerCase() === 'true';
        }

        return value;
    }
}
