/* An error that is safe to show to the caller. Anything else is reported as a plain 500. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const invalid = (message) => new AppError(400, 'INVALID_INPUT', message);
