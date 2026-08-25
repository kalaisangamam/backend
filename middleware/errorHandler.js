// Must be registered LAST, after all routes.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.isApiError ? err.statusCode : 500;
  const message = err.isApiError ? err.message : 'Something went wrong on the server';

  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error('[unhandled error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: err.details || undefined,
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

module.exports = { errorHandler, notFoundHandler };
