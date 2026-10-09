import { createRequire } from 'node:module';
const require=createRequire(process.env.TOS_LINT_TOOLS ? process.env.TOS_LINT_TOOLS+'/package.json' : import.meta.url);
const tseslint=require('typescript-eslint');
export default [
  {ignores:['node_modules/**','out/**','out-private-pages/**','.next/**']},
  ...tseslint.configs.recommended,
  {files:['**/*.ts','**/*.tsx'],rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}},
];
