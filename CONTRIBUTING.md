# Contributing

OPENQLOW is a human-approved business operations system. Speed matters, but safety comes first.

## Before editing

1. Read `AGENTS.md`.
2. Read `COORDINATION.md`.
3. Check `git status -sb`.
4. Keep changes small and easy to review.

## Before commit or push

Run the relevant focused test first, then the shared validation:

```bash
npm run test:line-command
bash scripts/validate-ai-os.sh
```

For broad changes, run:

```bash
npm test
```

## Rules

- Do not commit secrets or private customer data.
- Do not auto-publish SNS or customer replies unless the approved safety gates explicitly allow it.
- Keep business facts in canonical source files.
- Use commit prefixes `codex:` or `claude:`.
- Explain changes in Japanese so JIN can judge quickly.

