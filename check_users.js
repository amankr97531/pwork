const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');

const checkUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/');
        console.log('Connected to MongoDB');
        
        const users = await User.find({});
        console.log('Total Users:', users.length);
        users.forEach(u => {
            console.log(`- ${u.mobile} (${u.role}): status=${u.status}`);
        });
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

checkUsers();
