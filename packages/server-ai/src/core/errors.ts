import { NotFoundException, BadRequestException } from '@nestjs/common'

export class XpertCopilotNotFoundException extends NotFoundException {}
export class CopilotNotFoundException extends NotFoundException {}
export class CopilotModelNotFoundException extends NotFoundException {}
export class CopilotModelInvalidException extends BadRequestException {}
export class AiModelNotFoundException extends NotFoundException {}
