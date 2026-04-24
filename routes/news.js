const express = require('express');
const router = express.Router();
const News = require('../models/News');
const { successResponse, errorResponse } = require('../utils/helpers');

// @route   GET /api/news
// @desc    Get active news for marquee ticker
router.get('/', async (req, res) => {
    try {
        const news = await News.find({ isActive: true }).sort('-createdAt');
        successResponse(res, news);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
