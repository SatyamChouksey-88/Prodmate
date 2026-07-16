/**
 * Client-side Gemini/ADO/Jira integrations are disabled by default.
 * Enable only for local demos via .env.local (gitignored):
 *   VITE_ALLOW_INSECURE_CLIENT_LLM=true
 *   VITE_GEMINI_API_KEY=...
 *
 * Hard rule: the flag can ONLY enable integrations when import.meta.env.DEV is true.
 * A production/preview build never enables client secrets — even if an env file
 * accidentally sets VITE_ALLOW_INSECURE_CLIENT_LLM=true.
 */
export function isInsecureClientIntegrationsEnabled(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_ALLOW_INSECURE_CLIENT_LLM === 'true'
  );
}

export const CLIENT_INTEGRATIONS_DISABLED_MESSAGE =
  'Client-side AI and tracker integrations are disabled in this build. ' +
  'This app is not safe for shared or production use with secrets in the browser. ' +
  'A backend (Phase 3) will own the Gemini key and tracker credentials. ' +
  'For local demos only (npm run dev), set VITE_ALLOW_INSECURE_CLIENT_LLM=true and VITE_GEMINI_API_KEY in .env.local.';

export function assertInsecureClientIntegrationsAllowed(action: string): void {
  if (!isInsecureClientIntegrationsEnabled()) {
    throw new Error(`${action} blocked. ${CLIENT_INTEGRATIONS_DISABLED_MESSAGE}`);
  }
}
