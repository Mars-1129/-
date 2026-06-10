// Manual mock for uuid ESM module
const v4 = () => 'test-uuid-' + Math.random().toString(36).substring(7);
const v1 = () => 'test-uuid-v1-' + Math.random().toString(36).substring(7);
const v7 = () => 'test-uuid-v7-' + Math.random().toString(36).substring(7);
const validate = () => true;
const version = () => 4;

module.exports = {
  v4,
  v1,
  v7,
  validate,
  version,
  default: v4,
  __esModule: true,
};
