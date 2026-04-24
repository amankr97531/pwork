const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const User = require('../../models/User');
const Game = require('../../models/Game');
const Bet = require('../../models/Bet');
const Transaction = require('../../models/Transaction');
const MoneyRequest = require('../../models/MoneyRequest');
const { successResponse, errorResponse } = require('../../utils/helpers');

// All routes require admin auth
router.use(auth, admin);

// @route   GET /api/admin/dashboard/stats
router.get('/stats', async (req, res) => {
    try {
        const totalPlayers = await User.countDocuments({ role: 'player' });
        const activePlayers = await User.countDocuments({ role: 'player', status: 'active' });
        const blockedPlayers = await User.countDocuments({ role: 'player', status: 'blocked' });
        const activeGames = await Game.countDocuments({ isActive: true });
        const pendingRequests = await MoneyRequest.countDocuments({ status: 'pending' });

        // Revenue stats
        const totalBets = await Bet.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const totalPayouts = await Transaction.aggregate([
            { $match: { type: 'credit', category: 'game_win' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const revenue = (totalBets[0]?.total || 0) - (totalPayouts[0]?.total || 0);

        successResponse(res, {
            totalPlayers,
            activePlayers,
            blockedPlayers,
            activeGames,
            pendingRequests,
            totalRevenue: revenue,
            totalBets: totalBets[0]?.total || 0,
            totalPayouts: totalPayouts[0]?.total || 0,
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/dashboard/recent
router.get('/recent', async (req, res) => {
    try {
        const recentBets = await Bet.find()
            .populate('user', 'firstName lastName mobile')
            .populate('game', 'name')
            .sort('-createdAt')
            .limit(5);

        const recentRequests = await MoneyRequest.find()
            .populate('user', 'firstName lastName mobile')
            .sort('-createdAt')
            .limit(5);

        const recentUsers = await User.find({ role: 'player' })
            .select('firstName lastName mobile createdAt')
            .sort('-createdAt')
            .limit(5);

        successResponse(res, { recentBets, recentRequests, recentUsers });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/dashboard/financial-summary
router.get('/financial-summary', async (req, res) => {
    try {
        const { date } = req.query;

        // Customer Balance: sum of all player balances (not date-filtered)
        const balanceResult = await User.aggregate([
            { $match: { role: 'player' } },
            { $group: { _id: null, total: { $sum: '$balance' } } },
        ]);
        const customerBalance = balanceResult[0]?.total || 0;

        // Build date filter for MoneyRequest queries
        let dateFilter = {};
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            dateFilter = { createdAt: { $gte: startOfDay, $lte: endOfDay } };
        }

        // Add Money Total: approved add requests for the selected date
        const addMoneyResult = await MoneyRequest.aggregate([
            { $match: { type: 'add', status: 'approved', ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const addMoneyTotal = addMoneyResult[0]?.total || 0;

        // Withdraw Money Total: approved withdraw requests for the selected date
        const withdrawResult = await MoneyRequest.aggregate([
            { $match: { type: 'withdraw', status: 'approved', ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const withdrawMoneyTotal = withdrawResult[0]?.total || 0;

        successResponse(res, {
            customerBalance,
            addMoneyTotal,
            withdrawMoneyTotal,
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
