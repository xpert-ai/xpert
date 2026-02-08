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
import { TSandboxProviderMeta } from '@metad/contracts'

const LOCAL_SHELL_SANDBOX_PROVIDER = 'local-shell-sandbox'
const LOCAL_SHELL_SANDBOX_ICON = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 19.2.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" id="Layer_1" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" xmlns:graph="&ns_graphs;"
	 xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512"
	 style="enable-background:new 0 0 512 512;" xml:space="preserve">
<style type="text/css">
	.Drop_x0020_Shadow{fill:none;}
	.Round_x0020_Corners_x0020_2_x0020_pt{fill:#FFFFFF;stroke:#1B1B1F;stroke-miterlimit:10;}
	.Live_x0020_Reflect_x0020_X{fill:none;}
	.Bevel_x0020_Soft{fill:url(#SVGID_1_);}
	.Dusk{fill:#FFFFFF;}
	.Foliage_GS{fill:#FFDC00;}
	.Pompadour_GS{fill-rule:evenodd;clip-rule:evenodd;fill:#58AEE2;}
	.st0{fill:none;}
	.st1{fill:#FFFFFF;}
	.st2{fill:#283037;}
	.st3{fill:#4DA825;}
</style>
<switch>
	<foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1">
		<i:pgfRef  xlink:href="#adobe_illustrator_pgf">
		</i:pgfRef>
	</foreignObject>
	<g i:extraneous="self">
		<linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0.7071" y2="0.7071">
			<stop  offset="0" style="stop-color:#E6E6EA"/>
			<stop  offset="0.1719" style="stop-color:#E2E2E6"/>
			<stop  offset="0.3482" style="stop-color:#D7D6DA"/>
			<stop  offset="0.5264" style="stop-color:#C4C2C5"/>
			<stop  offset="0.7061" style="stop-color:#A9A7A8"/>
			<stop  offset="0.8852" style="stop-color:#878484"/>
			<stop  offset="1" style="stop-color:#6D6968"/>
		</linearGradient>
		<g>
			<rect x="0.3" y="1.3" class="st0" width="512" height="512"/>
			<g>
				<g>
					<path class="st1" d="M449.1,105.9L287.5,9.9c-19.3-11.5-43.1-11.5-62.4,0L63.5,105.9c-19.3,11.4-31.2,32.6-31.2,55.5v191.9
						c0,22.9,11.9,44.1,31.2,55.5l161.6,95.9c9.6,5.7,20.4,8.6,31.2,8.6c10.8,0,21.5-2.9,31.2-8.6l161.6-95.9
						c19.3-11.5,31.2-32.6,31.2-55.5V161.4C480.3,138.5,468.4,117.3,449.1,105.9z"/>
				</g>
				<g>
					<path class="st2" d="M449.1,105.9L287.5,9.9c-9.6-5.7-20.4-8.6-31.2-8.6s-21.5,2.9-31.2,8.6L63.5,105.9
						c-19.3,11.4-31.2,32.6-31.2,55.5v191.9c0,22.9,11.9,44.1,31.2,55.5l161.6,95.9c9.6,5.7,20.4,8.6,31.2,8.6
						c10.8,0,21.5-2.9,31.2-8.6l161.6-95.9c19.3-11.5,31.2-32.6,31.2-55.5V161.4C480.3,138.5,468.4,117.3,449.1,105.9z M230.8,494.9
						L69.2,399c-15.8-9.4-25.6-26.9-25.6-45.7V161.4c0-18.8,9.8-36.3,25.6-45.7l161.6-95.9c7.8-4.6,16.6-7,25.5-7s17.8,2.4,25.5,7
						l161.6,95.9c13.3,7.9,22.3,21.6,24.8,37c-5.4-11.4-17.4-14.6-31.5-6.3l-152.9,94.5c-19.1,11.1-33.1,23.7-33.1,46.6v188.4
						c0,13.8,5.5,22.7,14.1,25.3c-2.8,0.5-5.6,0.8-8.5,0.8C247.4,501.9,238.5,499.5,230.8,494.9z"/>
				</g>
				<g>
					<path class="st3" d="M406.8,371.8l-40.3,24.1c-1.1,0.6-1.9,1.3-1.9,2.6v10.5c0,1.3,0.9,1.8,1.9,1.2l40.9-24.8
						c1.1-0.6,1.2-1.8,1.2-3.1V373C408.7,371.7,407.8,371.2,406.8,371.8z"/>
				</g>
				<g>
					<path class="st1" d="M321.1,283.2c1.3-0.7,2.4,0.2,2.4,1.9l0.1,13.9c5.8-2.3,10.9-2.9,15.5-1.9c1,0.3,1.4,1.6,1,3.2l-3.1,12.3
						c-0.2,0.9-0.8,1.9-1.4,2.5c-0.3,0.3-0.5,0.5-0.8,0.6c-0.4,0.2-0.8,0.3-1.2,0.2c-2.1-0.5-7.1-1.6-14.9,2.4
						c-8.2,4.2-11.1,11.3-11,16.6c0.1,6.3,3.3,8.3,14.5,8.4c14.9,0.2,21.4,6.8,21.5,21.8c0.2,14.8-7.7,30.6-19.8,40.4l0.3,13.8
						c0,1.7-1.1,3.6-2.4,4.2l-8.2,4.7c-1.3,0.7-2.4-0.1-2.4-1.8l-0.1-13.6c-7,2.9-14.1,3.6-18.6,1.8c-0.9-0.3-1.2-1.6-0.9-3l3-12.5
						c0.2-1,0.8-2,1.5-2.6c0.3-0.2,0.5-0.4,0.8-0.6c0.5-0.2,0.9-0.3,1.3-0.1c4.9,1.6,11.1,0.9,17.1-2.2c7.6-3.9,12.7-11.6,12.6-19.4
						c-0.1-7-3.9-9.9-13.1-10c-11.7,0-22.7-2.3-22.9-19.6c-0.1-14.2,7.3-29,19-38.4l-0.1-13.9c0-1.7,1-3.6,2.4-4.3L321.1,283.2z"/>
				</g>
			</g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
	</g>
</switch>
</svg>
`

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

  readonly meta: TSandboxProviderMeta = {
    name: {
      en_US: 'Local Shell Sandbox',
      zh_Hans: '本地 Shell 沙盒'
    },
    description: {
      en_US: 'A sandbox that executes shell commands locally on the host machine.',
      zh_Hans: '在主机本地执行 shell 命令的沙盒。'
    },
    icon: {
      type: 'svg',
      value: LOCAL_SHELL_SANDBOX_ICON
    }
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
