const { AppError } = require('./errorHandler');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];
      const parsed = schema.parse(dataToValidate);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err.issues || err.errors) {
        const issuesList = err.issues || err.errors;
        const details = issuesList.map(e => ({
          path: e.path.join('.'),
          issue: e.message
        }));
        return next(new AppError(400, 'VALIDATION_ERROR', details[0]?.issue || 'Invalid request payload', details));
      }
      next(err);
    }
  };
}

module.exports = validate;
