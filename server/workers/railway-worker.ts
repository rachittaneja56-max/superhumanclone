// @ts-expect-error no typings available for express
import express from 'express';
import { runAgentTurn } from '../agents/orchestrator';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.post('/agent/chat', async (req: any, res: any) => {
  // Verify X-Worker-Secret header
  const secret = req.headers['x-worker-secret'];
  if (secret !== process.env.WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, sessionId, message } = req.body;
  if (!userId || !sessionId || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  try {
    await runAgentTurn(userId, sessionId, message, (chunk) => {
      res.write(chunk);
    });
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
