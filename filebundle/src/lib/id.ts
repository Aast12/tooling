import { ADJECTIVES } from "@/words/adjectives";
import { NOUNS } from "@/words/nouns";

export type RandomFn = () => number;

const defaultRng: RandomFn = () => Math.random();

export function generateSlug(rng: RandomFn = defaultRng): string {
  const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(rng() * NOUNS.length)];
  return `${adj}-${noun}`;
}

export type TryInsert = (slug: string) => Promise<boolean>;

export async function generateUniqueSlug(
  tryInsert: TryInsert,
  rng: RandomFn = defaultRng,
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = generateSlug(rng);
    if (await tryInsert(slug)) return slug;
  }
  throw new Error(`Could not generate a unique slug after ${maxAttempts} attempts`);
}
