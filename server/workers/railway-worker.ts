// @ts-expect-error no typings available for express
import express from 'express';
import { runAgentTurn } from '../agents/orchestrator';
import { processTriageJob } from './triage-worker';
import { processPurgeJob } from './purge-worker';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

function verifyWorkerSecret(req: any, res: any): boolean {
  const secret = req.headers['x-worker-secret'];
  if (secret !== process.env.WORKER_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/health', (_req: any, res: any) => {
  res.json({ ok: true });
});

app.post('/workers/triage', async (req: any, res: any) => {
  if (!verifyWorkerSecret(req, res)) return;

  try {
    const result = await processTriageJob(req.body);
    if (result.status === 400) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (error) {
    console.error('Triage worker error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/workers/purge', async (req: any, res: any) => {
  if (!verifyWorkerSecret(req, res)) return;

  try {
    const result = await processPurgeJob(req.body);
    if (result.status === 400) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (error) {
    console.error('Purge worker error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/agent/chat', async (req: any, res: any) => {
  // Verify X-Worker-Secret header
  if (!verifyWorkerSecret(req, res)) return;

  const { userId, sessionId, message, threadContext } = req.body;
  if (!userId || !sessionId || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  try {
    await runAgentTurn(userId, sessionId, message, (chunk) => {
      res.write(chunk);
    }, threadContext);
    res.end();
  } catch (error) {
    console.error('Agent chat error:', error);
    // Depending on when the error happens, headers might already be sent.
    // So we just write the error and end the stream.
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write('\n\n[Agent Error: Interrupted]');
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Railway worker listening on port ${port}`);
});
