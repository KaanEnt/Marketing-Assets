import "server-only";

import { createLimiter } from "@kaanent/limiter";

/**
 * What this app costs to run, and what that buys.
 *
 * Two of the four paid calls are priced exactly. Gemini bills image output per
 * picture rather than per token, so a slot fill is $0.134 and an enhance is the
 * same again per attempt, known before either is requested. The design agent is
 * the uncertain one: it is a full Cursor agent harness rather than a single
 * completion, and until real getUsage figures land the estimate below is napkin
 * arithmetic on published rates.
 *
 * The arithmetic worth staring at. At roughly $2 for a completed asset, three
 * generate turns plus an enhance plus two slot fills, $100 a month buys around
 * fifty assets. That is one and a half a day, worldwide, for an app with no
 * login. No arrangement of per-caller quotas changes that number; only a cheaper
 * call, a larger budget, or visitors spending their own keys does.
 *
 * So the limits below are set to be genuinely useful for one person rather than
 * thinly fair across hundreds. A demo that works properly for the first thirty
 * people beats one that half works for five hundred. The budget is what stops
 * the month, and it stops it honestly.
 */
export const limiter = createLimiter({
  policy: {
    budget: { monthUsd: 100, degradeAt: 0.8 },
    timezone: "America/New_York",

    operations: {
      /**
       * Reserved well above the single-turn estimate because one message can
       * legally spend two correction rounds. Not reserved at the six-turn worst
       * case: a reservation that large would let a dozen concurrent callers trip
       * the budget on work that settles for a fraction of it, and settle
       * corrects an over-estimate within seconds either way.
       */
      "design.generate": { estimateUsd: 1.0, tier: "expensive", limits: { day: 8, week: 20 } },

      /** Exactly $0.134 at 1K or 2K, with room for the prompt tokens alongside. */
      "image.generate": { estimateUsd: 0.14, tier: "expensive", limits: { day: 16, week: 40 } },

      /** Two attempts at $0.134 plus the caption that follows every enhance. */
      "image.enhance": { estimateUsd: 0.3, tier: "expensive", limits: { day: 8, week: 20 } },

      /**
       * Flash Lite on one sentence, so the cost is noise. It is limited anyway
       * because the route accepts an arbitrary image and would otherwise be a
       * free vision API for anyone who found it.
       */
      "image.describe": { estimateUsd: 0.002, tier: "cheap", limits: { day: 40, week: 120 } },
    },
  },

  onEvent: (event) => {
    if (event.type === "deny") {
      console.warn(`[limits] denied ${event.operation}: ${event.denial.detail}`);
      return;
    }
    if (event.type === "settle") {
      // The line that turns the estimates above into measurements. Read a week
      // of these before trusting any of the numbers in this file.
      console.info(
        `[limits] ${event.operation} estimated $${event.estimateUsd.toFixed(4)}, ` +
          `settled $${event.actualUsd.toFixed(4)}`,
      );
    }
  },
});

/**
 * There is deliberately no userId anywhere in this app's guard calls.
 *
 * It has no auth, so there is no verified session to take one from, and a user
 * id read out of a header or a body is not an identity: it is a bucket the
 * caller mints at will. Two tiers therefore carry the whole per-caller quota
 * here, the signed cookie and the address, and the address tier is what makes
 * clearing the cookie unprofitable. A product with real sessions passes its
 * verified id to guard and gets the third tier for free.
 */

