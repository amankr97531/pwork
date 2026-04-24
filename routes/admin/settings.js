const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const Game = require('../../models/Game');
const UPI = require('../../models/UPI');
const News = require('../../models/News');
const City = require('../../models/City');
const { successResponse, errorResponse } = require('../../utils/helpers');

router.use(auth, admin);

// ========== GAMES ==========

// @route   GET /api/admin/settings/games
router.get('/games', async (req, res) => {
    try {
        const games = await Game.find().populate('city', 'name').sort('-createdAt');
        successResponse(res, games);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/admin/settings/games
router.post('/games', async (req, res) => {
    try {
        const { name, description, openTime, closeTime, resultTime, minBetAmount, maxBetAmount, city, isActive, jodiMultiplier, andarMultiplier, baharMultiplier } = req.body;
        const game = await Game.create({
            name, description, openTime, closeTime, resultTime,
            minBetAmount, maxBetAmount, city, isActive,
            jodiMultiplier: jodiMultiplier || 90,
            andarMultiplier: andarMultiplier || 9,
            baharMultiplier: baharMultiplier || 9,
        });
        successResponse(res, game, 'Game created', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/settings/games/:id
router.put('/games/:id', async (req, res) => {
    try {
        const game = await Game.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!game) return errorResponse(res, 'Game not found', 404);
        successResponse(res, game, 'Game updated');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   DELETE /api/admin/settings/games/:id
router.delete('/games/:id', async (req, res) => {
    try {
        const game = await Game.findByIdAndDelete(req.params.id);
        if (!game) return errorResponse(res, 'Game not found', 404);
        successResponse(res, null, 'Game deleted');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// ========== UPI ==========

// @route   GET /api/admin/settings/upi
router.get('/upi', async (req, res) => {
    try {
        const upis = await UPI.find().sort('-createdAt');
        successResponse(res, upis);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/admin/settings/upi
router.post('/upi', async (req, res) => {
    try {
        const { upiId, name } = req.body;
        const upi = await UPI.create({ upiId, name });
        successResponse(res, upi, 'UPI added', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/settings/upi/:id
router.put('/upi/:id', async (req, res) => {
    try {
        const upi = await UPI.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!upi) return errorResponse(res, 'UPI not found', 404);
        successResponse(res, upi, 'UPI updated');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   DELETE /api/admin/settings/upi/:id
router.delete('/upi/:id', async (req, res) => {
    try {
        const upi = await UPI.findByIdAndDelete(req.params.id);
        if (!upi) return errorResponse(res, 'UPI not found', 404);
        successResponse(res, null, 'UPI deleted');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// ========== NEWS ==========

// @route   GET /api/admin/settings/news
router.get('/news', async (req, res) => {
    try {
        const news = await News.find().sort('-createdAt');
        successResponse(res, news);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/admin/settings/news
router.post('/news', async (req, res) => {
    try {
        const { title, content } = req.body;
        const news = await News.create({ title, content });
        successResponse(res, news, 'News created', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/settings/news/:id
router.put('/news/:id', async (req, res) => {
    try {
        const news = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!news) return errorResponse(res, 'News not found', 404);
        successResponse(res, news, 'News updated');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   DELETE /api/admin/settings/news/:id
router.delete('/news/:id', async (req, res) => {
    try {
        const news = await News.findByIdAndDelete(req.params.id);
        if (!news) return errorResponse(res, 'News not found', 404);
        successResponse(res, null, 'News deleted');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// ========== CITIES ==========

// @route   GET /api/admin/settings/cities
router.get('/cities', async (req, res) => {
    try {
        const cities = await City.find().sort('name');
        successResponse(res, cities);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/admin/settings/cities
router.post('/cities', async (req, res) => {
    try {
        const { name } = req.body;
        const city = await City.create({ name });
        successResponse(res, city, 'City added', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/settings/cities/:id
router.put('/cities/:id', async (req, res) => {
    try {
        const city = await City.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!city) return errorResponse(res, 'City not found', 404);
        successResponse(res, city, 'City updated');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   DELETE /api/admin/settings/cities/:id
router.delete('/cities/:id', async (req, res) => {
    try {
        const city = await City.findByIdAndDelete(req.params.id);
        if (!city) return errorResponse(res, 'City not found', 404);
        successResponse(res, null, 'City deleted');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
