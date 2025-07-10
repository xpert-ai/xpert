import { Injectable } from '@nestjs/common';
import { Tool } from '@orbit-codes/nestjs-mcp';

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