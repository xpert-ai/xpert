import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, output, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { EntriesPipe, linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { omit } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { ToastrService, XpertToolsetService } from '../../../@core'
import {
  getErrorMessage,
  IXpertTool,
  IXpertToolset,
  MCPServerType,
  TMCPServer,
  uuid,
  XpertToolsetCategoryEnum
} from '../../../@core/types'
import { CodeEditorComponent } from '../../editors'
import { MCPToolsComponent } from '../tools/tools.component'

@Component({
  standalone: true,
  selector: 'mcp-server-form',
  templateUrl: './server.component.html',
  styleUrls: ['server.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    CodeEditorComponent,
    MCPToolsComponent,
    EntriesPipe
  ],
  hostDirectives: [NgxControlValueAccessor]
})
export class MCPServerFormComponent {
  eMCPServerType = MCPServerType

  readonly toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  protected cva = inject<NgxControlValueAccessor<Partial<TMCPServer> | null>>(NgxControlValueAccessor)

  readonly value$ = this.cva.value$

  // Inputs
  readonly toolset = model<Partial<IXpertToolset>>()
  readonly tools = model<IXpertTool[]>()

  // Output
  readonly toolsChange = output<IXpertTool[]>()

  // States
  readonly types = model<MCPServerType[]>([MCPServerType.SSE])
  readonly views = model<('code' | 'tools')[]>(['tools'])
  readonly fileIndex = model<number[]>([])
  readonly isCode = computed(() => this.types()[0] === MCPServerType.CODE)

  readonly args = linkedModel({
    initialValue: [],
    compute: () => {
      return this.value$()?.args
    },
    update: (args) => {
      this.value$.update((state) => ({ ...(state ?? {}), args }))
    }
  })

  get command() {
    return this.value$()?.command
  }
  set command(value: string) {
    this.value$.update((state) => ({ ...(state ?? {}), command: value }))
  }
  get url() {
    return this.value$()?.url
  }
  set url(value: string) {
    this.value$.update((state) => ({ ...(state ?? {}), url: value }))
  }

  get mainFile() {
    return this.value$()?.files?.[0]?.content
  }
  set mainFile(value: string) {
    this.updateFile(0, { content: value, name: 'main.py' })
  }
  get mainFileName() {
    return this.value$()?.files?.[0]?.name
  }

  // States
  readonly loading = signal(false)
  readonly #tempId = signal(uuid())
  readonly _toolset = computed(() => {
    return {
      category: XpertToolsetCategoryEnum.MCP,
      type: this.types()[0],
      id: this.#tempId(),
      schema: JSON.stringify({
        mcpServers: {
          '': {
            ...this.value$(),
            type: this.types()[0]
          }
        }
      })
    }
  })

  readonly error = signal<string>(null)

  readonly files = computed(() => this.value$()?.files)
  readonly env = computed(() => this.value$()?.env ?? {})
  readonly headers = computed(() => this.value$()?.headers ?? {})

  constructor() {
    effect(
      () => {
        if (this.types()[0] === 'code') {
          if (!this.files()?.length) {
            this.value$.update((state) => ({ ...(state ?? {}), files: this.initFiles() }))
            this.fileIndex.set([0])
          }
          this.command = 'python3'
          this.args.set(['main.py'])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.value$()?.type && this.value$().type !== this.types()[0]) {
          this.types.set([this.value$().type])
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
        if (this.views()[0] === 'code' && !this.fileIndex()?.length) {
          this.fileIndex.set([0])
        }
      },
      { allowSignalWrites: true }
    )
  }

  updateType(types: MCPServerType[]) {
    this.value$.update((state) => ({ ...(state ?? {}), type: types[0] }))
  }

  initFiles() {
    return [
      {
        name: 'main.py',
        content: `from mcp.server.fastmcp import FastMCP
import os

# Create a server
mcp = FastMCP(name="MCP Server", port=int(os.getenv("PORT", 8000)))

@mcp.tool()
def get_temperature(city: str) -> str:
    """Get the current temperature for a city."""
    # Mock implementation
    temperatures = {
        "new york": "72°F",
        "london": "65°F",
        "tokyo": "25°C",
    }

    city_lower = city.lower()
    if city_lower in temperatures:
        return f"The current temperature in {city} is {temperatures[city_lower]}."
    else:
        return "Temperature data not available for this city"

# Run the server with SSE transport
if __name__ == "__main__":
    mcp.run(transport="sse")
`
      },
      {
        name: 'requirements.txt',
        content: `mcp==1.6.0\n`
      }
    ]
  }

  updateFile(index: number, file: Partial<TMCPServer['files'][0]>) {
    this.value$.update((state) => {
      state ??= {}
      state.files ??= []
      state.files[index] = {
        ...(state.files[index] ?? {}),
        ...file
      } as TMCPServer['files'][0]

      return {
        ...state,
        files: [...state.files]
      }
    })
  }

  connect() {
    this.loading.set(true)
    this.error.set(null)
    this.toolsetService
      .getMCPToolsBySchema(this._toolset())
      .subscribe({
        next: (result) => {
          this.loading.set(false)
          this.tools.set(result.tools)
          // this.needSandbox.setValue(Object.values(servers).some((server) => server.transport === MCPServerTransport.STDIO || server.command))
          this.toolsChange.emit(result.tools)
          this.views.set(['tools'])
        },
        error: (err) => {
          this.error.set(getErrorMessage(err))
          this.tools.set([])
          this.#toastr.error(getErrorMessage(err))
          this.loading.set(false)
          // Handle the error scenario here
        }
      })
  }

  addHeader() {
    this.value$.update((state) => ({
      ...(state ?? {}),
      headers: {
        ...(state?.headers ?? {}),
        ['']: ''
      }
    }))
  }

  updateHeaderName(origin: string, name: string) {
    this.value$.update((state) => {
      const value = state.headers[origin]
      return {
        ...state,
        headers: {
          ...omit(state.headers, origin),
          [name]: value
        }
      }
    })
  }

  updateHeaderValue(name: string, value: string) {
    this.value$.update((state) => {
      return {
        ...state,
        headers: {
          ...omit(state.headers, origin),
          [name]: value
        }
      }
    })
  }

  removeHeader(name: string) {
    this.value$.update((state) => {
      return {
        ...state,
        headers: {
          ...omit(state.headers, name)
        }
      }
    })
  }

  addArg() {
    this.args.update((state) => {
      state ??= []
      return [...state, '']
    })
  }

  updateArg(index: number, value: string) {
    this.args.update((state) => {
      state[index] = value
      return [...state]
    })
  }

  removeArg(index: number) {
    this.args.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  addEnv() {
    this.value$.update((state) => ({
      ...(state ?? {}),
      env: {
        ...(state?.env ?? {}),
        ['']: ''
      }
    }))
  }

  updateEnvName(origin: string, name: string) {
    this.value$.update((state) => {
      const value = state.env[origin]
      return {
        ...state,
        env: {
          ...omit(state.env, origin),
          [name]: value
        }
      }
    })
  }

  updateEnvValue(name: string, value: string) {
    this.value$.update((state) => {
      return {
        ...state,
        env: {
          ...omit(state.env, origin),
          [name]: value
        }
      }
    })
  }

  removeEnv(name: string) {
    this.value$.update((state) => {
      return {
        ...state,
        env: {
          ...omit(state.env, name)
        }
      }
    })
  }
}
