/*
 * Typed errors shared by all providers.
 * `kind` drives the message the UI shows; raw HTTP text never reaches the
 * user unfiltered.
 */

export const ERROR_KINDS = {
  AUTH: "auth",
  RATE_LIMIT: "rate-limit",
  SERVER: "server",
  NETWORK: "network",
  PARSE: "parse",
  CANCELLED: "cancelled",
  REQUEST: "request",
  UNKNOWN: "unknown"
};

export class ProviderError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

export function httpErrorKind(status) {
  if (status === 401 || status === 403) return ERROR_KINDS.AUTH;
  if (status === 429) return ERROR_KINDS.RATE_LIMIT;
  if (status >= 500) return ERROR_KINDS.SERVER;
  return ERROR_KINDS.REQUEST;
}

export function statusMessage(status, detail) {
  switch (status) {
    case 400:
      return `Bad request${detail ? " — " + detail : "."}`;
    case 401:
    case 403:
      return "API key was rejected. Double-check it in Settings.";
    case 404:
      return `Model not found${detail ? " — " + detail : "."}`;
    case 429:
      return "Rate limited by the provider. Wait a moment and try again.";
    default:
      if (status >= 500)
        return `Provider server error (${status}). Try again or switch models.`;
      return `Request failed (${status})${detail ? " — " + detail : "."}`;
  }
}

/* Map any thrown value to a short, human sentence. */
export function friendlyError(err) {
  if (err instanceof ProviderError) {
    switch (err.kind) {
      case ERROR_KINDS.CANCELLED:
        return "Analysis cancelled.";
      case ERROR_KINDS.NETWORK:
        return "Couldn't reach the provider. Check your connection.";
      case ERROR_KINDS.PARSE:
        return err.message || "The model's response couldn't be parsed. Try again.";
      default:
        return err.message || "Something went wrong.";
    }
  }
  if (err?.name === "AbortError") return "Analysis cancelled.";
  return err?.message || "Something went wrong.";
}
