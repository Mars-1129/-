import { Test, TestingModule } from '@nestjs/testing';
import { SynonymService } from '../../services/synonym/synonym.service';

describe('SynonymService', () => {
  let service: SynonymService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SynonymService],
    }).compile();

    service = module.get<SynonymService>(SynonymService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('expandQuery', () => {
    it('should expand "close-up" to include synonyms', () => {
      const result = service.expandQuery('close-up');
      expect(result).toContain('close-up');
      expect(result).toContain('macro_shot');
      expect(result).toContain('detail_shot');
      expect(result).toContain('zooming_in');
    });

    it('should expand "wide_shot" to include synonyms', () => {
      const result = service.expandQuery('wide_shot');
      expect(result).toContain('wide_shot');
      expect(result).toContain('full_shot');
      expect(result).toContain('establishing_shot');
    });

    it('should return original word if no synonyms found', () => {
      const result = service.expandQuery('nonexistent_term_test_123');
      expect(result).toEqual(['nonexistent_term_test_123']);
    });

    it('should handle empty string', () => {
      const result = service.expandQuery('');
      expect(result).toEqual([]);
    });
  });

  describe('expandKeywords', () => {
    it('should expand multiple keywords', () => {
      const result = service.expandKeywords(['close-up', 'wide_shot']);
      expect(result).toContain('close-up');
      expect(result).toContain('macro_shot');
      expect(result).toContain('wide_shot');
      expect(result).toContain('full_shot');
    });

    it('should return unique terms', () => {
      const result = service.expandKeywords(['close-up']);
      const unique = [...new Set(result)];
      expect(result.length).toEqual(unique.length);
    });
  });

  describe('expandTags', () => {
    it('should expand tags', () => {
      const result = service.expandTags(['macro_shot']);
      expect(result).toContain('macro_shot');
      expect(result).toContain('close-up');
    });
  });
});
