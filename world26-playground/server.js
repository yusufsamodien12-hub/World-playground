import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_FILE = path.join(__dirname, 'memory.json');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Memory GET endpoint
app.get('/api/state', (req, res) => {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      return res.json({ state: JSON.parse(data) });
    }
    res.json({ state: null });
  } catch (err) {
    res.status(500).json({ error: 'Disk read fault' });
  }
});

// Memory POST endpoint
app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(req.body.state, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Disk write fault' });
  }
});

// ---------------------------------------------------------------------------
// AI AGENT BOUNDARY
//
// The playground no longer talks to an AI provider directly. It only knows
// about a generic "agent" HTTP endpoint that takes a world snapshot and
// returns a decision. Any AI project (Mistral, OpenAI, a rules bot, a human
// clicking buttons, whatever) can sit behind AGENT_URL as long as it speaks
// this contract:
//
//   POST {AGENT_URL}/decide
//   body: { logs, objects, currentGoal, knowledgeBase, activePlan, terrainSamples }
//   response: AIActionResponse JSON (see src/types.ts / AIActionResponse)
//
// This lets the world run as a standalone playground, swapping in whichever
// AI agent project you want to point it at, without the playground itself
// containing any AI/provider-specific code.
// ---------------------------------------------------------------------------
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:4000';

app.post('/api/decide', async (req, res) => {
  try {
    const upstream = await fetch(`${AGENT_URL}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({ error: 'Agent error', details: errorText });
    }

    const decision = await upstream.json();
    res.json(decision);
  } catch (error) {
    console.error('Agent unreachable:', error);
    res.status(502).json({
      error: 'Agent unreachable',
      details: error.message,
      hint: `Is the AI agent project running at ${AGENT_URL}? Set AGENT_URL to point elsewhere.`,
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'world26-playground', agentUrl: AGENT_URL });
});

app.listen(PORT, () => {
  console.log(`🚀 Unified Back-end running on http://localhost:${PORT}`);
});
