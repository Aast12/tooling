import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Canonical languages we ask Shiki to load.
const LOADED_LANGS = [
  "text", "bash", "shell", "json", "yaml", "toml", "ini",
  "javascript", "typescript", "tsx", "jsx", "html", "css", "markdown",
  "python", "go", "rust", "sql", "diff", "dockerfile",
] as const;

export type SupportedLang = typeof LOADED_LANGS[number];

// Common shorthand → canonical. Anything not in this map (and not in
// LOADED_LANGS) falls back to plain "text" so the page still renders.
const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  rs: "rust",
  yml: "yaml",
  sh: "bash",
  zsh: "bash",
  md: "markdown",
  htm: "html",
  docker: "dockerfile",
  plaintext: "text",
  txt: "text",
};

// Visible options for the language picker — canonical names + aliases.
// Sorted for predictable display, with "text" floated to the top.
export const LANG_OPTIONS: readonly string[] = (() => {
  const set = new Set<string>([...LOADED_LANGS, ...Object.keys(ALIASES)]);
  set.delete("text");
  return ["text", ...Array.from(set).sort()];
})();

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark"],
      langs: LOADED_LANGS as unknown as string[],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export function coerceLang(lang: string | null | undefined): SupportedLang {
  const cleaned = (lang ?? "").toLowerCase().trim();
  if (!cleaned) return "text";
  if ((LOADED_LANGS as readonly string[]).includes(cleaned)) {
    return cleaned as SupportedLang;
  }
  const aliased = ALIASES[cleaned];
  if (aliased && (LOADED_LANGS as readonly string[]).includes(aliased)) {
    return aliased as SupportedLang;
  }
  return "text";
}

export async function highlight(code: string, lang: string | null | undefined): Promise<string> {
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang: coerceLang(lang), theme: "github-dark" });
}
