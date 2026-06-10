import { config } from 'dotenv';

config();

// Mock uuid module to avoid ESM issues
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
  v1: () => 'test-uuid-v1-' + Math.random().toString(36).substring(7),
  v7: () => 'test-uuid-v7-' + Math.random().toString(36).substring(7),
  validate: () => true,
  version: () => 4,
}));

beforeAll(async () => {
  console.log('Test environment setup');
});

afterAll(async () => {
  console.log('Test environment teardown');
});

beforeEach(() => {
  jest.clearAllMocks();
});
