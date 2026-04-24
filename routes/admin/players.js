const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const Bet = require('../../models/Bet');
const { successResponse, errorResponse } = require('../../utils/helpers');

router.use(auth, admin);

// @route   GET /api/admin/players
// @desc    List players with filtering/search
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search, date } = req.query;
        const filter = { role: 'player' };
        
        if (status && status !== 'all') filter.status = status;
        
        if (date && date.includes('-')) {
            try {
                const [d, m, y] = date.split('-').map(Number);
                if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                    const start = new Date(y, m - 1, d);
                    const end = new Date(y, m - 1, d + 1);
                    filter.createdAt = { $gte: start, $lt: end };
                }
            } catch (err) {
                console.warn('Invalid date format passed to players list:', date);
            }
        }
        
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
            ];
        }

        const players = await User.find(filter)
            .populate('city', 'name')
            .populate('referredBy', 'firstName lastName')
            .sort('-createdAt')
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        // Enrich with game stats using a single aggregation
        const playerIds = players.map(p => p._id);
        const betStats = await Bet.aggregate([
            { $match: { user: { $in: playerIds } } },
            { $group: {
                _id: '$user',
                totalGames: { $sum: 1 },
                wonGames: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }
            }}
        ]);
        
        const statsMap = {};
        betStats.forEach(s => { statsMap[s._id.toString()] = s; });

        const BankDetail = require('../../models/BankDetail');
        const bankRecords = await BankDetail.find({ user: { $in: playerIds } }).lean();
        const bankMap = {};
        bankRecords.forEach(b => { 
            if (b.user) bankMap[b.user.toString()] = b; 
        });

        const enriched = players.map(player => {
            const sid = player._id.toString();
            const s = statsMap[sid] || { totalGames: 0, wonGames: 0 };
            return {
                ...player.toObject(),
                gamesPlayed: s.totalGames,
                winRate: s.totalGames > 0 ? `${((s.wonGames / s.totalGames) * 100).toFixed(0)}%` : '0%',
                bankDetails: bankMap[sid] || null,
            };
        });

        const total = await User.countDocuments(filter);
        const totalPlayers = await User.countDocuments({ role: 'player' });
        const blockedPlayers = await User.countDocuments({ role: 'player', status: 'blocked' });
        
        const balanceAgg = await User.aggregate([
            { $match: { role: 'player' } },
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]);
        
        const activeToday = await User.countDocuments({ 
            role: 'player', 
            lastLogin: { $gte: new Date(new Date().setHours(0,0,0,0)) } 
        });

        const summary = {
            totalPlayers,
            blockedPlayers,
            totalBalance: balanceAgg[0]?.total || 0,
            activeToday
        };

        successResponse(res, { players: enriched, total, summary, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (error) {
        console.error('API /admin/players/ FATAL ERROR:', error);
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/players/:id
// @desc    Get player details
router.get('/:id', async (req, res) => {
    try {
        const player = await User.findById(req.params.id).select('-password').populate('city', 'name');
        if (!player) return errorResponse(res, 'Player not found', 404);
        successResponse(res, player);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/players/:id/toggle-block
// @desc    Block/unblock a player
router.put('/:id/toggle-block', async (req, res) => {
    try {
        const player = await User.findById(req.params.id);
        if (!player) return errorResponse(res, 'Player not found', 404);

        player.status = player.status === 'blocked' ? 'active' : 'blocked';
        await player.save();

        successResponse(res, player, `Player ${player.status === 'blocked' ? 'blocked' : 'unblocked'}`);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/players/:id
// @desc    Update player profile
router.put('/:id', async (req, res) => {
    try {
        const { firstName, lastName, mobile, status } = req.body;
        const player = await User.findById(req.params.id);
        if (!player) return errorResponse(res, 'Player not found', 404);

        if (firstName) player.firstName = firstName;
        if (lastName) player.lastName = lastName;
        if (mobile) player.mobile = mobile;
        if (status) player.status = status;

        await player.save();
        successResponse(res, player, 'Player updated successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/admin/players/:id/recharge
// @desc    Admin recharges a player's wallet
router.post('/:id/recharge', async (req, res) => {
    try {
        const { amount, description, source = 'ecuzen' } = req.body;
        const userId = req.params.id;

        if (!amount || amount <= 0) throw new Error('Valid amount required');

        const player = await User.findById(userId);
        if (!player) throw new Error('Player not found');

        player.balance += parseFloat(amount);
        await player.save();

        await Transaction.create({
            user: player._id,
            type: 'credit',
            category: 'recharge',
            amount: parseFloat(amount),
            description: description || `Admin Recharge (${(source || 'N/A').toUpperCase()}) by ${req.user.firstName}`,
        });

        successResponse(res, { newBalance: player.balance }, 'Recharge successful and recorded');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/players/:id/history
// @desc    Get complete history (bets, transactions, bank) for drill-down modal
router.get('/:id/history', async (req, res) => {
    try {
        const userId = req.params.id;
        const player = await User.findById(userId).select('-password');
        if (!player) return errorResponse(res, 'Player not found', 404);

        const BankDetail = require('../../models/BankDetail');
        const [bankDetail, transactions, bets] = await Promise.all([
            BankDetail.findOne({ user: userId }).lean(),
            Transaction.find({ user: userId }).sort('-createdAt').limit(200).lean(),
            Bet.find({ user: userId }).populate('game', 'name').sort('-createdAt').limit(200).lean()
        ]);

        successResponse(res, { player, bankDetail, transactions, bets });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
