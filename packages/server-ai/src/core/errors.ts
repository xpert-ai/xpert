import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'

export class XpertCopilotNotFoundException extends NotFoundException {}
export class CopilotNotFoundException extends NotFoundException {}
export class CopilotModelNotFoundException extends NotFoundException {}
export class CopilotModelInvalidException extends BadRequestException {}
export class AiModelNotFoundException extends NotFoundException {}
export class ExceedingLimitException extends ForbiddenException {}

export class UnimplementedException extends BadRequestException {
  constructor(message?: string) {
    super(message || 'This feature is not yet implemented.');
  }
}

export class ThreadAlreadyExistsException extends BadRequestException {
  constructor(message?: string) {
    super(message || 'The thread already exists.');
  }
}

export class XpertConfigException extends NotFoundException {}
export class XpertSensitiveOperationException extends BadRequestException {}