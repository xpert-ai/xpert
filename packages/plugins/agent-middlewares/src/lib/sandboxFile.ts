import { tool } from '@langchain/core/tools'
import {
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  BaseSandbox,
  EditOperation,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { isAbsolute, resolve } from 'node:path'
import { z } from 'zod/v3'
import { getToolCallId, withToolMessage } from './toolMessageUtils'
import { assertSandboxFeatureEnabled } from './xpertFeatureGate'

const SANDBOX_FILE_MIDDLEWARE_NAME = 'SandboxFile'

const indentationSchema = z.object({
  anchor_line: z.number().optional().describe('Anchor line to center the indentation lookup on (defaults to offset)'),
  max_levels: z.number().optional().describe('How many parent indentation levels to include (0 = unlimited)'),
  include_siblings: z.boolean().optional().describe('When true, include additional blocks that share the anchor indentation'),
  include_header: z.boolean().optional().describe('Include doc comments or attributes directly above the selected block'),
  max_lines: z.number().optional().describe('Hard cap on the number of lines returned in indentation mode')
}).optional()

const readToolSchema = z.object({
  file_path: z.string().min(1, 'File path is required.').describe('Absolute path to the file'),
  offset: z.number().optional().describe('The 1-indexed line number to start reading from (defaults to 1)'),
  limit: z.number().optional().describe('Maximum number of lines to return (defaults to 2000)'),
  mode: z.enum(['slice', 'indentation']).optional().describe('Mode: "slice" for simple ranges (default), "indentation" to expand around anchor line'),
  indentation: indentationSchema.describe('Configuration for indentation mode')
})

const globToolSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required.').describe('The glob pattern to match files against (e.g., "**/*.ts", "src/*.py")'),
  path: z.string().optional().describe('Subdirectory to search in (relative to workspace root). Defaults to "." (current directory) if not specified. Always provide this parameter for best results.')
})

const grepToolSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required.').describe('The regex pattern to search for in file contents'),
  path: z.string().optional().describe('Subdirectory to search in (relative to workspace root). Defaults to "." (current directory) if not specified. Always provide this parameter for best results.'),
  include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")')
})

const editToolSchema = z.object({
  file_path: z.string().min(1, 'File path is required.').describe('Absolute path to the file to edit'),
  old_string: z.string().describe('Exact text to replace (must match file content)'),
  new_string: z.string().describe('Replacement text'),
  replace_all: z.boolean().optional().describe('Replace all occurrences (default false)')
})

const multiEditToolSchema = z.object({
  file_path: z.string().min(1, 'File path is required.').describe('Absolute path to the file to edit'),
  edits: z.array(z.object({
    oldString: z.string().min(1, 'Old string is required.').describe('Exact text to replace (must match file content)'),
    newString: z.string().describe('Replacement text'),
    replaceAll: z.boolean().optional().describe('Replace all occurrences (default false)')
  })).min(1, 'At least one edit is required.').describe('Array of edit operations to perform sequentially on the file')
})

const writeToolSchema = z.object({
  file_path: z.string().min(1, 'File path is required.').describe('Absolute path to the file to create'),
  content: z.any().describe('Complete file content as a single string. Special characters (quotes, newlines, etc.) must be properly escaped in JSON.')
})

const appendToolSchema = z.object({
  file_path: z.string().min(1, 'File path is required.').describe('Absolute path to the file to append to'),
  content: z.any().describe('Content to append to the file. Special characters (quotes, newlines, etc.) must be properly escaped in JSON.')
})

const listDirToolSchema = z.object({
  dir_path: z.string().min(1, 'Directory path is required.').describe('Absolute path to the directory'),
  offset: z.number().optional().describe('1-indexed entry number to start from (defaults to 1)'),
  limit: z.number().optional().describe('Maximum number of entries to return (defaults to 25)'),
  depth: z.number().optional().describe('Maximum depth to traverse (defaults to 2)')
})

function getBackend(config: any): BaseSandbox {
  const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
  const backend = configurable?.sandbox?.backend as BaseSandbox | undefined
  if (!backend) {
    throw new Error('Sandbox backend is not available.')
  }
  return backend
}

function getWorkingDirectory(config: any): string {
  const backend = getBackend(config)
  const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
  return backend.workingDirectory || configurable?.sandbox?.workingDirectory
}

function resolveSandboxPath(config: any, fileOrDirPath?: string): string {
  const workingDirectory = getWorkingDirectory(config)
  if (!fileOrDirPath) {
    return workingDirectory
  }
  return isAbsolute(fileOrDirPath) ? fileOrDirPath : resolve(workingDirectory, fileOrDirPath)
}


@Injectable()
@AgentMiddlewareStrategy(SANDBOX_FILE_MIDDLEWARE_NAME)
export class SandboxFileMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: SANDBOX_FILE_MIDDLEWARE_NAME,
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>`
    },
    label: {
      en_US: 'Sandbox File Tools',
      zh_Hans: '沙箱文件工具'
    },
    description: {
      en_US: 'Adds file operation tools (read, glob, grep, write, edit, multi-edit, list-dir) via the sandbox backend.',
      zh_Hans: '添加通过沙箱后端进行文件操作的工具（读取、glob、grep、写入、编辑、多编辑、列出目录）。'
    },
    features: ['sandbox'],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(
    _options: unknown,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    assertSandboxFeatureEnabled(context, SANDBOX_FILE_MIDDLEWARE_NAME)

    const readTool = tool(
      async ({ file_path, offset, limit, mode, indentation }, config) => {
        const backend = getBackend(config)
        const resolvedFilePath = resolveSandboxPath(config, file_path)
        return withToolMessage(getToolCallId(config), 'sandbox_read_file', file_path, { file_path, offset, limit }, () =>
          backend.read(resolvedFilePath, offset, limit, mode, indentation)
        )
      },
      {
        name: 'sandbox_read_file',
        description: 'Reads a file in the sandbox with 1-indexed line numbers, supporting slice and indentation-aware block modes.',
        schema: readToolSchema
      }
    )

    const globTool = tool(
      async ({ pattern, path }, config) => {
        const backend = getBackend(config)
        const resolvedPath = resolveSandboxPath(config, path)
        return withToolMessage(getToolCallId(config), 'sandbox_glob', pattern, { pattern, path }, () =>
          backend.glob(pattern, resolvedPath)
        )
      },
      {
        name: 'sandbox_glob',
        description: 'Fast file pattern matching tool. Returns matching file paths sorted by modification time. Use this when you need to find files by name patterns.',
        schema: globToolSchema
      }
    )

    const grepTool = tool(
      async ({ pattern, path, include }, config) => {
        const backend = getBackend(config)
        const resolvedPath = resolveSandboxPath(config, path)
        return withToolMessage(getToolCallId(config), 'sandbox_grep', pattern, { pattern, path, include }, () =>
          backend.grep(pattern, resolvedPath, include)
        )
      },
      {
        name: 'sandbox_grep',
        description: 'Fast content search tool using regex. Returns matching file paths and line numbers, sorted by modification time. Use include parameter to filter files by pattern.',
        schema: grepToolSchema
      }
    )

    const editTool = tool(
      async ({ file_path, old_string, new_string, replace_all }, config) => {
        const backend = getBackend(config)
        const resolvedFilePath = resolveSandboxPath(config, file_path)
        return withToolMessage(getToolCallId(config), 'sandbox_edit_file', file_path, { file_path }, async () => {
          const result = await backend.edit(resolvedFilePath, old_string, new_string, replace_all)
          return JSON.stringify(result, null, 2)
        })
      },
      {
        name: 'sandbox_edit_file',
        description: 'Edit a file by replacing exact text. Returns edit metadata and errors when matches are missing or ambiguous.',
        schema: editToolSchema
      }
    )

    const writeTool = tool(
      async ({ file_path, content }, config) => {
        const backend = getBackend(config)
        const resolvedFilePath = resolveSandboxPath(config, file_path)
        return withToolMessage(getToolCallId(config), 'sandbox_write_file', file_path, { file_path }, async () => {
          const normalizedContent = Array.isArray(content) ? content.join('') : content
          const result = await backend.write(resolvedFilePath, normalizedContent)
          return JSON.stringify(result, null, 2)
        })
      },
      {
        name: 'sandbox_write_file',
        description: `Create a new file with the provided content. Fails if the file already exists.

IMPORTANT: For large files that may exceed output limits, use sandbox_append_file instead:
1. First call sandbox_write_file with the initial content
2. Then call sandbox_append_file multiple times to add remaining content

CRITICAL FORMAT REQUIREMENTS:
1. Parameters must be a SINGLE object with two fields: file_path and content
2. The content field must be a SINGLE string containing the entire file content
3. Do NOT split the content into multiple objects or array elements
4. All special characters (quotes, newlines, etc.) must be properly JSON-escaped

CORRECT format:
{
  "file_path": "/path/to/file.js",
  "content": "const x = 1;\\nconst y = 2;\\nconsole.log(x + y);"
}

INCORRECT format (DO NOT USE):
[
  {"file_path": "/path/to/file.js", "content": "const x = 1;"},
  {"content": "const y = 2;"}
]`,
        schema: writeToolSchema
      }
    )

    const appendTool = tool(
      async ({ file_path, content }, config) => {
        const backend = getBackend(config)
        const resolvedFilePath = resolveSandboxPath(config, file_path)
        return withToolMessage(getToolCallId(config), 'sandbox_append_file', file_path, { file_path }, async () => {
          const normalizedContent = Array.isArray(content) ? content.join('') : content
          const result = await backend.append(resolvedFilePath, normalizedContent)
          return JSON.stringify(result, null, 2)
        })
      },
      {
        name: 'sandbox_append_file',
        description: `Append content to an existing file, or create it if it doesn't exist.

USE THIS TOOL FOR LARGE FILES:
When writing large files that may exceed output token limits:
1. First call sandbox_write_file with the initial portion of content
2. Then call sandbox_append_file one or more times to add the remaining content

This allows you to write files of any size by splitting them into manageable chunks.

CRITICAL FORMAT REQUIREMENTS:
1. Parameters must be a SINGLE object with two fields: file_path and content
2. The content field must be a SINGLE string
3. All special characters (quotes, newlines, etc.) must be properly JSON-escaped`,
        schema: appendToolSchema
      }
    )

    const multiEditTool = tool(
      async ({ file_path, edits }, config) => {
        const backend = getBackend(config)
        const resolvedFilePath = resolveSandboxPath(config, file_path)
        return withToolMessage(getToolCallId(config), 'sandbox_multi_edit_file', file_path, { file_path }, async () => {
          const result = await backend.multiEdit(resolvedFilePath, edits as EditOperation[])
          return JSON.stringify(result, null, 2)
        })
      },
      {
        name: 'sandbox_multi_edit_file',
        description: 'Perform multiple sequential edits on a single file in one operation. All edits are applied sequentially, with each edit operating on the result of the previous edit. All edits must succeed for the operation to succeed (atomic). Use this when you need to make multiple changes to the same file.',
        schema: multiEditToolSchema
      }
    )

    const listDirTool = tool(
      async ({ dir_path, offset, limit, depth }, config) => {
        const backend = getBackend(config)
        const resolvedDirPath = resolveSandboxPath(config, dir_path)
        return withToolMessage(getToolCallId(config), 'sandbox_list_dir', dir_path, { dir_path, offset, limit, depth }, () =>
          backend.listDir(resolvedDirPath, offset, limit, depth)
        )
      },
      {
        name: 'sandbox_list_dir',
        description: 'List directory contents recursively with depth control and pagination. Returns a tree-like view with indentation showing directory structure. Directories end with /, symlinks with @. Use offset and limit for pagination through large directories.',
        schema: listDirToolSchema
      }
    )

    return {
      name: SANDBOX_FILE_MIDDLEWARE_NAME,
      tools: [readTool, globTool, grepTool, writeTool, appendTool, editTool, multiEditTool, listDirTool]
    }
  }
}
