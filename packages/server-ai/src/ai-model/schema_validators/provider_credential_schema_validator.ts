import { ProviderCredentialSchema } from "@xpert-ai/contracts";
import { CommonValidator } from "./common_validator";

export class ProviderCredentialSchemaValidator extends CommonValidator {
    private providerCredentialSchema: ProviderCredentialSchema;

    constructor(providerCredentialSchema: ProviderCredentialSchema) {
        super();
        this.providerCredentialSchema = providerCredentialSchema;
    }

    validateAndFilter(credentials: Record<string, any>): Record<string, any> {
        // 获取 provider_credential_schema 中的 credential_form_schemas
        const credentialFormSchemas = this.providerCredentialSchema.credential_form_schemas;

        return this.validateAndFilterCredentialFormSchemas(credentialFormSchemas, credentials);
    }
}
