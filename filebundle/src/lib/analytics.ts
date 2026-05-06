// PostHog server-side capture from the Worker.
// Fire-and-forget via waitUntil so analytics never blocks a response and
// never breaks a request if PostHog is down or unreachable.

const SCANNER_PATH_PREFIXES = [
  "/wp-admin",
  "/wp-login",
  "/wp-includes",
  "/wp-content",
  "/xmlrpc.php",
  "/.env",
  "/.git",
  "/.aws",
  "/.ssh",
  "/.htaccess",
  "/.DS_Store",
  "/.vscode",
  "/.idea",
  "/phpmyadmin",
  "/pma",
  "/myadmin",
  "/mysql",
  "/admin.php",
  "/administrator",
  "/cpanel",
  "/.well-known/openid",
  "/actuator",
  "/server-status",
  "/server-info",
  "/console",
  "/jenkins",
  "/jolokia",
  "/druid",
  "/solr",
  "/manager/html",
  "/HNAP1",
  "/boaform",
  "/shell",
  "/cgi-bin",
  "/owa",
  "/ecp",
  "/autodiscover",
  "/config.json",
  "/config.yml",
  "/config.yaml",
  "/credentials",
  "/backup.sql",
  "/dump.sql",
  "/database.sql",
  "/id_rsa",
  "/id_dsa",
  "/wallet.dat",
  "/.npmrc",
  "/.pypirc",
  "/.dockercfg",
  "/.docker/config.json",
];

const SCANNER_USER_AGENTS = [
  "sqlmap",
  "nikto",
  "nuclei",
  "masscan",
  "gobuster",
  "dirbuster",
  "ffuf",
  "wpscan",
  "acunetix",
  "nessus",
  "openvas",
  "zaproxy",
  "burpsuite",
  "wfuzz",
  "feroxbuster",
  "nmap",
  "httpx",
  "censys",
  "shodan",
  "zgrab",
  "paloaltonetworks",
];

export type Classification =
  | { suspicious: false }
  | { suspicious: true; reason: string };

export function classifyRequest(pathname: string, userAgent: string): Classification {
  const lp = pathname.toLowerCase();
  const lu = userAgent.toLowerCase();

  if (lp.includes("..") || lp.includes("%2e%2e") || lp.includes("%252e")) {
    return { suspicious: true, reason: "path_traversal" };
  }
  if (/[<>'"`;]|union\s|select\s|script>/i.test(lp)) {
    return { suspicious: true, reason: "injection_chars" };
  }
  for (const prefix of SCANNER_PATH_PREFIXES) {
    if (lp === prefix || lp.startsWith(prefix + "/") || lp.startsWith(prefix + ".") || lp.startsWith(prefix + "?")) {
      return { suspicious: true, reason: `scanner_path:${prefix}` };
    }
  }
  for (const ua of SCANNER_USER_AGENTS) {
    if (lu.includes(ua)) {
      return { suspicious: true, reason: `scanner_ua:${ua}` };
    }
  }
  return { suspicious: false };
}

export interface AnalyticsConfig {
  apiKey?: string;
  host?: string;
}

export interface CaptureProperties {
  [key: string]: unknown;
}

export async function capturePostHog(
  cfg: AnalyticsConfig,
  event: string,
  distinctId: string,
  properties: CaptureProperties,
): Promise<void> {
  if (!cfg.apiKey) return;
  const host = cfg.host?.replace(/\/$/, "") || "https://us.i.posthog.com";
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cfg.apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "filebundle-worker" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // analytics must never break a request
  }
}

interface RuntimeWithCtx {
  ctx?: { waitUntil?: (p: Promise<unknown>) => void };
}

export function getWaitUntil(locals: unknown): (p: Promise<unknown>) => void {
  const runtime = (locals as { runtime?: RuntimeWithCtx } | undefined)?.runtime;
  const wait = runtime?.ctx?.waitUntil;
  if (typeof wait === "function") {
    return (p) => wait.call(runtime!.ctx, p);
  }
  return (p) => {
    void p.catch(() => {});
  };
}
