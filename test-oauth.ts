import { corsair } from './corsair.ts';
import { generateOAuthUrl } from 'corsair/oauth';

async function main() {
  try {
    const result = await generateOAuthUrl(corsair, 'gmail', {
      tenantId: 'test-user',
      redirectUri: process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback',
    });
    console.log('Result:', result.url);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
