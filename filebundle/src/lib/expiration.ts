export const EXPIRATION_CHOICES = ["1h", "6h", "24h", "7d"] as const;
export type Expiration = typeof EXPIRATION_CHOICES[number];

const MAP: Record<Expiration, number> = {
  "1h": 3600,
  "6h": 6 * 3600,
  "24h": 24 * 3600,
  "7d": 7 * 24 * 3600,
};

export function isValidExpiration(value: string): value is Expiration {
  return (EXPIRATION_CHOICES as readonly string[]).includes(value);
}

export function expirationToSeconds(value: Expiration): number {
  return MAP[value];
}

export const DEFAULT_EXPIRATION: Expiration = "1h";
