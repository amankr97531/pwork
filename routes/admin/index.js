const express = require('express');
const router = express.Router();

// Mount admin sub-routes
router.use('/dashboard', require('./dashboard'));
router.use('/players', require('./players'));
router.use('/requests', require('./requests'));
router.use('/results', require('./results'));
router.use('/reports', require('./reports'));
router.use('/settings', require('./settings'));
router.use('/kyc', require('./kyc'));
router.use('/import-transactions', require('./import'));

module.exports = router;
