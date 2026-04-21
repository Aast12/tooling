import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const SUPPORTED_LANGS = [
  "text", "bash", "shell", "json", "yaml", "toml", "ini",
  "javascript", "typescript", "tsx", "jsx", "html", "css", "markdown",
  "python", "go", "rust", "sql", "diff", "dockerfile",
] as const;

export type SupportedLang = typeof SUPPORTED_LANGS[number];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark"],
      langs: SUPPORTED_LANGS as unknown as string[],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

function coerceLang(lang: string | null | undefined): SupportedLang {
  const cleaned = (lang ?? "").toLowerCase().trim();
  return (SUPPORTED_LANGS as readonly string[]).includes(cleaned)
    ? (cleaned as SupportedLang)
    : "text";
}

export async function highlight(code: string, lang: string | null | undefined): Promise<string> {
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang: coerceLang(lang), theme: "github-dark" });
}
