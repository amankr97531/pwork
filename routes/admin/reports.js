const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const Result = require('../../models/Result');
const Bet = require('../../models/Bet');
const Game = require('../../models/Game');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const BankDetail = require('../../models/BankDetail');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../../utils/helpers');

router.use(auth, admin);

// Helper for generic start/end dates
const getDateBoundaries = (start, end) => {
    let qStart = start ? new Date(start) : new Date();
    qStart.setHours(0, 0, 0, 0);
    
    let qEnd = end ? new Date(end) : new Date(qStart);
    qEnd.setHours(23, 59, 59, 999);
    
    return { qStart, qEnd };
};

// @route   GET /api/admin/reports/jantri
// @desc    Jantri report for a game/date — returns result records
router.get('/jantri', async (req, res) => {
    try {
        const { date, game } = req.query;
        const filter = {};

        if (date) {
            const d = new Date(date);
            filter.date = { $gte: d, $lt: new Date(d.getTime() + 86400000) };
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            filter.date = { $gte: today };
        }

        if (game) filter.game = game;

        const results = await Result.find(filter)
            .populate('game', 'name openTime resultTime closeTime')
            .populate('declaredBy', 'firstName lastName')
            .sort('createdAt');

        successResponse(res, results);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/reports/jantri-bets
// @desc    Per-slot bet breakdown for all 3 sections (jodi, andar, bahar)
router.get('/jantri-bets', async (req, res) => {
    try {
        const { date, game } = req.query;
        if (!game) return errorResponse(res, 'Game ID is required', 400);

        let startDate = date ? new Date(date) : new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate.getTime() + 86400000);

        const gameObjId = new mongoose.Types.ObjectId(game);

        const buildSectionGrid = async (section, slotKeys) => {
            const agg = await Bet.aggregate([
                { $match: { game: gameObjId, section, createdAt: { $gte: startDate, $lt: endDate } } },
                { $group: { _id: '$numbers', totalAmount: { $sum: '$amount' }, betCount: { $sum: 1 } } },
            ]);
            const map = {};
            agg.forEach(s => { map[s._id] = { totalAmount: s.totalAmount, betCount: s.betCount }; });
            return slotKeys.map(key => ({
                slot: key,
                totalAmount: map[key]?.totalAmount || 0,
                betCount: map[key]?.betCount || 0,
            }));
        };

        // Jodi: 01..99, 00
        const jodiKeys = [...Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0')), '00'];
        // Andar / Bahar: 0..9
        const harufKeys = Array.from({ length: 10 }, (_, i) => i.toString());

        const [jodi, andar, bahar] = await Promise.all([
            buildSectionGrid('jodi', jodiKeys),
            buildSectionGrid('andar', harufKeys),
            buildSectionGrid('bahar', harufKeys),
        ]);

        const totalCollection =
            jodi.reduce((s, x) => s + x.totalAmount, 0) +
            andar.reduce((s, x) => s + x.totalAmount, 0) +
            bahar.reduce((s, x) => s + x.totalAmount, 0);

        const gameDoc = await Game.findById(game).select('name openTime closeTime resultTime');
        successResponse(res, { game: gameDoc, jodi, andar, bahar, totalCollection, date: startDate });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/reports/jantri-bets/slot-users
// @desc    List of users who bet on a specific slot (for admin drill-down)
router.get('/jantri-bets/slot-users', async (req, res) => {
    try {
        const { date, game, slot, section = 'jodi' } = req.query;
        if (!game || !slot) return errorResponse(res, 'game and slot are required', 400);

        let startDate = date ? new Date(date) : new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate.getTime() + 86400000);

        const bets = await Bet.find({
            game: new mongoose.Types.ObjectId(game),
            numbers: slot,
            section,
            createdAt: { $gte: startDate, $lt: endDate },
        })
            .populate('user', 'firstName lastName mobile')
            .sort('-createdAt');

        const users = bets.map(b => ({
            betId: b._id,
            userId: b.user?._id,
            name: b.user ? `${b.user.firstName} ${b.user.lastName}` : 'Unknown',
            mobile: b.user?.mobile || '',
            amount: b.amount,
            betType: b.betType,
            jantriGroup: b.jantriGroup,
            time: b.createdAt,
        }));

        const totalAmount = bets.reduce((s, b) => s + b.amount, 0);
        successResponse(res, { slot, section, users, totalAmount, count: bets.length });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});


// @route   GET /api/admin/reports/summary
// @desc    Revenue/bet/payout summary
router.get('/summary', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { qStart, qEnd } = getDateBoundaries(startDate, endDate);

        const totalBets = await Bet.aggregate([
            { $match: { createdAt: { $gte: qStart, $lte: qEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);

        const totalPayouts = await Transaction.aggregate([
            { $match: { category: 'game_win', createdAt: { $gte: qStart, $lte: qEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);

        const totalDeposits = await Transaction.aggregate([
            { $match: { category: 'add_money', createdAt: { $gte: qStart, $lte: qEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);

        const totalWithdrawals = await Transaction.aggregate([
            { $match: { category: 'withdraw', createdAt: { $gte: qStart, $lte: qEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);

        successResponse(res, {
            totalBets: totalBets[0]?.total || 0,
            betCount: totalBets[0]?.count || 0,
            totalPayouts: totalPayouts[0]?.total || 0,
            payoutCount: totalPayouts[0]?.count || 0,
            totalDeposits: totalDeposits[0]?.total || 0,
            totalWithdrawals: totalWithdrawals[0]?.total || 0,
            revenue: (totalBets[0]?.total || 0) - (totalPayouts[0]?.total || 0),
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/reports/player-activity
router.get('/player-activity', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { qStart, qEnd } = getDateBoundaries(startDate, endDate);

        const newPlayers = await User.countDocuments({ role: 'player', createdAt: { $gte: qStart, $lte: qEnd } });
        const activeBettors = await Bet.distinct('user', { createdAt: { $gte: qStart, $lte: qEnd } });
        const totalActivePlayers = await User.countDocuments({ role: 'player', status: 'active' });

        successResponse(res, {
            newPlayers,
            activeBettors: activeBettors.length,
            totalActivePlayers,
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/reports/game-performance
router.get('/game-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { qStart, qEnd } = getDateBoundaries(startDate, endDate);

        const gameStats = await Bet.aggregate([
            { $match: { createdAt: { $gte: qStart, $lte: qEnd } } },
            {
                $group: {
                    _id: '$game',
                    totalBets: { $sum: '$amount' },
                    betCount: { $sum: 1 },
                    totalWins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] } },
                }
            },
            { $lookup: { from: 'games', localField: '_id', foreignField: '_id', as: 'game' } },
            { $unwind: '$game' },
            { $project: { gameName: '$game.name', totalBets: 1, betCount: 1, totalWins: 1, profit: { $subtract: ['$totalBets', '$totalWins'] } } },
            { $sort: { profit: -1 } },
        ]);

        successResponse(res, { games: gameStats });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/reports/payout
router.get('/payout', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { qStart, qEnd } = getDateBoundaries(startDate, endDate);

        const payouts = await Transaction.find({
            category: { $in: ['game_win', 'withdraw'] },
            createdAt: { $gte: qStart, $lte: qEnd },
        })
            .populate('user', 'firstName lastName mobile')
            .sort('-createdAt')
            .limit(100);

        successResponse(res, { payouts });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/reports/export
router.get('/export', async (req, res) => {
    try {
        const { type = 'revenue', startDate, endDate } = req.query;
        const { qStart, qEnd } = getDateBoundaries(startDate, endDate);

        let data;
        if (type === 'revenue' || type === 'payouts') {
            data = await Transaction.find({ createdAt: { $gte: qStart, $lte: qEnd } })
                .populate('user', 'firstName lastName mobile')
                .lean()
                .sort('-createdAt');
        } else if (type === 'games' || type === 'bets') {
            data = await Bet.find({ createdAt: { $gte: qStart, $lte: qEnd } })
                .populate('user', 'firstName lastName mobile')
                .populate('game', 'name')
                .lean()
                .sort('-createdAt');
        } else if (type === 'players') {
            const players = await User.find({ role: 'player', createdAt: { $gte: qStart, $lte: qEnd } }).lean().sort('-createdAt');
            const playerIds = players.map(p => p._id);

            const [bankMap, txMap, betMap] = await Promise.all([
                BankDetail.find({ user: { $in: playerIds } }).lean().then(docs => {
                    const map = {};
                    docs.forEach(d => {
                        if (d.user) map[d.user.toString()] = d;
                    });
                    return map;
                }),
                Transaction.aggregate([
                    { $match: { user: { $in: playerIds }, status: 'success' } },
                    { $group: {
                        _id: '$user',
                        deposit: { $sum: { $cond: [{ $eq: ['$category', 'add_money'] }, '$amount', 0] } },
                        withdraw: { $sum: { $cond: [{ $eq: ['$category', 'withdraw'] }, '$amount', 0] } }
                    }}
                ]).then(docs => {
                    const map = {};
                    docs.forEach(d => {
                        if (d._id) map[d._id.toString()] = d;
                    });
                    return map;
                }),
                Bet.aggregate([
                    { $match: { user: { $in: playerIds } } },
                    { $group: {
                        _id: '$user',
                        totalBetAmount: { $sum: '$amount' },
                        totalWonAmount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] } }
                    }}
                ]).then(docs => {
                    const map = {};
                    docs.forEach(d => {
                        if (d._id) map[d._id.toString()] = d;
                    });
                    return map;
                })
            ]);

            data = players.map(p => {
                const pidStr = p._id.toString();
                const bank = bankMap[pidStr] || {};
                const tx = txMap[pidStr] || {};
                const bet = betMap[pidStr] || {};
                return {
                    "Join Date": new Date(p.createdAt).toLocaleDateString(),
                    "PID": pidStr.slice(-6).toUpperCase(),
                    "First Name": p.firstName,
                    "Last Name": p.lastName,
                    "Mobile": p.mobile,
                    "Balance": p.balance,
                    "Status": p.status,
                    "Total Deposit": tx.deposit || 0,
                    "Total Withdraw": tx.withdraw || 0,
                    "Total Bet Amount": bet.totalBetAmount || 0,
                    "Total Winnings": bet.totalWonAmount || 0,
                    "Bank Holder": bank.accountHolderName || 'N/A',
                    "Bank Acct No": bank.accountNumber || 'N/A',
                    "Bank IFSC": bank.ifscCode || 'N/A'
                };
            });
        } else {
            data = await Bet.aggregate([
                { $match: { createdAt: { $gte: qStart, $lte: qEnd } } },
                { $group: { _id: null, totalBets: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]);
        }

        successResponse(res, data);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// Aliases for Frontend Compatibility
router.get('/settlement', (req, res) => router.handle(Object.create(req, { url: { value: '/summary' } }), res));
router.get('/game', (req, res) => router.handle(Object.create(req, { url: { value: '/game-performance' } }), res));
router.get('/player', (req, res) => router.handle(Object.create(req, { url: { value: '/player-activity' } }), res));

module.exports = router;
