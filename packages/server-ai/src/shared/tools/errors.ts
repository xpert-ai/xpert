import { BadRequestException, NotFoundException } from '@nestjs/common'

export class ToolProviderNotFoundError extends NotFoundException {}

export class ToolNotFoundError extends NotFoundException {}

export class ToolParameterValidationError extends BadRequestException {}

export class ToolProviderCredentialValidationError extends BadRequestException {}

export class ToolNotSupportedError extends BadRequestException {}

export class ToolInvokeError extends BadRequestException {}

export class ToolApiSchemaError extends BadRequestException {}