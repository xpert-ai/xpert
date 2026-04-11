import { AiModelTypeEnum, ModelCredentialSchema } from "@xpert-ai/contracts";
import { CommonValidator } from "./common_validator";

export class ModelCredentialSchemaValidator extends CommonValidator {
    private modelType: AiModelTypeEnum;
    private modelCredentialSchema: ModelCredentialSchema;

    constructor(modelType: AiModelTypeEnum, modelCredentialSchema: ModelCredentialSchema) {
        super();
        this.modelType = modelType;
        this.modelCredentialSchema = modelCredentialSchema;
    }

    public validateAndFilter(credentials: Record<string, any>): Record<string, any> {
        if (!this.modelCredentialSchema) {
            throw new Error("Model credential schema is None");
        }

        const credentialFormSchemas = this.modelCredentialSchema.credential_form_schemas;

        credentials["__model_type"] = this.modelType;

        return this.validateAndFilterCredentialFormSchemas(credentialFormSchemas, credentials);
    }
}
