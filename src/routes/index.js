const { Router } = require('express');
const api = require('./api');
const debug = require('./debug');

const router = Router();

router.use('/api', api);
router.use('/debug', debug);

module.exports = router;
