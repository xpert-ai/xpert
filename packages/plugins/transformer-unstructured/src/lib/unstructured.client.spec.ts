import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { UnstructuredClient } from './unstructured.client';
import { Document } from 'langchain/document';

describe('UnstructuredClient', () => {
  let service: UnstructuredClient;
  let configService: ConfigService;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'UNSTRUCTURED_API_BASE_URL') return 'https://api.unstructuredapp.io';
        if (key === 'UNSTRUCTURED_API_TOKEN') return 'fake-token';
        return undefined;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnstructuredClient,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<UnstructuredClient>(UnstructuredClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if token is missing and using default base url', () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'UNSTRUCTURED_API_BASE_URL') return 'https://api.unstructuredapp.io';
      if (key === 'UNSTRUCTURED_API_TOKEN') return undefined;
      return undefined;
    });
    expect(() => new UnstructuredClient(configService)).toThrow('UNSTRUCTURED_API_TOKEN is not defined');
  });

  describe('parseFromFile', () => {
    const mockFilePath = '/tmp/test.pdf';
    const mockApiResponse = [
      { text: 'chunk1', type: 'text', metadata: { page: 1 } },
      { text: 'chunk2', type: 'text', metadata: { page: 2 } },
    ];

    beforeEach(() => {
      jest.spyOn(fs, 'createReadStream').mockReturnValue({} as any);
      jest.spyOn(FormData.prototype, 'append').mockImplementation();
      jest.spyOn(FormData.prototype, 'getHeaders').mockReturnValue({ 'content-type': 'multipart/form-data' });
      jest.spyOn(axios, 'post').mockResolvedValue({ data: mockApiResponse });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should call Unstructured API and return parsed documents', async () => {
      const result = await service.parseFromFile(mockFilePath);

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.unstructuredapp.io/general/v0/general',
        expect.any(FormData),
        { headers: { 'content-type': 'multipart/form-data' } }
      );
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0]).toBeInstanceOf(Document);
      expect(result.chunks[0].pageContent).toBe('chunk1');
      expect(result.metadata).toEqual({
        parser: 'unstructured',
        source: mockFilePath,
        rawResponse: mockApiResponse,
      });
    });

    it('should log uploading file', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.parseFromFile(mockFilePath);
      expect(logSpy).toHaveBeenCalledWith(`Uploading file to Unstructured API: ${mockFilePath}`);
    });
  });

  describe('parseFromFile (real API)', () => {
    const localApiUrl = 'http://localhost:8000/general/v0/general';
    const testFilePath = 'http://metad-oss.oss-cn-shanghai.aliyuncs.com/files/7471f4be-5a94-4e9b-8426-9d12f0ee7459/metad-files-1758244670-741.pdf';

    beforeEach(() => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'UNSTRUCTURED_API_BASE_URL') return 'http://localhost:8000';
        if (key === 'UNSTRUCTURED_API_TOKEN') return undefined;
        return undefined;
      });
      service = new UnstructuredClient(configService);
    });

    it('should parse file using local Unstructured API', async () => {
      // // Make sure the file exists for the test
      // if (!fs.existsSync(testFilePath)) {
      //   fs.writeFileSync(testFilePath, 'dummy pdf content');
      // }

      const result = await service.parseFromFile(testFilePath);

      console.log('Parsed Chunks:', result.chunks);
      console.log('Metadata:', result.metadata);

      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.metadata.parser).toBe('unstructured');
      expect(result.metadata.source).toBe(testFilePath);
      expect(result.metadata.rawResponse).toBeDefined();

    }, 10000); // 10s
  });
});