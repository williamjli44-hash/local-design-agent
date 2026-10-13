# Working on Local Business Agent

Read README.md, STRATEGY.md, and REVIEW.md before changing this project. The business hypothesis is a $149 fixed-scope mobile website repair for buyers with demonstrated demand. Optimize measurable customer outcomes and contribution per owner hour. Prices and earnings examples are assumptions, not validated performance.

The runtime loads instructions/operator.md and STRATEGY.md on every session. The local LLM does not automatically read AGENTS.md. Keep the compact runtime instructions consistent with the longer strategy.

## Engineering rules

- Use Node.js 24 or newer and `npm ci`. Do not silently download a model; inspect the selected Ollama model and verify tool support.
- Keep runtime databases, drafts, receipts, reports, and local settings outside Git in runtime/ and config.local.json. Never commit customer evidence or credentials.
- Financial entries use integer cents and unique external references. Records are manual bookkeeping, not a verified bank feed. Only owner dashboard/CLI actions can record cash and customer stages; model tools cannot mark a sale or approve a proposal.
- Tool writes must be transactional and retriable without duplicate experiments/drafts. Do not reset state on a normal start or pull. Do not seed fake leads or balances; training/example workflows were deliberately removed.
- Do not claim a connector is implemented when only instructions exist. The shipped tools provide optional Brave web research, source capture, local planning, and drafts; outreach, code execution, payments, and deployment remain separate integrations. The search key belongs in .env, never in model context. Search snippets are unverified candidates.
- Test persistence, duplicate handling, limits, tool contracts, missing-model errors, daily-run behavior, and safe dashboard rendering with `npm test`. External model quality must be tested separately on the target PC; mock results are not model validation.

## Next implementation order

1. Validate one real buyer and owner-reviewed delivery with current tools.
2. Tune or extend the read-only source adapter for the channel yielding actual qualified leads. Preserve observed timestamp, source identity, deduplication, and provenance. Test its authentication separately.
3. Add isolated code workspace/test tools for approved customer repositories. Keep production deployment separate from draft generation.
4. Add receipt reconciliation and measured funnel reporting only when real volume makes it worthwhile.

Do not add speculative infrastructure ahead of these dependencies. Do not introduce live bank/trading access or unsupervised outreach just because "make money" appears in a strategy document. When asked to extend the system, implement the specific authorized integration and record what it can actually do.
