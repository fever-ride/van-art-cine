export class AuthError extends Error {
  constructor(message, code = 'AUTH_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}