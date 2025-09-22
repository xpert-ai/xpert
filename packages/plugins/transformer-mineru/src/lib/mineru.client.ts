import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { ENV_MINERU_API_BASE_URL, ENV_MINERU_API_TOKEN } from './types';

interface CreateTaskOptions {
  url: string;
  isOcr?: boolean;
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
  modelVersion?: string; // "vlm" or "pipeline" etc.
  dataId?: string;
  pageRanges?: string;
  extraFormats?: string[]; // e.g. ["docx","html"]
  callbackUrl?: string;
  seed?: string;
}

interface CreateBatchTaskFile {
  url: string;
  isOcr?: boolean;
  dataId?: string;
  pageRanges?: string;
}

interface CreateBatchTaskOptions {
  files: CreateBatchTaskFile[];
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
  modelVersion?: string;
  extraFormats?: string[];
  callbackUrl?: string;
  seed?: string;
}

interface TaskResultOptions {
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
}

interface MineruTaskResult {
  code: number;
  msg: string;
  trace_id: string;
  data: any;  // Can define the type according to the specific return structure
}

@Injectable()
export class MinerUClient {
  private readonly logger = new Logger(MinerUClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    @Inject(forwardRef(() => ConfigService))
		private readonly configService: ConfigService
  ) {
    // Read configuration or environment variables
    this.baseUrl = this.configService.get<string>(ENV_MINERU_API_BASE_URL) || 'https://mineru.net/api/v4';
    this.token = this.configService.get<string>(ENV_MINERU_API_TOKEN);
    if (!this.token) {
      throw new Error('MINERU_API_TOKEN is not defined');
    }
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
  }

  /**
   * Creating a single task
   */
  async createTask(options: CreateTaskOptions): Promise<{ taskId: string }> {
    const url = `${this.baseUrl}/extract/task`;
    const body: any = {
      url: options.url,
    };
    if (options.isOcr !== undefined) body.is_ocr = options.isOcr;
    if (options.enableFormula !== undefined) body.enable_formula = options.enableFormula;
    if (options.enableTable !== undefined) body.enable_table = options.enableTable;
    if (options.language) body.language = options.language;
    if (options.modelVersion) body.model_version = options.modelVersion;
    if (options.dataId) body.data_id = options.dataId;
    if (options.pageRanges) body.page_ranges = options.pageRanges;
    if (options.extraFormats) body.extra_formats = options.extraFormats;
    if (options.callbackUrl) body.callback = options.callbackUrl;
    if (options.seed) body.seed = options.seed;

    try {
      const resp = await axios.post(url, body, { headers: this.headers });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`Mineru createTask failed: ${data.msg}`);
      }
      return { taskId: data.data.task_id };
    } catch (err) {
      this.logger.error('createTask error', err);
      throw err;
    }
  }

  /**
   * Creating batch tasks
   */
  async createBatchTask(options: CreateBatchTaskOptions): Promise<{ batchId: string; fileUrls?: string[] }> {
    const url = `${this.baseUrl}/extract/task/batch`;
    const body: any = {
      files: options.files.map(f => {
        const entry: any = { url: f.url };
        if (f.isOcr !== undefined) entry.is_ocr = f.isOcr;
        if (f.dataId) entry.data_id = f.dataId;
        if (f.pageRanges) entry.page_ranges = f.pageRanges;
        return entry;
      }),
    };
    if (options.enableFormula !== undefined) body.enable_formula = options.enableFormula;
    if (options.enableTable !== undefined) body.enable_table = options.enableTable;
    if (options.language) body.language = options.language;
    if (options.modelVersion) body.model_version = options.modelVersion;
    if (options.extraFormats) body.extra_formats = options.extraFormats;
    if (options.callbackUrl) body.callback = options.callbackUrl;
    if (options.seed) body.seed = options.seed;

    try {
      const resp = await axios.post(url, body, { headers: this.headers });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`Mineru createBatchTask failed: ${data.msg}`);
      }
      return { batchId: data.data.batch_id, fileUrls: data.data.file_urls };
    } catch (err) {
      this.logger.error('createBatchTask error', err);
      throw err;
    }
  }

  /**
   * Query task status/results (single task)
   */
  async getTaskResult(taskId: string, options?: TaskResultOptions): Promise<any> {
    const url = `${this.baseUrl}/extract/task/${taskId}`;
    const params: any = {};
    if (options?.enableFormula !== undefined) params.enable_formula = options.enableFormula;
    if (options?.enableTable !== undefined) params.enable_table = options.enableTable;
    if (options?.language) params.language = options.language;

    try {
      const resp = await axios.get(url, { headers: this.headers, params });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`Mineru getTaskResult failed: ${data.msg}`);
      }
      return data.data;
    } catch (err) {
      this.logger.error('getTaskResult error', err);
      throw err;
    }
  }

  /**
   * Query batch task status/results
   */
  async getBatchResult(batchId: string): Promise<any> {
    const url = `${this.baseUrl}/extract-results/batch/${batchId}`;
    try {
      const resp = await axios.get(url, { headers: this.headers });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`Mineru getBatchResult failed: ${data.msg}`);
      }
      return data.data;
    } catch (err) {
      this.logger.error('getBatchResult error', err);
      throw err;
    }
  }

  /**
   * Wait for a task to complete and get the result (polling)
   */
  async waitForTask(taskId: string, timeoutMs: number = 5 * 60 * 1000, intervalMs: number = 5000): Promise<any> {
    const start = Date.now();
    while (true) {
      const result = await this.getTaskResult(taskId);
      // Determine whether the task is complete based on whether the data contains the final URL or status.
      // The documentation states that when a task is complete, a full or zip URL will be in the data - you need to determine this based on the actual fields.
      if (result.full_zip_url || result.full_url || result.content /* Or other fields */) {
        return result;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Mineru waitForTask timeout after ${timeoutMs} ms`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
}
