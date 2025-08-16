const { v4: uuid } = require('uuid');

const requestId = (req, _res, next) => {
  req.id = req.headers['x-request-id'] || uuid();
  next();
};

module.exports = { requestId };
