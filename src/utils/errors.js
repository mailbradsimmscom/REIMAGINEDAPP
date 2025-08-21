// src/utils/errors.js
// Custom error classes for unified error handling across the application

/**
 * Base application error class with common properties
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // Marks this as an expected/handled error
    this.timestamp = new Date().toISOString();
    
    // Maintain proper stack trace for debugging
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      ok: false,
      error: {
        message: this.message,
        code: this.errorCode,
        type: this.name,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends AppError {
  constructor(message, field = null, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.field = field;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.field) {
      json.error.field = this.field;
    }
    return json;
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  constructor(message, operation = null, table = null, originalError = null) {
    super(message, 500, 'DATABASE_ERROR', { operation, table });
    this.operation = operation;
    this.table = table;
    this.originalError = originalError;
  }

  toJSON() {
    const json = super.toJSON();
    json.error.details = {
      operation: this.operation,
      table: this.table
    };
    return json;
  }
}

/**
 * AI service generation error
 */
export class AIGenerationError extends AppError {
  constructor(message, provider = null, model = null, originalError = null) {
    super(message, 503, 'AI_GENERATION_ERROR', { provider, model });
    this.provider = provider;
    this.model = model;
    this.originalError = originalError;
  }

  toJSON() {
    const json = super.toJSON();
    json.error.details = {
      provider: this.provider,
      model: this.model
    };
    return json;
  }
}

/**
 * Authentication/Authorization error
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', resource = null, action = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', { resource, action });
    this.resource = resource;
    this.action = action;
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(message, resource = null, id = null) {
    super(message, 404, 'NOT_FOUND_ERROR', { resource, id });
    this.resource = resource;
    this.id = id;
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', limit = null, resetTime = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', { limit, resetTime });
    this.limit = limit;
    this.resetTime = resetTime;
  }
}

/**
 * External service error (APIs, etc.)
 */
export class ExternalServiceError extends AppError {
  constructor(message, service = null, statusCode = 502, originalError = null) {
    super(message, statusCode, 'EXTERNAL_SERVICE_ERROR', { service });
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AppError {
  constructor(message, configKey = null, expectedValue = null) {
    super(message, 500, 'CONFIGURATION_ERROR', { configKey, expectedValue });
    this.configKey = configKey;
    this.expectedValue = expectedValue;
  }
}

/**
 * Check if error is an operational (expected) error
 */
export function isOperationalError(error) {
  return error instanceof AppError && error.isOperational;
}

/**
 * Helper function to wrap unknown errors in AppError
 */
export function wrapError(error, message = null) {
  if (error instanceof AppError) {
    return error;
  }
  
  return new AppError(
    message || error.message || 'An unexpected error occurred',
    500,
    'UNKNOWN_ERROR',
    { originalMessage: error.message, originalStack: error.stack }
  );
}

export default {
  AppError,
  ValidationError,
  DatabaseError,
  AIGenerationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ExternalServiceError,
  ConfigurationError,
  isOperationalError,
  wrapError
};