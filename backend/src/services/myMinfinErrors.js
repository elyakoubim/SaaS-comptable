class MyMinfinError extends Error {
  constructor(message, { status, instance, raw } = {}) {
    super(message);
    this.name = "MyMinfinError";
    this.status = status;
    this.instance = instance;
    this.raw = raw;
  }
}

class RateLimitError extends MyMinfinError {
  constructor(retryAfterSeconds, opts = {}) {
    super(`Rate limit exceeded, retry after ${retryAfterSeconds}s`, opts);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class AuthError extends MyMinfinError {
  constructor(message, { retryable = false, ...opts } = {}) {
    super(message, opts);
    this.name = "AuthError";
    this.retryable = Boolean(retryable);
  }
}

class ApiError extends MyMinfinError {
  constructor(message, opts = {}) {
    super(message, opts);
    this.name = "ApiError";
  }
}

export { MyMinfinError, RateLimitError, AuthError, ApiError };
