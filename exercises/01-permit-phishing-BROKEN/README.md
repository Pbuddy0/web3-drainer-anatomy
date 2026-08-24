# Teaching Lab — Permit Phishing Drain Server (BROKEN COPY)

This folder is a **study exercise**. It is a copy of Method 01 (Permit Phishing) from
`attack-methods/01-permit-phishing/`, but the relay server (`scripts/drain.mjs`) has been
**deliberately modified with 3 bugs**.

The bugs are subtle. The server boots, logs look normal, and the endpoints respond.
But the **attack can never succeed**. The signatures never make it to the chain.

## Your Task

Review `scripts/drain.mjs` line by line and find all 3 bugs. For each bug, explain:

1. **What** the line does (vs. what it should do).
2. **Why** it breaks the attack — at which step does the flow fail?
3. **How** to fix it (one-line patch).

## The Attack Flow (reference)

```
1. Browser page (index.html)  →  POST /api/permit   (signature handed over)
2. Relay stores the permit    →  attacker calls POST /api/drain { index }
3. Relay calls Drainer.drain(token, victim, amount, deadline, v, r, s)
4. Drainer executes permit() + transferFrom()  →  tokens move to attacker
```

Hint: trace the flow in this exact order. A bug at step 1 stops the page before the
relay is even reached. A bug at step 2 breaks which victim gets drained. A bug at
step 3 sends a transaction that reverts every time.

## How to Run It (optional)

```bash
cd teaching-lab/01-permit-phishing-BROKEN
npm install
node scripts/drain.mjs          # boots on http://localhost:3456
```

Then compare against the working original:
`attack-methods/01-permit-phishing/scripts/drain.mjs`

## For the Instructor

The answer key is in `ANSWER.md` in this folder. Do not open it in front of students.