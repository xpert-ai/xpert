import { IMCPOptions } from './mcp-options.interface';

export interface IMCPOptionsFactory {
    createMCPOptions(): Promise<IMCPOptions> | IMCPOptions;
}
