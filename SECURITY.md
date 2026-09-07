# Security Policy

OPENQLOW handles business operations, LINE messages, CRM notes, and generated drafts for FLATUP GYM.

## Do not commit

- API keys, tokens, cookies, or `.env` files
- LINE user IDs or customer personal information
- Obsidian vault data that contains private notes
- Production logs, generated CRM logs, or exported customer records

Use `.env.example` for variable names only.

## If a secret leaks

1. Rotate the leaked token immediately.
2. Remove the secret from the working tree.
3. Tell JIN what leaked, where it appeared, and what was rotated.
4. Run the validation suite before pushing:

```bash
bash scripts/validate-ai-os.sh
npm test
```

## Supported branch

Security fixes should target `main`.

