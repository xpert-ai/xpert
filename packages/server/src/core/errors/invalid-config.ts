import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidConfigurationException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}