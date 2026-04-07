// ============================================================
//  YourAIoffice Chatbot — Backend Proxy Server (Node.js)
//  
//  PURPOSE: Keeps your Anthropic API key secret on the server.
//  The chatbot on your website calls /api/chat (this server)
//  instead of calling Anthropic directly.
//
//  SETUP:
//    1. npm install express cors node-fetch dotenv
//    2. Create a .env file with:  ANTHROPIC_API_KEY=sk-ant-...
//    3. node proxy-server.js
//    4. In your chatbot widget, change the fetch URL to:
//       http://localhost:3001/api/chat   (local)
//       https://yourdomain.com/api/chat  (production)
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json());

// ── CORS: restrict to your domain in production ──────────────
app.use(cors({
  origin: [
    'https://youraioffice.ca',
    'http://localhost',        // for local testing
    'http://127.0.0.1'
  ]
}));

// ── SYSTEM PROMPT (same knowledge base as the widget) ────────
const SYSTEM_PROMPT = `You are the official AI assistant for YourAIoffice (youraioffice.ca). You help website visitors understand YourAIoffice's services, pricing, integrations, and how AI business automation works. Be concise, confident, and professional — matching the brand's tone: sharp, results-oriented, and modern. Never fabricate information outside what is provided.

## ABOUT YOURAIOFFICE
YourAIoffice is a premium AI business automation and workflow consulting company. They help mid-to-large businesses eliminate manual, repetitive tasks by deploying bespoke AI automations — connecting existing software via APIs so teams can focus on high-value work. They integrate with 10,000+ API-enabled apps.

Key stats: 10k+ APIs Connected | 500k Tasks Automated | 20+ hrs Weekly Saved per Firm | 99.9% Accuracy Rate

## SERVICES / WORKFLOW LIBRARY
1. Lead Capture & Follow-Up – Website leads into CRM, lead scoring, automatic follow-up emails, instant sales notifications.
2. AI Email & Customer Support – Incoming support emails, FAQ responses, intelligent ticket routing. Automates 50–70% of requests.
3. Invoice & Payment Protocol – Automated invoice generation, payment reminders, confirmation, accounting ledger entries.
4. Proposal & Contract Generation – Bespoke proposal writing, scope descriptions, dynamic pricing, rapid contracts. 30-min task → 30 seconds.
5. Document Processing – AI extraction of data from invoices, receipts, forms, contracts into your systems.
6. Appointment Scheduling – Autonomous booking, calendar syncing, reminders, cancellation handling.
7. Meeting Notes to Tasks – Meeting summaries, action item extraction, task assignments, follow-up emails.
8. Automated Reporting & Analytics – Live sales, marketing, financial dashboards, performance tracking.
9. HR & Employee Onboarding – Automated paperwork, access provisioning, onboarding training.
10. Social Media Content – Automated posts, content scheduling, engagement responses, reach analytics.

## DEPARTMENT PROTOCOLS
- Sales Protocol: Lead capture & scoring, instant follow-up emails, sales notifications via Slack/SMS/email.
- Support Protocol: AI email & chat resolution, smart ticket routing, dynamic FAQ responses — deflect up to 70% of inquiries.
- Financial Protocol: Autonomous invoicing, scheduled payment reminders, accounting ledger sync.
- HR Protocol: Automated paperwork (contracts, NDAs, tax forms), access provisioning, onboarding drip modules.
- Marketing Protocol: Content scheduling across LinkedIn/X, engagement auto-replies, aggregated performance analytics.
- Operations Protocol: Document processing, proposal generation, meeting notes → task automation.

## ADVANCED PROTOCOL (Phase 2)
- Success & Retention: Churn risk alerts, NPS/feedback loops, milestone gifting automation.
- IT & Security: Frictionless offboarding (one-click access revocation), license management/audit.
- Vendor & Procurement: Contract renewal alerts (60 days before close), vendor onboarding, 3-way invoice matching.
- Data & CRM Ops: Data scrubbing (deduplication, standardization), data enrichment.
- Niche Deployments: Retail (inventory reordering, dynamic pricing), Commercial Real Estate (MLS syndication, maintenance routing), Agencies (auto-generated client report decks).

## INTEGRATIONS
Salesforce, HubSpot, QuickBooks, Zendesk, Slack, Asana, Stripe, Microsoft 365, Google Workspace — plus 10,000+ other API-enabled apps.

## PRICING
- Starter – $99/mo: 1–2 automations to fix your biggest pain point.
- Growth – $299/mo: Up to 5 automations. A fully thriving pipeline. (Most Popular)
- Enterprise – $799/mo: Unlimited automations. Total ecosystem management.
Systems pay for themselves within 60 days of deployment.

## ROI / ECONOMICS
5 hrs/week manual work = ~$1,000/mo wasted. Starter at $99/mo = $901/mo net gain. Client results: 40 hrs/week saved for a commercial real estate firm; 85% reduction in invoice processing time for a marketing agency; 60% tier-1 support ticket deflection for a SaaS startup.

## FAQS
- What is AI business automation? Uses AI/ML to execute repetitive workflows without human intervention via APIs.
- Can it integrate with my existing software? Yes — 10,000+ API-enabled apps, no new platforms forced.
- How much can I save? ~$1,000/mo wasted on 5 hrs/week manual tasks → $99/mo Starter = $901/mo net gain.
- Is data secure? Enterprise-grade encryption on all API transfers and document processing. Fully compliant.

## CONSULTATION PROCESS
Visitors can request a consult at youraioffice.ca by providing company name, website, industry, software stack, primary pain point, and contact details.

## CORE PRINCIPLES
- Security First: Enterprise-grade encryption on every workflow.
- Human-Centric AI: Replace the parts of jobs people hate.
- Immediate ROI: Systems pay for themselves within 60 days.

## RESPONSE GUIDELINES
- Keep answers concise and direct (2–4 sentences; bullet points for lists).
- For pricing questions, give the full pricing table and mention the 60-day ROI.
- For complex needs, recommend a free consultation at youraioffice.ca.
- Never invent services, prices, or capabilities not listed above.`;

// ── RATE LIMITING (simple in-memory, per IP) ─────────────────
const rateLimitMap = new Map();
const RATE_LIMIT   = 30;   // max requests
const RATE_WINDOW  = 60 * 60 * 1000; // per hour (ms)

function checkRateLimit(ip) {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

// ── CHAT ENDPOINT ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // Rate limit
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Validate body
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' });
  }

  // Sanitize: only allow user/assistant roles, string content
  const safeMessages = messages
    .filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) })) // cap per message
    .slice(-20); // keep last 20 turns max

  if (safeMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages provided.' });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: safeMessages
      })
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.json().catch(() => ({}));
      console.error('Anthropic API error:', errBody);
      return res.status(502).json({ error: 'Upstream API error. Please try again.' });
    }

    const data = await anthropicRes.json();
    const reply = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return res.json({ reply });

  } catch (err) {
    console.error('Proxy server error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✓ YourAIoffice proxy running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠ WARNING: ANTHROPIC_API_KEY not set in .env file!');
  }
});
