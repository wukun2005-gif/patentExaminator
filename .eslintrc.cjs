module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true }
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  settings: {
    react: { version: "detect" }
  },
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  rules: {
    "no-undef": "off",
    "react/react-in-jsx-scope": "off"
  },
  overrides: [
    {
      files: ["server/**/*.ts"],
      env: { browser: false, node: true }
    },
    {
      files: ["*.cjs"],
      env: { node: true },
      parserOptions: { sourceType: "script" }
    }
  ],
  ignorePatterns: ["node_modules", "dist", "*.config.ts", "*.config.js"]
};
