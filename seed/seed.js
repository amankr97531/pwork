const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Game = require('../models/Game');
const City = require('../models/City');
const UPI = require('../models/UPI');
const News = require('../models/News');

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Clear existing data
        await Promise.all([
            User.deleteMany({}),
            Game.deleteMany({}),
            City.deleteMany({}),
            UPI.deleteMany({}),
            News.deleteMany({}),
        ]);
        console.log('Cleared existing data');

        // Create cities
        const cities = await City.insertMany([
            { name: 'Delhi' },
            { name: 'Mumbai' },
            { name: 'Faridabad' },
            { name: 'Ghaziabad' },
        ]);
        console.log(`Created ${cities.length} cities`);

        // Create admin user
        const admin = await User.create({
            firstName: 'Admin',
            lastName: 'POD',
            mobile: '9999999999',
            password: 'admin123',
            role: 'admin',
            email: 'admin@podgaming.com',
        });
        console.log(`Admin created: mobile=9999999999, password=admin123`);

        // Create sample players
        const player1 = await User.create({
            firstName: 'Rajesh',
            lastName: 'Kumar',
            mobile: '9876543210',
            password: 'player123',
            role: 'player',
            balance: 15240,
            city: cities[0]._id,
        });

        const player2 = await User.create({
            firstName: 'Priya',
            lastName: 'Sharma',
            mobile: '9812345678',
            password: 'player123',
            role: 'player',
            balance: 8500,
            referredBy: player1._id,
            city: cities[1]._id,
        });

        const player3 = await User.create({
            firstName: 'Amit',
            lastName: 'Singh',
            mobile: '9898989898',
            password: 'player123',
            role: 'player',
            balance: 3200,
            referredBy: player1._id,
            city: cities[2]._id,
        });
        console.log('Created 3 sample players');

        // Create games
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        const format = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const s = format(today), e = format(nextWeek);

        const games = await Game.insertMany([
            { name: 'GALI', openTime: '11:10 PM', closeTime: '12:00 AM', resultTime: '12:05 AM', minBetAmount: 10, maxBetAmount: 10000, city: cities[0]._id, startDate: s, endDate: e },
            { name: 'DESAWAR', openTime: '05:15 AM', closeTime: '06:00 AM', resultTime: '06:05 AM', minBetAmount: 10, maxBetAmount: 10000, city: cities[0]._id, startDate: s, endDate: e },
            { name: 'FARIDABAD', openTime: '06:15 PM', closeTime: '07:00 PM', resultTime: '07:05 PM', minBetAmount: 10, maxBetAmount: 10000, city: cities[2]._id, startDate: s, endDate: e },
            { name: 'GHAZIABAD', openTime: '08:40 PM', closeTime: '09:30 PM', resultTime: '09:35 PM', minBetAmount: 10, maxBetAmount: 10000, city: cities[3]._id, startDate: s, endDate: e },
            { name: 'SUPER DELHI', openTime: '10:00 AM', closeTime: '11:00 AM', resultTime: '11:05 AM', minBetAmount: 10, maxBetAmount: 5000, city: cities[0]._id, startDate: s, endDate: e },
            { name: 'POD DAY', openTime: '02:00 PM', closeTime: '03:00 PM', resultTime: '03:05 PM', minBetAmount: 10, maxBetAmount: 5000, city: cities[1]._id, startDate: s, endDate: e },
        ]);
        console.log(`Created ${games.length} games`);

        // Create UPI
        await UPI.create({
            upiId: 'podgaming@paytm',
            name: 'POD Gaming',
        });
        console.log('Created UPI details');

        // Create news
        await News.insertMany([
            { title: 'Welcome to POD Gaming! Play responsibly.' },
            { title: 'New game SUPER DELHI is now live! Check it out.' },
            { title: 'Refer friends and earn 5% commission on every bet they place.' },
        ]);
        console.log('Created news items');

        console.log('\n✅ Seed complete!');
        console.log('\n📋 Login Credentials:');
        console.log('  Admin:   mobile=9999999999, password=admin123');
        console.log('  Player1: mobile=9876543210, password=player123');
        console.log('  Player2: mobile=9812345678, password=player123');
        console.log('  Player3: mobile=9898989898, password=player123');

        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
};

seed();
