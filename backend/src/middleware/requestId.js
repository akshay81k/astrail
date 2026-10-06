const idGen = require('../utils/idGenerator');

function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || idGen.request();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestIdMiddleware;
