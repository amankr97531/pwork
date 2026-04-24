const admin = require('firebase-admin');

// IMPORTANT: To enable Firebase Push Notifications, you must:
// 1. Go to Firebase Console and create a project
// 2. Generate a new private key from Project Settings > Service Accounts
// 3. Save the downloaded JSON file as `serviceAccountKey.json` in the backend root directory (next to server.js)
// 4. Uncomment the initialization code below

/*
try {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully');
} catch (error) {
    console.warn('Firebase Admin initialization skipped: serviceAccountKey.json not found.');
}
*/

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
    // Stop if Firebase isn't initialized yet
    if (!admin.apps || admin.apps.length === 0) {
        console.warn('FCM Push Skipped (Firebase Admin not initialized):', title);
        return false;
    }

    if (!fcmToken) {
        console.warn('FCM Push Skipped: No fcmToken provided');
        return false;
    }

    try {
        const message = {
            notification: {
                title,
                body
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK' // example
            },
            token: fcmToken
        };

        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
        return true;
    } catch (error) {
        console.error('Error sending message:', error);
        return false;
    }
};

module.exports = {
    sendPushNotification
};
