// src/middleware/error.js (ESM)
// Centralized error handling middleware with standardized responses

import { config } from '../config/index.js';
import { AppError, isOperationalError, wrapError } from '../utils/errors.js';
import { sendError } from '../utils/responses.js';
import { log } from '../utils/log.js';

/**
 * Enhanced error handler middleware with proper error classification and logging
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
  // Skip if response was already sent
  if (res.headersSent) {
    return next(err);
  }

  // Wrap unknown errors in AppError for consistent handling
  const error = err instanceof AppError ? err : wrapError(err);
  
  // Log error details for debugging
  logError(error, req);
  
  // Send appropriate response based on error type
  sendErrorResponse(error, req, res);
}

/**
 * Log error with appropriate level and context
 * @param {AppError} error - Error to log
 * @param {Object} req - Express request object
 */
function logError(error, req) {
  const context = {
    errorType: error.constructor.name,
    errorCode: error.errorCode,
    statusCode: error.statusCode,
    message: error.message,
    requestId: req?.id,
    method: req?.method,
    url: req?.url,
    userAgent: req?.get('User-Agent'),
    ip: req?.ip
  };

  // Add stack trace in development
  if (config.NODE_ENV !== 'production') {
    context.stack = error.stack;
  }

  // Add error details if available
  if (error.details) {
    context.details = error.details;
  }

  // Log at appropriate level based on error type
  if (isOperationalError(error)) {
    // Expected errors (validation, not found, etc.) - log as warnings
    if (error.statusCode >= 400 && error.statusCode < 500) {
      log.warn(context, 'Client error occurred');
    } else {
      log.error(context, 'Operational error occurred');
    }
  } else {
    // Unexpected errors - log as errors
    log.error(context, 'Unexpected error occurred');
  }
}

/**
 * Send standardized error response to client
 * @param {AppError} error - Error to send
 * @param {Object} req - Express request object  
 * @param {Object} res - Express response object
 */
function sendErrorResponse(error, req, res) {
  // Use the error's toJSON method if available (AppError instances)
  if (typeof error.toJSON === 'function') {
    const response = error.toJSON();
    
    // Add request ID for debugging
    if (req?.id) {
      response.requestId = req.id;
    }
    
    // Add stack trace in non-production environments
    if (config.NODE_ENV !== 'production' && error.stack) {
      response.stack = error.stack;
    }
    
    return res.status(error.statusCode).json(response);
  }
  
  // Fallback to generic error response
  sendError(res, error, error.statusCode || 500);
}

/**
 * Async error handler wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function notFoundHandler(req, res) {
  const response = {
    ok: false,
    error: {
      message: 'Not Found',
      code: 'NOT_FOUND_ERROR',
      type: 'NotFoundError',
      details: { path: req.path, method: req.method },
      timestamp: new Date().toISOString()
    }
  };
  
  if (req.id) {
    response.requestId = req.id;
  }
  
  res.status(404).json(response);
}

export default { errorHandler, asyncHandler, notFoundHandler };
