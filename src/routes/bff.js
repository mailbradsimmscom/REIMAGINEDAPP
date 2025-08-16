const { Router } = require('express');
const { handleQueryWeb, handleQueryIos } = require('../controllers/queryController');

const router = Router();

// Web-optimized payload
router.post('/web/query', handleQueryWeb);

// iOS-optimized payload
router.post('/ios/query', handleQueryIos);

module.exports = router;
