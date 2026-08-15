/**
 * The vocabulary of the /enhance command, shared by the composer that parses it and
 * the server that runs it. Four jobs, because an e-commerce product shot, a thumbnail
 * hero and a layerable cutout want genuinely opposite treatments and a single
 * "make it better" prompt does all three badly.
 */
export const ENHANCE_MODES = ["auto", "product", "thumbnail", "cutout"] as const;

export type EnhanceMode = (typeof ENHANCE_MODES)[number];

export const MODE_SUMMARY: Record<EnhanceMode, string> = {
  auto: "Clean background, studio light, subject untouched",
  product: "Seamless studio hero, label and packaging preserved",
  thumbnail: "Punchy 16:9 hero with the top third left clear for a headline",
  cutout: "Subject on transparency, ready to layer over the design",
};

export function isEnhanceMode(value: string): value is EnhanceMode {
  return (ENHANCE_MODES as readonly string[]).includes(value);
}

export type EnhanceCommand = { mode: EnhanceMode; instruction: string };

/**
 * Read "/enhance product on wet slate" as a mode plus free direction.
 *
 * Returns null for anything that is not the command, which is how the composer
 * decides between running an enhancement and sending a design turn.
 */
export function parseEnhanceCommand(input: string): EnhanceCommand | null {
  const match = input.trim().match(/^\/enhance\b\s*([\s\S]*)$/i);
  if (!match) return null;

  const rest = (match[1] ?? "").trim();
  const [first = "", ...tail] = rest.split(/\s+/);
  const candidate = first.toLowerCase();

  if (isEnhanceMode(candidate)) {
    return { mode: candidate, instruction: tail.join(" ").trim() };
  }

  // No mode word means the rest is all direction, run against the general treatment.
  return { mode: "auto", instruction: rest };
}
