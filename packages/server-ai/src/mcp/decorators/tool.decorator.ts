import { SetMetadata } from '@nestjs/common';

import { MetadataKey } from '../types/metadata.type';

export interface ITool {
    name: string;
    description: string;
    parameters?: any;
}

export const Tool = (props: ITool) => {
    return SetMetadata(MetadataKey.MCP_TOOL, props);
};
