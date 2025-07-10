import { Tool } from '@metad/server-ai';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CalculatorService {
  @Tool({
    name: 'add',
    description: 'Add two numbers together',
    parameters: {
      a: 'number',
      b: 'number',
    },
  })
  async add(params) {
    const { a, b } = params;
    const result = a + b;
    return result.toString();
  }
}