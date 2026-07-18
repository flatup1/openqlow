---
name: flatup-inquiry-reply
description: Use to draft a LINE, DM, or email reply to a FLATUP inquiry. Do not use to send, confirm a booking, diagnose health, or finalize fees, refunds, leave, or cancellation.
---

# FLATUP Inquiry Reply

## Sources

Read `src/shared/canon.ts`, `docs/ai-os/canon/brand_voice.md`, and the actual incoming message. Check the conversation so known information is not requested twice.

## Procedure

1. Identify the user's question and anxiety.
2. Verify every fee, class, date, and rule against the canon.
3. If availability or a formal decision is unknown, say the staff will confirm.
4. Ask at most one next question.
5. Produce three drafts: polite, standard, short.
6. Label the result as draft-only and list any human confirmation.

Do not invent availability, promises, outcomes, or testimonials.
