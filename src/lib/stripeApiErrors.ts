import Stripe from "stripe";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStripeErrorCode(error: Stripe.errors.StripeError) {
  return asString(error.code) || asString(error.type) || "stripe_error";
}

function isStripeResourceMissing(error: Stripe.errors.StripeError) {
  return error.type === "StripeInvalidRequestError" && getStripeErrorCode(error) === "resource_missing";
}

function getSafeStripeMessage(error: Stripe.errors.StripeError, fallbackMessage: string) {
  if (isStripeResourceMissing(error)) {
    return "Stripe billing is not configured correctly for this environment.";
  }
  if (error.type === "StripeAuthenticationError") {
    return "Stripe server credentials are not configured correctly.";
  }
  if (error.type === "StripePermissionError") {
    return "Stripe server credentials do not have permission to create this session.";
  }
  if (error.type === "StripeRateLimitError" || error.type === "StripeConnectionError" || error.type === "StripeAPIError") {
    return "Stripe is temporarily unavailable. Please try again shortly.";
  }
  return fallbackMessage;
}

function getSafeStripeCode(error: Stripe.errors.StripeError) {
  if (isStripeResourceMissing(error)) return "stripe/config-resource-missing";
  if (error.type === "StripeAuthenticationError") return "stripe/authentication-error";
  if (error.type === "StripePermissionError") return "stripe/permission-error";
  if (error.type === "StripeRateLimitError") return "stripe/rate-limited";
  if (error.type === "StripeConnectionError" || error.type === "StripeAPIError") return "stripe/api-error";
  return "stripe/request-error";
}

function getStripeStatus(error: Stripe.errors.StripeError) {
  if (
    error.type === "StripeAuthenticationError" ||
    error.type === "StripePermissionError" ||
    isStripeResourceMissing(error)
  ) {
    return 500;
  }
  if (error.type === "StripeRateLimitError") return 429;
  if (error.type === "StripeConnectionError" || error.type === "StripeAPIError") return 503;
  return 400;
}

export function isStripeApiError(error: unknown): error is Stripe.errors.StripeError {
  return error instanceof Stripe.errors.StripeError;
}

export function createStripeApiErrorResponse(error: Stripe.errors.StripeError, fallbackMessage: string, logLabel: string) {
  console.error(logLabel, {
    type: error.type,
    code: error.code,
    declineCode: error.decline_code,
    statusCode: error.statusCode,
    requestId: error.requestId,
    message: error.message,
  });

  return Response.json(
    {
      error: getSafeStripeMessage(error, fallbackMessage),
      code: getSafeStripeCode(error),
      stripeRequestId: error.requestId || undefined,
    },
    { status: getStripeStatus(error) }
  );
}
