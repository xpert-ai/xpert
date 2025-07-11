import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DiscoveryService } from '@nestjs/core/discovery';
import { MetadataScanner, Reflector } from '@nestjs/core';

import { IMCPOptions } from './types/mcp-options.interface';
import { IMCPAsyncOptions } from './types/mcp-async-options.interface';
import { IMCPOptionsFactory } from './types/mcp-options-factory.interface';
import { MCPService } from './mcp.service';
import { BaseMCPController } from './controllers/base-mcp.controller';

@Module({})
export class MCPModule {
    static register(options: IMCPOptions): DynamicModule {
        return {
            global: true,
            module: MCPModule,
            imports: [DiscoveryModule],
            controllers: [BaseMCPController],
            providers: [
                {
                    provide: 'MCP_OPTIONS',
                    useValue: options,
                },
                MetadataScanner,
                Reflector,
                {
                    provide: MCPService,
                    useFactory: (discoveryService: DiscoveryService, metadataScanner: MetadataScanner, reflector: Reflector) => 
                        new MCPService(options, discoveryService, metadataScanner, reflector),
                    inject: [DiscoveryService, MetadataScanner, Reflector],
                },
            ],
            exports: [MCPService],
        };
    }

    static registerAsync(options: IMCPAsyncOptions): DynamicModule {
        return {
            global: true,
            module: MCPModule,
            imports: [...(options.imports || []), DiscoveryModule],
            controllers: [BaseMCPController],
            providers: [
                ...this.createAsyncProviders(options),
                MetadataScanner,
                Reflector,
                {
                    provide: MCPService,
                    useFactory: (mcpOptions: IMCPOptions, discoveryService: DiscoveryService, metadataScanner: MetadataScanner, reflector: Reflector) =>
                        new MCPService(mcpOptions, discoveryService, metadataScanner, reflector),
                    inject: ['MCP_OPTIONS', DiscoveryService, MetadataScanner, Reflector],
                },
            ],
            exports: [MCPService],
        };
    }

    private static createAsyncProviders(options: IMCPAsyncOptions): Provider[] {
        if (options.useExisting || options.useFactory) {
            return [this.createAsyncOptionsProvider(options)];
        }

        // If useClass is used
        return [
            this.createAsyncOptionsProvider(options),
            {
                provide: options.useClass!,
                useClass: options.useClass!,
            },
        ];
    }

    private static createAsyncOptionsProvider(options: IMCPAsyncOptions): Provider {
        if (options.useFactory) {
            return {
                provide: 'MCP_OPTIONS',
                useFactory: options.useFactory,
                inject: options.inject || [],
            };
        }

        // If useExisting or useClass is being used
        return {
            provide: 'MCP_OPTIONS',
            useFactory: (optionsFactory: IMCPOptionsFactory) => optionsFactory.createMCPOptions(),
            inject: [options.useExisting || options.useClass!],
        };
    }
}
