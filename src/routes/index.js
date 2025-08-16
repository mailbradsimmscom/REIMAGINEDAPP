const { Router } = require('express');
const api = require('./api');
const bff = require('./bff');

const router = Router();

router.use('/api', api);
router.use('/bff', bff);

module.exports = router;
