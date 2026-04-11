import { ToolParameterType } from "@xpert-ai/contracts";

export class ToolParameterConverter {
    static getParameterType(parameterType: string | ToolParameterType): string {
        switch (parameterType) {
            case ToolParameterType.STRING:
            case ToolParameterType.SECRET_INPUT:
            case ToolParameterType.SELECT:
                return "string";
            case ToolParameterType.BOOLEAN:
                return "boolean";
            case ToolParameterType.NUMBER:
                return "number";
            default:
                throw new Error(`Unsupported parameter type ${parameterType}`);
        }
    }

    static castParameterByType(value: any, parameterType: string): any {
        try {
            switch (parameterType) {
                case ToolParameterType.STRING:
                case ToolParameterType.SECRET_INPUT:
                case ToolParameterType.SELECT:
                    return value === null || value === undefined ? "" : (typeof value === 'string' ? value : String(value));
                case ToolParameterType.BOOLEAN:
                    if (value === null || value === undefined) {
                        return false;
                    } else if (typeof value === 'string') {
                        switch (value.toLowerCase()) {
                            case "true":
                            case "yes":
                            case "y":
                            case "1":
                                return true;
                            case "false":
                            case "no":
                            case "n":
                            case "0":
                                return false;
                            default:
                                return Boolean(value);
                        }
                    } else {
                        return typeof value === 'boolean' ? value : Boolean(value);
                    }
                case ToolParameterType.NUMBER:
                    if (typeof value === 'number') {
                        return value;
                    } else if (typeof value === 'string' && value !== "") {
                        return value.includes(".") ? parseFloat(value) : parseInt(value, 10);
                    }
                    break;
                case ToolParameterType.FILE:
                    return value;
                default:
                    return String(value);
            }
        } catch (error) {
            throw new Error(`The tool parameter value ${value} is not in correct type of ${parameterType}.`);
        }
    }
}
