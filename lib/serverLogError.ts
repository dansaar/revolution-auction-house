// Server-only: write an entry to the in-app ErrorLog (a backstop to Sentry).
// Calls the secret-gated logError AppSync mutation via the public API key, the
// same pattern the EasyPost webhook route uses. Never throws — logging must not
// break the caller.
import outputs from "@/amplify_outputs.json";

export async function serverLogError(params: {
  source: string;
  message: string;
  context?: unknown;
  severity?: "ERROR" | "WARN" | "INFO";
  url?: string;
}): Promise<void> {
  try {
    const apiUrl = (outputs as any).data?.url as string;
    const apiKey = (outputs as any).data?.api_key as string;
    // Amplify's Next.js runtime only exposes AMPLIFY_-prefixed env vars, so the
    // plain ERROR_LOG_SECRET/EASYPOST_WEBHOOK_SECRET are undefined here — include
    // the AMPLIFY_ fallback or logging silently no-ops.
    const secret =
      process.env.ERROR_LOG_SECRET ||
      process.env.AMPLIFY_EASYPOST_WEBHOOK_SECRET ||
      process.env.EASYPOST_WEBHOOK_SECRET ||
      "";
    if (!apiUrl || !apiKey || !secret) return;

    const context =
      params.context == null
        ? ""
        : typeof params.context === "string"
          ? params.context
          : (() => {
              try {
                return JSON.stringify(params.context);
              } catch {
                return String(params.context);
              }
            })();

    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: `mutation LogError($source: String!, $message: String!, $context: String, $severity: String, $url: String, $secret: String!) {
          logError(source: $source, message: $message, context: $context, severity: $severity, url: $url, secret: $secret) { ok }
        }`,
        variables: {
          source: params.source,
          message: params.message,
          context,
          severity: params.severity || "ERROR",
          url: params.url || "",
          secret,
        },
      }),
    });
  } catch {
    // Logging is best-effort; swallow failures.
  }
}
