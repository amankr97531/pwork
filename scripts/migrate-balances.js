const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        console.log(`Found ${users.length} users to migrate`);

        for (const user of users) {
            const ecuzen = user.balanceEcuzen || 0;
            const pod = user.balancePOD || 0;
            const gsk = user.balanceGSK || 0;
            const total = ecuzen + pod + gsk;

            // We use findByIdAndUpdate to bypass the schema validation 
            // before we actually change the schema file.
            await User.findByIdAndUpdate(user._id, {
                $set: { balance: total },
            });
            console.log(`Migrated ${user.mobile}: ${ecuzen} + ${pod} + ${gsk} = ${total}`);
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
