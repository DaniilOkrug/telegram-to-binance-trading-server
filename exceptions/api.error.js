module.exports = class ApiError extends Error {
  status;
  errors;

  constructor(status, message, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }

  static UnauthorizedError() {
    return new ApiError(401, "Пользователь не авторизован");
  }

  static BadRequest(message, errors = []) {
    return new ApiError(400, message, errors);
  }

  static NotFound(message, errors = []) {
    return new ApiError(404, message, errors);
  }

  static Conflict(message) {
    return new ApiError(409, message);
  }

  static BadGateway(message) {
    return new ApiError(502, message);
  }
};
