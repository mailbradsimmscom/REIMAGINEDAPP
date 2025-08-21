// src/utils/responses.js
// Standardized API response helpers for consistent client experience

/**
 * Standard success response format
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {Object} meta - Optional metadata (pagination, etc.)
 * @returns {Object} Standardized success response
 */
export function createSuccessResponse(data = null, message = null, meta = null) {
  const response = {
    ok: true,
    data,
    timestamp: new Date().toISOString()
  };
  
  if (message) {
    response.message = message;
  }
  
  if (meta) {
    response.meta = meta;
  }
  
  return response;
}

/**
 * Standard error response format
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {string} type - Error type
 * @param {*} details - Additional error details
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Standardized error response
 */
export function createErrorResponse(message, code = null, type = 'ERROR', details = null, statusCode = 500) {
  return {
    ok: false,
    error: {
      message,
      code,
      type,
      details,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Create validation error response
 * @param {string} message - Validation error message
 * @param {string} field - Field that failed validation
 * @param {*} details - Additional validation details
 * @returns {Object} Validation error response
 */
export function createValidationErrorResponse(message, field = null, details = null) {
  const response = createErrorResponse(message, 'VALIDATION_ERROR', 'ValidationError', details, 400);
  if (field) {
    response.error.field = field;
  }
  return response;
}

/**
 * Express response helper for success
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {Object} meta - Optional metadata
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export function sendSuccess(res, data = null, message = null, meta = null, statusCode = 200) {
  const response = createSuccessResponse(data, message, meta);
  res.status(statusCode).json(response);
}

/**
 * Express response helper for errors
 * @param {Object} res - Express response object
 * @param {Error|string} error - Error object or message
 * @param {number} statusCode - HTTP status code (default: 500)
 */
export function sendError(res, error, statusCode = 500) {
  // Handle AppError instances
  if (error && typeof error.toJSON === 'function') {
    const errorResponse = error.toJSON();
    return res.status(error.statusCode || statusCode).json(errorResponse);
  }
  
  // Handle Error instances
  if (error instanceof Error) {
    const response = createErrorResponse(
      error.message,
      'UNKNOWN_ERROR',
      error.constructor.name,
      null,
      statusCode
    );
    return res.status(statusCode).json(response);
  }
  
  // Handle string errors
  const response = createErrorResponse(
    error || 'An unexpected error occurred',
    'UNKNOWN_ERROR',
    'Error',
    null,
    statusCode
  );
  res.status(statusCode).json(response);
}

/**
 * Express response helper for validation errors
 * @param {Object} res - Express response object
 * @param {string} message - Validation error message
 * @param {string} field - Field that failed validation
 * @param {*} details - Additional validation details
 */
export function sendValidationError(res, message, field = null, details = null) {
  const response = createValidationErrorResponse(message, field, details);
  res.status(400).json(response);
}

/**
 * Express response helper for 404 not found
 * @param {Object} res - Express response object
 * @param {string} message - Not found message
 * @param {string} resource - Resource type that wasn't found
 * @param {*} id - Resource ID that wasn't found
 */
export function sendNotFound(res, message = 'Resource not found', resource = null, id = null) {
  const response = createErrorResponse(
    message,
    'NOT_FOUND_ERROR',
    'NotFoundError',
    { resource, id },
    404
  );
  res.status(404).json(response);
}

/**
 * Express response helper for authentication errors
 * @param {Object} res - Express response object
 * @param {string} message - Authentication error message
 */
export function sendAuthenticationError(res, message = 'Authentication required') {
  const response = createErrorResponse(
    message,
    'AUTHENTICATION_ERROR',
    'AuthenticationError',
    null,
    401
  );
  res.status(401).json(response);
}

/**
 * Express response helper for authorization errors
 * @param {Object} res - Express response object
 * @param {string} message - Authorization error message
 * @param {string} resource - Resource being accessed
 * @param {string} action - Action being attempted
 */
export function sendAuthorizationError(res, message = 'Access denied', resource = null, action = null) {
  const response = createErrorResponse(
    message,
    'AUTHORIZATION_ERROR',
    'AuthorizationError',
    { resource, action },
    403
  );
  res.status(403).json(response);
}

/**
 * Create paginated response with metadata
 * @param {Array} data - Array of data items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {string} message - Optional success message
 * @returns {Object} Paginated response
 */
export function createPaginatedResponse(data, page, limit, total, message = null) {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;
  
  return createSuccessResponse(data, message, {
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev
    }
  });
}

/**
 * Express response helper for paginated data
 * @param {Object} res - Express response object
 * @param {Array} data - Array of data items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {string} message - Optional success message
 */
export function sendPaginatedResponse(res, data, page, limit, total, message = null) {
  const response = createPaginatedResponse(data, page, limit, total, message);
  res.status(200).json(response);
}

export default {
  createSuccessResponse,
  createErrorResponse,
  createValidationErrorResponse,
  createPaginatedResponse,
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendAuthenticationError,
  sendAuthorizationError,
  sendPaginatedResponse
};