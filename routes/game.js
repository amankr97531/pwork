const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Game = require('../models/Game');
const Bet = require('../models/Bet');
const Result = require('../models/Result');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Commission = require('../models/Commission');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/helpers');

// Helper: parse "09:30 AM" style OR "09:30" style → minutes from midnight. Returns -1 if unparseable.
const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.trim()) return -1;
    const parts = timeStr.trim().split(' ');
    const timePart = parts[0];
    const amPm = parts[1] ? parts[1].toUpperCase() : null;
    const colonIdx = timePart.indexOf(':');
    if (colonIdx === -1) return -1;
    let h = parseInt(timePart.slice(0, colonIdx), 10);
    const m = parseInt(timePart.slice(colonIdx + 1, colonIdx + 3) || '0', 10);
    if (isNaN(h) || isNaN(m)) return -1;
    if (amPm === 'PM' && h !== 12) h += 12;
    if (amPm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
};

// Helper: check if a game is currently open
const isGameOpen = (game) => {
    if (!game.isActive) return { isOpen: false, reason: 'Game is deactivated' };

    const now = new Date();
    const currMinutes = now.getHours() * 60 + now.getMinutes();

    // Daily window check
    const openMin = parseTimeToMinutes(game.openTime);
    const closeMin = parseTimeToMinutes(game.closeTime);
    
    if (openMin !== -1 && closeMin !== -1) {
        let isDailyOpen = false;
        if (openMin <= closeMin) {
            // Standard: open at 9am, close at 5pm
            isDailyOpen = (currMinutes >= openMin && currMinutes < closeMin);
        } else {
            // Midnight crossing: open at 11pm, close at 2am
            isDailyOpen = (currMinutes >= openMin || currMinutes < closeMin);
        }

        if (!isDailyOpen) {
            return { isOpen: false, reason: `Game open daily between ${game.openTime} and ${game.closeTime}` };
        }
    }

    return { isOpen: true };
};

// @route   GET /api/games
// @desc    List all active games with isOpen flag (considers date + time)
router.get('/', async (req, res) => {
    try {
        const games = await Game.find({ isActive: true }).sort('openTime');
        const gamesWithStatus = games.map(g => {
            const status = isGameOpen(g);
            return { ...g.toObject(), isOpen: status.isOpen, closedReason: status.reason };
        });

        successResponse(res, gamesWithStatus);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});


// @route   GET /api/games/live-results
// @desc    Latest results/schedules per active game (for HomeScreen)
router.get('/live-results', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 86400000);

        const games = await Game.find({ isActive: true }).sort('openTime');
        const liveStatus = [];

        for (const game of games) {
            let result = await Result.findOne({
                game: game._id,
                date: { $gte: today, $lt: tomorrow },
            });

            if (!result) {
                // If no result record exists yet, it's effectively pending
                liveStatus.push({
                    game: { _id: game._id, name: game.name, openTime: game.openTime, resultTime: game.resultTime },
                    status: 'scheduled',
                    fullResult: '??',
                });
            } else {
                liveStatus.push({
                    ...result.toObject(),
                    game: { _id: game._id, name: game.name, openTime: game.openTime, resultTime: game.resultTime },
                });
            }
        }

        successResponse(res, liveStatus);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/games/my-bets
// @desc    Player's bet history
router.get('/my-bets', auth, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const bets = await Bet.find({ user: req.user._id })
            .populate('game', 'name')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Bet.countDocuments({ user: req.user._id });
        successResponse(res, { bets, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/games/results
// @desc    Result history
router.get('/results', async (req, res) => {
    try {
        const { page = 1, limit = 20, game, date } = req.query;
        const filter = { status: 'declared' };
        if (game) filter.game = game;
        if (date) {
            const d = new Date(date);
            filter.date = { $gte: d, $lt: new Date(d.getTime() + 86400000) };
        }

        const results = await Result.find(filter)
            .populate('game', 'name openTime')
            .sort('-date')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Result.countDocuments(filter);
        successResponse(res, { results, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/games/:id
// @desc    Game details
router.get('/:id', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) return errorResponse(res, 'Game not found', 404);
        successResponse(res, game);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/games/:id/bet-batch
// @desc    Place multiple bets in one atomic request
router.post('/:id/bet-batch', auth, async (req, res) => {
    try {
        const { bets, source = 'ecuzen' } = req.body; // Array of { betType, numbers, amount, section, fromNumber, toNumber }
        if (!bets || !Array.isArray(bets) || bets.length === 0) {
            return errorResponse(res, 'No bets provided', 400);
        }

        const game = await Game.findById(req.params.id);
        if (!game) throw new Error('Game not found');
        if (!game.isActive) throw new Error('Game is closed');

        const user = await User.findById(req.user._id);

        let totalDeduction = 0;
        const betDocs = [];
        const groupId = `${req.user._id}_${Date.now()}`;

        for (const b of bets) {
            const { betType, numbers, amount, section = 'jodi', fromNumber, toNumber } = b;

            // Range expansion logic (Crossing/No-to-No)
            if ((betType === 'notoNo' || betType === 'crossing') && fromNumber !== undefined && toNumber !== undefined) {
                const from = parseInt(fromNumber, 10);
                const to = parseInt(toNumber, 10);
                const amt = parseFloat(amount);

                if (isNaN(from) || isNaN(to) || to < from) throw new Error(`Invalid range: ${fromNumber}-${toNumber}`);
                
                const slotCount = to - from + 1;
                const perSlotAmount = amt / slotCount;
                totalDeduction += amt;

                for (let i = from; i <= to; i++) {
                    betDocs.push({
                        user: req.user._id,
                        game: game._id,
                        betType,
                        numbers: String(i).padStart(2, '0'),
                        amount: perSlotAmount,
                        section,
                        fromNumber: String(from).padStart(2, '0'),
                        toNumber: String(to).padStart(2, '0'),
                        jantriGroup: groupId,
                        source,
                    });
                }
            } else {
                // Standard single bet
                totalDeduction += parseFloat(amount);
                betDocs.push({
                    user: req.user._id,
                    game: game._id,
                    betType,
                    numbers,
                    amount: parseFloat(amount),
                    section,
                    source,
                });
            }
        }

        if (user.balance < totalDeduction) {
            throw new Error(`Insufficient balance. Need ₹${totalDeduction.toFixed(2)}, have ₹${user.balance.toFixed(2)}`);
        }

        user.balance -= totalDeduction;
        await user.save();
        await Bet.insertMany(betDocs);

        await Transaction.create({
            user: req.user._id,
            type: 'debit',
            category: 'game_play',
            amount: totalDeduction,
            description: `Batch Bet: ${game.name} (${bets.length} groups) [${source.toUpperCase()}]`,
        });

        // Commission (one-time on total)
        if (user.referredBy) {
            const commissionAmount = totalDeduction * 0.05;
            await Commission.create({ user: user.referredBy, referredUser: req.user._id, level: 1, amount: commissionAmount });
            await User.findByIdAndUpdate(user.referredBy, { $inc: { balance: commissionAmount } });
            await Transaction.create({ user: user.referredBy, type: 'credit', category: 'commission', amount: commissionAmount, description: `Commission from ${user.firstName}` });
        }

        successResponse(res, { newBalance: user.balance, totalDeducted: totalDeduction }, 'Batch bets placed successfully', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/games/:id/bet
// @desc    Place a single bet (jantri, crossing, or no-to-no range)
router.post('/:id/bet', auth, async (req, res) => {
    try {
        const { betType, numbers, amount, section = 'jodi', fromNumber, toNumber, source = 'ecuzen' } = req.body;
        const game = await Game.findById(req.params.id);
        if (!game) throw new Error('Game not found');
        if (!game.isActive) throw new Error('Game is closed');

        const totalCost = parseFloat(amount);
        if (totalCost < game.minBetAmount || totalCost > game.maxBetAmount) {
            throw new Error(`Bet must be between ₹${game.minBetAmount} and ₹${game.maxBetAmount}`);
        }

        const user = await User.findById(req.user._id);

        // ── Range Bets (crossing & notoNo): expand range and distribute amount ──
        if ((betType === 'notoNo' || betType === 'crossing') && fromNumber !== undefined && toNumber !== undefined) {
            const from = parseInt(fromNumber, 10);
            const to = parseInt(toNumber, 10);

            if (isNaN(from) || isNaN(to) || from < 0 || to > 99 || to < from) {
                throw new Error('Invalid range: fromNumber must be ≤ toNumber and both 00–99');
            }

            const slotCount = to - from + 1;
            const perSlotAmount = totalCost / slotCount;

            if (user.balance < totalCost) {
                throw new Error(`Insufficient balance. Need ₹${totalCost} for ${slotCount} slots.`);
            }

            user.balance -= totalCost;
            await user.save();

            const groupId = `${req.user._id}_${Date.now()}`;
            const betDocs = [];
            for (let i = from; i <= to; i++) {
                betDocs.push({
                    user: req.user._id,
                    game: game._id,
                    betType,
                    numbers: String(i).padStart(2, '0'),
                    amount: perSlotAmount,
                    section,
                    fromNumber: String(from).padStart(2, '0'),
                    toNumber: String(to).padStart(2, '0'),
                    jantriGroup: groupId,
                    source,
                });
            }
            await Bet.insertMany(betDocs);

            await Transaction.create({
                user: req.user._id,
                type: 'debit',
                category: 'game_play',
                amount: totalCost,
                description: `${betType === 'notoNo' ? 'No-to-No' : 'Crossing'} Bet: ${game.name} (${fromNumber}${betType === 'notoNo' ? '→' : '×'}${toNumber}) [${source.toUpperCase()}]`,
            });

            // Commission
            if (user.referredBy) {
                const commissionAmount = totalCost * 0.05;
                await Commission.create({ user: user.referredBy, referredUser: req.user._id, level: 1, amount: commissionAmount });
                await User.findByIdAndUpdate(user.referredBy, { $inc: { balance: commissionAmount } });
                await Transaction.create({ user: user.referredBy, type: 'credit', category: 'commission', amount: commissionAmount, description: `Commission from ${user.firstName}` });
            }

            return successResponse(res, { slotsBooked: slotCount, totalDeducted: totalCost, newBalance: user.balance }, 'Range bets placed successfully', 201);
        }

        // ── Standard single bet ──
        if (user.balance < totalCost) throw new Error(`Insufficient balance`);

        user.balance -= totalCost;
        await user.save();

        const bet = await Bet.create({
            user: req.user._id,
            game: game._id,
            betType,
            numbers,
            amount: totalCost,
            section,
            source,
        });

        await Transaction.create({
            user: req.user._id,
            type: 'debit',
            category: 'game_play',
            amount: totalCost,
            description: `Game Play: ${game.name} [${betType}] [${source.toUpperCase()}]`,
        });

        if (user.referredBy) {
            const commissionAmount = totalCost * 0.05;
            await Commission.create({ user: user.referredBy, referredUser: req.user._id, level: 1, amount: commissionAmount });
            await User.findByIdAndUpdate(user.referredBy, { $inc: { balance: commissionAmount } });
            await Transaction.create({ user: user.referredBy, type: 'credit', category: 'commission', amount: commissionAmount, description: `Commission from ${user.firstName}` });
        }

        successResponse(res, { bet, newBalance: user.balance }, 'Bet placed successfully', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});


module.exports = router;
