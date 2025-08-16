const { Router } = require('express');
const { handleQuery } = require('../controllers/queryController');

const router = Router();
router.post('/query', handleQuery);

module.exports = router;
