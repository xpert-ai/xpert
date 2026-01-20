import cp from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Injectable } from '@nestjs/common'
import {
  BaseSandbox,
  ExecuteResponse,
  FileDownloadResponse,
  FileUploadResponse,
  ISandboxProvider,
  SandboxProviderCreateOptions,
  SandboxProviderStrategy
} from '@xpert-ai/plugin-sdk'

const LOCAL_SHELL_SANDBOX_PROVIDER = 'local-shell-sandbox'


/**
 * LocalShellSandbox - A concrete sandbox implementation for local shell execution.
 *
 * Extends BaseSandbox to provide command execution in a specified working directory.
 * All file operations (read, write, ls, grep, glob) are automatically implemented
 * by BaseSandbox using shell commands, so we only need to implement:
 * - execute(): Run shell commands
 * - uploadFiles(): Write files to the sandbox
 * - downloadFiles(): Read files from the sandbox
 */
export class LocalShellSandbox extends BaseSandbox {
  readonly id: string;
  private readonly workingDirectory: string;
  private readonly timeout: number;

  /**
   * Create a new LocalShellSandbox.
   *
   * @param options - Configuration options
   * @param options.workingDirectory - Directory where commands will be executed
   * @param options.timeout - Command timeout in milliseconds (default: 30000)
   */
  constructor(options: { workingDirectory: string; timeout?: number }) {
    super();
    this.workingDirectory = path.resolve(options.workingDirectory);
    this.timeout = options.timeout ?? 30000;
    this.id = `local-shell-${this.workingDirectory.replace(/[^a-zA-Z0-9]/g, "-")}`;

    // Ensure working directory exists
    if (!fs.existsSync(this.workingDirectory)) {
      fs.mkdirSync(this.workingDirectory, { recursive: true });
    }
  }

  /**
   * Execute a shell command in the sandbox.
   *
   * Uses /bin/bash to run commands with proper shell interpretation.
   * Captures both stdout and stderr, respects timeout.
   */
  async execute(command: string): Promise<ExecuteResponse> {
    return new Promise((resolve) => {
      const chunks: string[] = [];
      let truncated = false;
      const maxOutputBytes = 1024 * 1024; // 1MB output limit
      let totalBytes = 0;

      const child = cp.spawn("/bin/bash", ["-c", command], {
        cwd: this.workingDirectory,
        env: { ...process.env, HOME: process.env['HOME'] },
      });

      const collectOutput = (data: Buffer) => {
        const str = data.toString();
        totalBytes += data.byteLength;

        if (totalBytes <= maxOutputBytes) {
          chunks.push(str);
        } else {
          truncated = true;
        }
      };

      child.stdout.on("data", collectOutput);
      child.stderr.on("data", collectOutput);

      // Handle timeout
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({
          output: chunks.join("") + "\n[Command timed out]",
          exitCode: null,
          truncated,
        });
      }, this.timeout);

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          output: chunks.join(""),
          exitCode,
          truncated,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          output: `Error spawning process: ${err.message}`,
          exitCode: 1,
          truncated: false,
        });
      });
    });
  }

  /**
   * Upload files to the sandbox.
   *
   * Writes files to the working directory, creating parent directories as needed.
   */
  async uploadFiles(
    files: Array<[string, Uint8Array]>,
  ): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = [];

    for (const [filePath, content] of files) {
      try {
        const fullPath = path.join(this.workingDirectory, filePath);
        const parentDir = path.dirname(fullPath);

        // Ensure parent directory exists
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content);
        results.push({ path: filePath, error: null });
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === "EACCES") {
          results.push({ path: filePath, error: "permission_denied" });
        } else if (error.code === "EISDIR") {
          results.push({ path: filePath, error: "is_directory" });
        } else {
          results.push({ path: filePath, error: "invalid_path" });
        }
      }
    }

    return results;
  }

  /**
   * Download files from the sandbox.
   *
   * Reads files from the working directory.
   */
  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = [];

    for (const filePath of paths) {
      try {
        const fullPath = path.join(this.workingDirectory, filePath);

        if (!fs.existsSync(fullPath)) {
          results.push({
            path: filePath,
            content: null,
            error: "file_not_found",
          });
          continue;
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results.push({
            path: filePath,
            content: null,
            error: "is_directory",
          });
          continue;
        }

        const content = fs.readFileSync(fullPath);
        results.push({
          path: filePath,
          content: new Uint8Array(content),
          error: null,
        });
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === "EACCES") {
          results.push({
            path: filePath,
            content: null,
            error: "permission_denied",
          });
        } else {
          results.push({
            path: filePath,
            content: null,
            error: "file_not_found",
          });
        }
      }
    }

    return results;
  }
}

@Injectable()
@SandboxProviderStrategy(LOCAL_SHELL_SANDBOX_PROVIDER)
export class LocalShellSandboxProvider implements ISandboxProvider<LocalShellSandbox> {
  readonly type = LOCAL_SHELL_SANDBOX_PROVIDER

  readonly meta = {
    name: 'Local Shell Sandbox'
  }

  async create(options?: SandboxProviderCreateOptions): Promise<LocalShellSandbox> {
    return new LocalShellSandbox({
      workingDirectory: options?.workingDirectory ?? this.getDefaultWorkingDir()
    })
  }

  getDefaultWorkingDir(): string {
    return path.resolve(process.cwd(), 'sandbox')
  }
}
