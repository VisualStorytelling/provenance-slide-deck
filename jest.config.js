module.exports = {
  transform: {
    ".(ts|tsx)": "../node_modules/ts-jest/preprocessor.js"
  },
  testRegex: "(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$",
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js"
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/test/"
  ],
  coverageThreshold: {
    global: {
      branches: 90,
        functions: 95,
        lines: 95,
        statements: 95
    }
  },
  collectCoverage: true,
  globalSetup: "<rootDir>/test/global_setup_hook.js",
};