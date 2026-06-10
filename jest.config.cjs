module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@tikstream/shared-types$': '<rootDir>/shared/index.ts',
    '^@nestjs/prisma$': '<rootDir>/packages/nestjs-prisma-shim/src/index.ts',
  },
};
