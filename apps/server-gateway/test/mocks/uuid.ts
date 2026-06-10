// Mock uuid module for Jest tests
module.exports = {
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
  v1: () => 'test-uuid-v1-' + Math.random().toString(36).substring(7),
  v7: () => 'test-uuid-v7-' + Math.random().toString(36).substring(7),
  validate: () => true,
  version: () => 4,
  MAX: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
};