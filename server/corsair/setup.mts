/**
 * server/corsair/setup.mts
 *
 * ONE-TIME provisioning script for the Corsair App instance.
 * Run ONCE with: npx tsx server/corsair/setup.mts
 *
 * This will:
 * 1. Create a Corsair App instance named 'tempo-production'
 * 2. Install the gmail and googlecalendar plugins
 * 3. Print the CORSAIR_INSTANCE_ID to add to your .env.local
 *
 * ⚠️  DO NOT run this multiple times — it creates a new instance each time.
 *     If you already have CORSAIR_INSTANCE_ID in .env.local, do NOT run this.
 *
 * Prerequisites:
 *   CORSAIR_DEV_KEY must be set in .env.local (from app.corsair.dev/api-keys)

 *   GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Gmail/Calendar OAuth
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@corsair-dev/app';

async function setupCorsairInstance() {
  const apiKey = process.env.CORSAIR_DEV_KEY;
  if (!apiKey) {
    console.error(
      '❌  CORSAIR_DEV_KEY is not set. Get one from: https://app.corsair.dev/api-keys'
    );
    process.exit(1);
  }

  console.log('🔧  Connecting to Corsair...');
  const corsair = createClient({ apiKey });

  // Check for existing instances first
  const { instances } = await corsair.instances.list();
  console.log(`Found ${instances.length} existing instance(s).`);

  if (instances.length > 0) {
    console.log('\nExisting instances:');
    for (const inst of instances) {
      console.log(`  - ${inst.name} (id: ${inst.id})`);
    }
    console.log(
      '\n⚠️  An instance already exists. If you want to use it, add to .env.local:'
    );
    console.log(`CORSAIR_INSTANCE_ID=${instances[0].id}`);
    console.log(
      '\nIf you want a NEW instance, comment out the early exit below and re-run.'
    );
    // process.exit(0);
  }

  console.log('\n📦  Creating Corsair instance...');
  const instance = await corsair.instances.create({
    name: 'tempo-production',
  });
  console.log(`✅  Instance created: ${instance.name} (id: ${instance.id})`);

  const inst = corsair.instance(instance.id);

  // Install Gmail plugin
  console.log('\n📧  Installing Gmail plugin...');
  await inst.plugins.upsert('gmail', { useManaged: true });
  console.log('✅  Gmail plugin installed');

  // Install Google Calendar plugin
  console.log('\n📅  Installing Google Calendar plugin...');
  await inst.plugins.upsert('googlecalendar', { useManaged: true });
  console.log('✅  Google Calendar plugin installed');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅  Corsair instance configured successfully!');
  console.log('\nAdd this to your .env.local AND Railway environment variables:');
  console.log(`\nCORSAIR_INSTANCE_ID=${instance.id}`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    '\nNext steps:'
  );
  console.log('1. Copy CORSAIR_INSTANCE_ID above to .env.local');
  console.log('2. Run: npm run dev (or pnpm dev)');
  console.log('3. Visit /onboarding/connect to test the connect link');
}

setupCorsairInstance().catch((err) => {
  console.error('❌  Setup failed:', err.message ?? err);
  process.exit(1);
});
