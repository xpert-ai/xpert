import { ForbiddenException, NotFoundException } from "@nestjs/common";

export class AiModelNotFoundException extends NotFoundException {}
export class CredentialsValidateFailedError extends ForbiddenException {
}

export class AIModelProviderNotFoundException extends NotFoundException {}