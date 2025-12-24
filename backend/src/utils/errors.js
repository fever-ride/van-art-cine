export class AuthError extends Error {
  constructor(message, code = 'AUTH_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found', code = 'NOT_FOUND', status = 404) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class WatchlistError extends Error {
  constructor(message, code = 'WATCHLIST_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}