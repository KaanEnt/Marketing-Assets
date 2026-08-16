# Limits and spend

This app is public, has no login, and every interesting thing it does costs
money. The controls live in [`lib/limits.ts`](../lib/limits.ts) and are enforced
by [`@kaanent/limiter`](https://github.com/KaanEnt/Limiter), which was written
here and then extracted so the next product does not repeat it.

## What things cost

Two of the four paid calls are priced exactly, because Gemini bills image output
per picture rather than per token. The design agent is the uncertain one: it is a
full Cursor agent harness rather than a single completion.

| Route | Provider | Unit cost | Certainty |
| --- | --- | --- | --- |
| `/api/generate` | Cursor, `grok-4.6` | ~$0.56 per turn, up to 6 turns | **Estimated.** Napkin arithmetic on published rates |
| `/api/image` | Gemini 3 Pro Image | **$0.134** per picture | Exact, published flat rate |
| `/api/enhance` | Gemini 3 Pro Image | **$0.134** per attempt, up to 2 | Exact |
| `/api/describe` | Gemini 3.5 Flash Lite | ~$0.0005 | Exact enough to ignore |

Published rates used: Cursor `grok-4.6` at $2/$6 per million in/out with $0.50
cache read; `gpt-5.6-sol` at $5/$30. Gemini 3 Pro Image at $0.134 per 1K or 2K
picture, $0.24 at 4K. Flash Lite at $0.30/$2.50 per million.

## The arithmetic that matters

A completed asset is roughly three generate turns, one enhance, and two slot
fills:

```
3 x $0.56  = $1.68
1 x $0.134 = $0.134
2 x $0.134 = $0.268
             -------
             ~$2.08 per asset
```

At $100 a month that is **about 48 assets, one and a half a day, worldwide**.

No arrangement of per-caller quotas changes that number. Only a cheaper call, a
larger budget, or visitors spending their own keys does. The limits below are
therefore set to be genuinely useful for one person rather than thin across
hundreds: a demo that works properly for the first thirty people beats one that
half works for five hundred.

## The policy

| Operation | Reserved | Tier | Per day | Per week |
| --- | --- | --- | --- | --- |
| `design.generate` | $1.00 | expensive | 8 | 20 |
| `image.generate` | $0.14 | expensive | 16 | 40 |
| `image.enhance` | $0.30 | expensive | 8 | 20 |
| `image.describe` | $0.002 | cheap | 40 | 120 |

Limits are per identity. The address tier gets 3x these numbers, because one
address is often one office or one carrier NAT.

`design.generate` is reserved at $1.00 rather than at the $6.80 six-turn worst
case. A reservation that large would let a dozen concurrent callers trip the
budget on work that settles for a fraction of it, and settle corrects an
over-estimate within seconds either way.

## What happens as the budget runs down

| Spend | Behaviour |
| --- | --- |
| under $80 | Everything works |
| $80 to $100 | Expensive operations refuse with 503. `describe` still answers. The generate route also stops escalating to the rescue model |
| over $100 | Everything paid refuses until the calendar month rolls over |

The degraded flag is not only a gate. `app/api/generate/route.ts` reads it and
declines to start a rescue pass, which is the single most expensive decision that
route can take.

## Who counts as one caller

There is no auth here, so there is no verified session and **no `userId` is ever
passed to `guard`**. A user id read out of a header or a body is not an identity,
it is a bucket the caller mints at will.

Two tiers carry the quota, and both are enforced:

1. **Signed cookie.** HMAC'd with `LIMITER_SECRET`, so it cannot be forged.
2. **Address.** IPv6 collapsed to the /64 a subscriber actually holds.

Clearing the cookie earns a new cookie bucket and the same address bucket. That
is the point of layering them rather than falling back.

If this app ever grows sessions, passing the verified id to `guard` adds the
third tier and nothing else changes.

## Environment

The repo's `.gitignore` keeps `.env.example` unignored deliberately. Create it
from this table if you want one in-tree; secrets themselves resolve through the
Keychain broker in development.

| Variable | Required | Effect |
| --- | --- | --- |
| `LIMITER_SECRET` | **in production** | Signs the anonymous cookie. Without it the cookie tier disables itself and the app enforces less than the policy claims, so a production boot fails rather than degrading quietly |
| `LIMITER_REDIS_URL` / `LIMITER_REDIS_TOKEN` | **on Vercel** | Shared counters. Also reads the `UPSTASH_REDIS_REST_*` and `KV_REST_API_*` names |
| `LIMITER_MONTH_USD` | no | Moves the ceiling without a deploy. Defaults to the 100 in `lib/limits.ts` |
| `LIMITER_PREFIX` | no | Key namespace, if one Redis is shared with another product |
| `ASSETS_RESCUE_ENABLED` | no | `false` disables the second-model rescue outright. Largest single cost lever in the app |

Without Redis the limiter falls back to an in-process map. On Vercel that means
per-instance counters that reset on cold start, so the effective limit is not
smaller, it is unknown. It logs a warning rather than failing, but the budget
would not actually hold.

## Reading the numbers

Every settled call logs what it estimated against what it cost:

```
[limits] design.generate estimated $1.0000, settled $0.5512
[limits] image.generate estimated $0.1400, settled $0.1360
```

Cursor is settled from `Agent.getUsage()` on `rawCostCents`, not `chargedCents`.
Charged is zero for usage inside an included plan allowance, so a budget tracking
it would read $0.00 all month and then jump precisely when the cap was supposed
to have already fired.

**The estimates in `lib/limits.ts` are guesses until this log replaces them.**
Read a week of it, then set `estimateUsd` from the median and the limits from
what the month can actually afford.

Current spend at any moment:

```ts
import { limiter } from "@/lib/limits";
const { spentUsd, budgetUsd, fraction, degraded } = await limiter.snapshot();
```

## Cost levers, in order of payoff

1. **The agent harness.** `Agent.create` spins up a full Cursor agent, with its
   own system prompt and tool loop, for what is a single-completion task. If that
   is where the per-turn cost is going, replacing it is worth more than every
   other item here combined.
2. **The rescue pass.** Three more turns on a model costing five times as much.
   Already vetoed when degraded; `ASSETS_RESCUE_ENABLED=false` removes it.
3. **Slot count.** Capped at three per document in
   `components/studio/use-slot-filling.ts`, biggest slots first. Was uncapped,
   and the contract permits a document that declares eight.
4. **Bring your own key.** The structural answer for an open source app: the
   budget funds a capped demo, and anyone doing real work spends their own money.
   Not built. It would need key intake, per-request key plumbing, and a story for
   handling someone else's credentials.

## Reusing this elsewhere

The limiter is a standalone package, not app code. Another product needs:

```ts
import { createLimiter } from "@kaanent/limiter";
import { guard } from "@kaanent/limiter/next";   // or /node for Express

export const limiter = createLimiter({ policy: { budget: {...}, operations: {...} } });
```

Its README covers the adapters, the storage interface, and the provider-agnostic
`tokenCostUsd` for anything that is not Cursor or Gemini.
