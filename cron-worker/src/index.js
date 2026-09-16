// cron-worker/src/index.js
// Replaces exports.dailyDeletionCheck from deleteAccount.js.
//
// WHY THIS IS A SEPARATE WORKER (not a Pages Function):
// Cloudflare Pages Functions only respond to incoming HTTP requests — there's
// no "run this every 24 hours" hook inside a Pages project. Scheduled work on
// Cloudflare lives in a plain Worker with a Cron Trigger, deployed on its own
// (via `wrangler deploy` from this cron-worker/ folder, separate from your
// Pages deploy). It shares the same Firebase project, just via its own
// deployment.

import {
  getAccessToken,
  fsQueryByBoolField,
  fsMergeDoc,
  getAuthUser,
  deleteAuthUser,
  fsDeleteDoc,
  randomHex,
} from '../../functions/_lib/firebaseAdmin.js';
import { sendConfirmDeletionEmail } from '../../functions/_lib/email.js';

async function runDailyDeletionCheck(env) {
  const accessToken = await getAccessToken(env);
  const now = Date.now();
  const pending = await fsQueryByBoolField(env, accessToken, 'users', 'deletionRequested', true);

  for (const { id: uid, data: user } of pending) {
    if (user.deletionCancelled) continue;

    const requestedAt = new Date(user.deletionRequestedAt).getTime();
    const daysSince = (now - requestedAt) / (24 * 60 * 60 * 1000);
    const confirmations = user.deletionConfirmations || 0;
    const emailsSent = user.deletionEmailsSent || 1;

    let authUser;
    try {
      authUser = await getAuthUser(env, accessToken, uid);
      if (!authUser) continue;
    } catch {
      continue;
    }

    if (confirmations >= 1 && emailsSent < 2 && daysSince >= 10) {
      const token = randomHex(24);
      await fsMergeDoc(env, accessToken, 'users', uid, { deletionToken: token, deletionEmailsSent: 2 });
      await sendConfirmDeletionEmail(env, authUser.email, user.name, uid, token, 2);
      continue;
    }
    if (confirmations >= 2 && emailsSent < 3 && daysSince >= 20) {
      const token = randomHex(24);
      await fsMergeDoc(env, accessToken, 'users', uid, { deletionToken: token, deletionEmailsSent: 3 });
      await sendConfirmDeletionEmail(env, authUser.email, user.name, uid, token, 3);
      continue;
    }
    if (confirmations >= 3 && daysSince >= 30) {
      await deleteAuthUser(env, accessToken, uid).catch(() => {});
      await fsDeleteDoc(env, accessToken, 'users', uid);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyDeletionCheck(env));
  },
  // Optional: hit this URL manually to test the check outside the cron schedule.
  async fetch(request, env) {
    await runDailyDeletionCheck(env);
    return new Response('Deletion check ran.');
  },
};
