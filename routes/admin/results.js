const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const mongoose = require('mongoose');
const Result = require('../../models/Result');
const Game = require('../../models/Game');
const Bet = require('../../models/Bet');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { successResponse, errorResponse } = require('../../utils/helpers');

router.use(auth, admin);

// @route   GET /api/admin/results/winners
router.get('/winners', async (req, res) => {
    try {
        const { gameId, date, section } = req.query;
        console.log(`Winners API Call - Game: ${gameId}, Date: ${date}, Section: ${section}`);

        if (!gameId || !date) {
            return errorResponse(res, 'Both Game ID and Date are required', 400);
        }

        if (!mongoose.Types.ObjectId.isValid(gameId)) {
            return errorResponse(res, `Invalid Game ID format: ${gameId}`, 400);
        }

        const dateParts = String(date).split('-');
        if (dateParts.length !== 3) {
            return errorResponse(res, `Invalid date format: ${date}. Expected DD-MM-YYYY`, 400);
        }

        const [d, m, y] = dateParts.map(Number);
        if (isNaN(d) || isNaN(m) || isNaN(y)) {
             return errorResponse(res, `Invalid date numeric values: ${date}`, 400);
        }

        const startDate = new Date(y, m - 1, d);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate.getTime() + 86400000);

        const filter = {
            game: gameId,
            createdAt: { $gte: startDate, $lt: endDate },
            status: 'won'
        };

        if (section && section !== 'all') {
            filter.section = section;
        }

        const winners = await Bet.find(filter)
            .populate('user', 'firstName lastName mobile')
            .sort({ createdAt: -1 });

        const summary = {
            totalWinners: winners.length,
            totalPayout: 0,
            maxWin: 0
        };

        if (winners.length > 0) {
            summary.totalPayout = winners.reduce((sum, w) => sum + (Number(w.winAmount) || 0), 0);
            summary.maxWin = Math.max(...winners.map(w => Number(w.winAmount) || 0));
        }

        successResponse(res, { winners, summary });
    } catch (error) {
        console.error('CRITICAL WINNER FETCH ERROR:', error);
        errorResponse(res, error.message || 'Internal Server Error', 500);
    }
});

// Helper to reverse payouts and reset bets to pending
const reversePayouts = async (gameId, date, gameName) => {
    const [d, m, y] = date.split('-').map(Number);
    const startDate = new Date(y, m - 1, d);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 86400000);

    const processedBets = await Bet.find({
        game: gameId,
        createdAt: { $gte: startDate, $lt: endDate },
        status: { $in: ['won', 'lost'] }
    });

    for (const bet of processedBets) {
        if (bet.status === 'won' && bet.winAmount > 0) {
            // Deduct the winnings from the unified 'balance' field
            await User.findByIdAndUpdate(bet.user, { $inc: { balance: -bet.winAmount } });
            await Transaction.create({
                user: bet.user,
                type: 'debit',
                category: 'correction',
                amount: bet.winAmount,
                description: `Correction: Result changed for ${gameName}. Previous win reversed.`,
            });
        }
        // Reset bet to pending for the new calculation
        bet.status = 'pending';
        bet.winAmount = 0;
        await bet.save();
    }
};

// Helper for comprehensive result declaration and payout logic
const processDeclaration = async (gameId, winNumber, resultId, dateStr, adminId) => {
    if (!winNumber || winNumber.length !== 2) throw new Error('A 2-digit winning number is required');

    const [d, m, y] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);
    targetDate.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate.getTime() + 86400000);

    const game = await Game.findById(gameId);
    if (!game) throw new Error('Game not found');

    // --- Time Window Check (only for today's results) ---
    const now = new Date();
    
    // Create strings in user's local timezone format (YYYY-MM-DD)
    const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Only enforce time restriction if declaring for the current day or a future day
    if (targetDateStr >= todayDateStr) {
        try {
            const [hourStr, minPart] = game.resultTime.split(':');
            const [minuteStr, period] = minPart.trim().split(' ');
            let hour = parseInt(hourStr);
            const minute = parseInt(minuteStr) || 0;
            if (period && period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
            if (period && period.toUpperCase() === 'AM' && hour === 12) hour = 0;

            const scheduledTime = new Date(targetDate);
            scheduledTime.setHours(hour, minute, 0, 0);

            // If it's today and the scheduled result time hasn't passed yet
            if (!isNaN(scheduledTime.getTime()) && now < scheduledTime) {
                const err = new Error(`Wait until ${game.resultTime} to declare results for this game`);
                err.statusCode = 400; // Mark this as a validation error
                throw err;
            }
        } catch (timeErr) {
            if (timeErr.statusCode === 400) throw timeErr;
            // If time parsing fails for other reasons, allow the declaration
            console.warn('Could not parse resultTime:', game.resultTime, timeErr.message);
        }
    }
    // For past dates: always allow (the result time is assumed to have passed)

    // --- Payout Reversal (Idempotency) ---
    await reversePayouts(gameId, dateStr, game.name);

    // --- Update Result Record ---
    let result;
    if (resultId) {
        result = await Result.findById(resultId);
    } else {
        result = await Result.findOne({ game: gameId, date: { $gte: targetDate, $lt: dayEnd } });
        if (!result) result = new Result({ game: gameId, date: targetDate });
    }

    result.firstDigit = winNumber[0];
    result.secondDigit = winNumber[1];
    result.thirdDigit = ''; 
    result.fullResult = winNumber;
    result.status = 'declared';
    result.declaredBy = adminId;
    await result.save();

    // --- Process Payouts ---
    const winJodi = winNumber;
    const winAndar = winNumber[0];
    const winBahar = winNumber[1];

    const pendingBets = await Bet.find({
        game: gameId,
        createdAt: { $gte: targetDate, $lt: dayEnd },
        status: 'pending',
    });

    for (const bet of pendingBets) {
        let isWinner = false;
        let multiplier = 9;

        if (bet.section === 'jodi') {
            isWinner = bet.numbers === winJodi;
            multiplier = game.jodiMultiplier || 90;
        } else if (bet.section === 'andar') {
            isWinner = bet.numbers === winAndar;
            multiplier = game.andarMultiplier || 9;
        } else if (bet.section === 'bahar') {
            isWinner = bet.numbers === winBahar;
            multiplier = game.baharMultiplier || 9;
        }

        if (isWinner) {
            const winAmount = bet.amount * multiplier;
            bet.status = 'won';
            bet.winAmount = winAmount;
            await bet.save();

            await User.findByIdAndUpdate(bet.user, { $inc: { balance: winAmount } });
            await Transaction.create({
                user: bet.user,
                type: 'credit',
                category: 'game_win',
                amount: winAmount,
                description: `Win: ${game.name} [${bet.section.toUpperCase()}: ${bet.numbers}] Result: ${winNumber}`,
            });
        } else {
            bet.status = 'lost';
            await bet.save();
        }
    }

    return result;
};

// (The winners route has been moved to the top for priority)

// @route   GET /api/admin/results
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        let today = new Date();
        let dateStr = date;
        if (date) {
            const [d, m, y] = date.split('-').map(Number);
            today = new Date(y, m - 1, d);
        } else {
            const d = String(today.getDate()).padStart(2, '0');
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const y = today.getFullYear();
            dateStr = `${d}-${m}-${y}`;
        }
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 86400000);

        const games = await Game.find({ isActive: true });
        const results = [];

        for (const game of games) {
            try {
                let result = await Result.findOne({ game: game._id, date: { $gte: today, $lt: tomorrow } });
                if (!result) {
                    result = await Result.create({ game: game._id, date: today, status: 'pending' });
                }
                results.push({ ...result.toObject(), gameName: game.name, gameTime: game.openTime, dateStr });
            } catch (innerError) {
                console.error(`Error processing results for game ${game.name}:`, innerError);
                // Skip problematic game but don't crash the whole route
            }
        }
        successResponse(res, results);
    } catch (error) {
        console.error('API /admin/results/ ERROR:', error);
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/results/:id
router.put('/:id', async (req, res) => {
    try {
        const result = await Result.findById(req.params.id);
        if (!result) throw new Error('Result not found');
        const d = result.date;
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        
        const updated = await processDeclaration(result.game, req.body.winNumber, result._id, dateStr, req.user._id);
        successResponse(res, updated, 'Result updated and payouts re-processed');
    } catch (error) {
        console.error('PUT /admin/results/:id ERROR:', error);
        errorResponse(res, error.message, error.statusCode || 500);
    }
});

// @route   POST /api/admin/results/declare
router.post('/declare', async (req, res) => {
    try {
        const { gameId, winNumber, date } = req.body;
        const updated = await processDeclaration(gameId, winNumber, null, date, req.user._id);
        successResponse(res, updated, 'Result declared successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   DELETE /api/admin/results/:id
router.delete('/:id', async (req, res) => {
    try {
        const result = await Result.findById(req.params.id).populate('game');
        if (!result) throw new Error('Result not found');
        
        const d = result.date;
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        
        // Safety: Reverse all payouts before resetting
        await reversePayouts(result.game, dateStr, result.game.name);

        result.firstDigit = '';
        result.secondDigit = '';
        result.thirdDigit = '';
        result.fullResult = '';
        result.status = 'pending';
        result.declaredBy = null;
        await result.save();

        successResponse(res, result, 'Result reset and payouts reversed');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/results/:id/reset
router.put('/:id/reset', async (req, res) => {
    try {
        const result = await Result.findById(req.params.id).populate('game');
        if (!result) throw new Error('Result not found');
        
        const d = result.date;
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        
        await reversePayouts(result.game, dateStr, result.game.name);

        result.firstDigit = '';
        result.secondDigit = '';
        result.thirdDigit = '';
        result.fullResult = '';
        result.status = 'pending';
        result.declaredBy = null;
        await result.save();

        successResponse(res, result, 'Result reset successful and payouts reversed');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
