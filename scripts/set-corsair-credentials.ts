import { corsair } from '../corsair';

import { setupCorsair } from 'corsair';

async function main() {
  try {
    console.log('Setting up Corsair integrations...');
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set in env');
    }

    await setupCorsair(corsair, {
      credentials: {
        gmail: {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET
        },
        googlecalendar: {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET
        }
      }
    });

    console.log('Successfully set root credentials for gmail and googlecalendar');
  } catch (err) {
    console.error('Error setting credentials:', err);
  } finally {
    process.exit(0);
  }
}

main();
