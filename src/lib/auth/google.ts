/**
 * Google OAuth credentials from the environment. Both naming styles are accepted (`AUTH_GOOGLE_*`
 * is NextAuth's own convention, `GOOGLE_*` is what Google Cloud calls them). Google sign-in is
 * switched on only when both values exist, so a deployment without them simply has no button.
 */
export function googleCredentials(env: NodeJS.ProcessEnv = process.env) {
  const clientId = (env.AUTH_GOOGLE_ID || env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (env.AUTH_GOOGLE_SECRET || env.GOOGLE_CLIENT_SECRET || "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const isGoogleEnabled = () => googleCredentials() !== null;

/** Messages for the `?error=` codes the Google flow redirects back to the sign-in page with. */
export const GOOGLE_ERRORS: Record<string, string> = {
  "google-unverified": "Google didn't confirm that email address, so we couldn't sign you in with it.",
  "google-not-allowed":
    "That Google account can't sign in this way. Operators sign in with their password, and suspended accounts are blocked.",
  AccessDenied: "Google sign-in was cancelled or not allowed.",
  OAuthCallbackError: "Google sign-in didn't complete. Please try again.",
  Configuration: "Google sign-in isn't set up correctly. Please use your email and password.",
};
