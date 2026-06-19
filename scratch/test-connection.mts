import { getSession } from './lib/auth'
import { reconcileGoogleConnectionState } from './server/auth/helpers'

async function main() {
  try {
    const session = await getSession();
    console.log("User ID:", session.userId);
    if (!session.userId) {
        console.log("No user session");
        return;
    }
    const state = await reconcileGoogleConnectionState(session.userId);
    console.log("Connection State:", state);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
