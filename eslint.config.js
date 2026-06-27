import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 日本語コメント/文字列/正規表現クラス内の全角スペース(U+3000)は
    // このプロジェクトでは正規の入力文字（OPENQLOWが正規化対象として扱う）であり、
    // バグではない。コード本体（識別子の外）に紛れ込んだ不可視文字の検出に絞る。
    rules: {
      "no-irregular-whitespace": ["error", {
        skipComments: true,
        skipStrings: true,
        skipTemplates: true,
        skipRegExps: true,
      }],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}", "eslint.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // LINE送信などのPromiseを握り潰したまま放置するバグを検出する。型情報が必要なため
      // src/**/*.ts のみ（project指定）に絞って有効化する。
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
);
