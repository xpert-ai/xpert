import { MinerUResultParserService } from './result-parser.service';

describe('MinerUResultParserService', () => {
  let service: MinerUResultParserService;

  beforeAll(() => {
    service = new MinerUResultParserService();
  });

  it(
    'should parse MinerU zip file and return DocumentParseResult',
    async () => {
      const url =
        'https://cdn-mineru.openxlab.org.cn/pdf/2025-09-18/a5fd82f0-3612-45f9-bb5e-5f87ed53bf57.zip';
      const taskId = 'a5fd82f0-3612-45f9-bb5e-5f87ed53bf57';

      const result = await service.parseFromUrl(url, taskId);

      // 验证 metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata.taskId).toBe(taskId);
      expect(result.metadata.layoutJson).toBeDefined();
      expect(result.metadata.contentListJson).toBeDefined();
      expect(result.metadata.mineruBackend).toBeDefined();
      expect(result.metadata.mineruVersion).toBeDefined();

      // 验证 chunks
      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks.length).toBeGreaterThan(0);

      // 检查第一个 chunk 的内容
      const firstChunk = result.chunks[0];
      expect(firstChunk.pageContent).toBeDefined();
      expect(firstChunk.pageContent.length).toBeGreaterThan(0);
    },
    20000, // 给 axios 下载 zip 足够时间
  );
});
