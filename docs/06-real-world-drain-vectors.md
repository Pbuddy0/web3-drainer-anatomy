# 06 — Real-World Drain Vectors Beyond the Basics

> **Editor's note:** this was written as companion study material for a nine-method lab. The
> runnable lab itself is intentionally not published in this repo; the *concepts* it covered
> (EIP-2612 permits, ERC-20 approvals, NFT operator approvals, social-engineering funnels,
> rug pulls, fake staking) are documented in [04](04-signature-vectors-primer.md) and
> [05](05-red-team-report.md). This page covers everything *beyond* those.

The lab covers the *core mechanics* of
wallet draining — EIP-2612 permits, ERC-20 approvals, NFT operator approvals,
social engineering, and protocol scams. This document covers the **additional
real-world techniques** that sit outside those 9, why they are dangerous, and
how to defend against them.

> Scope note: everything in the lab runs on **Sepolia testnet**. These pages
> describe techniques as they exist in the wild; nothing here should ever be
> pointed at Mainnet.

---

## 1. Why the 9 methods are not the whole picture

| Vector class | Lab method(s) |
|---|---|
| Off-chain permit signature (EIP-2612) | 01, 05, 06, 09 |
| ERC-20 approval + on-chain discovery | 03 |
| NFT `setApprovalForAll` + on-chain discovery | 04 |
| Social engineering / campaign funnel | 06 |
| Protocol-level scams (rug, fake staking) | 07, 08 |
| Wallet-connect simulation | 02 |

Covered: **signatures that authorize spending**, **on-chain approvals**,
**human manipulation**, and **malicious contracts**. Missing from the 9:

1. Uniswap **Permit2** — the dominant drain vector of 2023–2025.
2. **EIP-3009** `transferWithAuthorization` — USDC's gasless transfer.
3. **Seaport / marketplace signature theft** — selling NFTs you never meant to sell.
4. **`eth_sign` abuse** — signing a raw *transaction* as if it were a message.
5. **Clipboard hijacking** — address replacement at copy-time.
6. **Drainer-kit malware & browser extensions** — off-chain, wallet-level.
7. **ERC-1271 smart-wallet signatures** — forging `isValidSignature`.

---

## 2. The economics that make this profitable

The attacker's cost is **gas + setup**, and it is minuscule relative to what is
stealable:

- One drain transaction ≈ **$0.50–$3** of gas, and it can move a victim's
  *entire* token balance (often $1k–$1M+).
- Contract deploys ≈ **$75–$375** one-time, amortized over every victim.
- A single lure page reaching ~1,000 visitors, converting even 1% at an average
  $5k balance, returns ~$50k+ for a few dollars of gas.

**Conclusion:** the cost of the *attack* is irrelevant; the only meaningful
variable is *victim conversion*. That is why every defensive measure below is
about making the signature/approval step **visible, reversible, and scoped**.

---

## 3. The missing techniques

### 3.1 Uniswap Permit2 (the big one)

**How it works.** Permit2 is a single contract users approve once ("allow
Permit2 to move all my tokens forever"). DApps then request **off-chain
signatures** against Permit2 for each swap — the user never approves a token
again. Attackers clone this UX:

1. The lure asks for a **`permit()` against Permit2** for a single small amount
   ("approve exactly 1 USDC for this swap").
2. Permit2 uses a **`nonceBitmap`** and a **`sigDeadline`**; the *signature
   domain* is a single `PermitSingle`/`PermitBatch` payload.
3. Critically, Permit2 **does not check the spender's identity** beyond the
   signature — a well-formed signature is replayed by whoever holds it.
4. A malicious dApp then calls `permit2.transferFrom(from, attacker, amount)`
   for the *approved* amount — or, worse, harvests the signature to drain the
   user's **allowance** (including `type(uint256).max` if the user approved
   infinite to Permit2).

**Why it's dangerous.** One blanket Permit2 approval + one careless signature
= every token you hold. Most large wallet-drainer campaigns in 2023–2025 rode
Permit2 signatures.

**Defense.**
- Treat "sign with Permit2" exactly like "approve": check the **spender** and
  the **amount** (they should be the *contract you're actually using*, not a
  random address).
- Use **limited approvals** (`max_uint` is the enemy) and revoke stale ones.
- Newer wallets show **"permit" clearly in the sign popup** — if it does not,
  don't sign.

---

### 3.2 EIP-3009 — `transferWithAuthorization`

**How it works.** EIP-3009 (`transferWithAuthorization`) lets a token holder
sign off-chain authorization for a third party to *directly transfer* tokens
(no approval step at all). USDC implements it. The payload is:

```
domain  = { name: "USD Coin", version: "2", chainId: <1>, verifyingContract: <USDC> }
message = { from, to, value, validAfter, validBefore, nonce }
```

If a victim signs this, the attacker broadcasts `transferWithAuthorization(...)`
and the tokens move in **one tx** — there is no separate approval to revoke.

**Why it's dangerous.** There is no `approve(spender, 0)` to undo. The moment
the signature is valid (`validAfter` passed), the transfer is executable by
anyone holding the signature.

**Defense.** Never sign transfer-type messages from untrusted dApps; check
`to` == the contract you think you're using, and note `validBefore` — attackers
hold the signature and execute it the instant the window opens.

---

### 3.3 Seaport / marketplace signature theft

**How it works.** NFT marketplaces (OpenSea's Seaport, etc.) use **off-chain
signatures as listing orders**. A listing is: "I, owner, agree to sell NFT#X
for price P, valid until T." Attackers:

1. Clone a marketplace UI ("verify your collection").
2. Get the victim to **sign a listing order** with a real marketplace domain
   (chainId 1, `verifyingContract` = Seaport) but a **price of 0** or **to an
   attacker-controlled offerer**.
3. The attacker's bot *fulfills* that order instantly.

**Why it's dangerous.** The victim thinks they're "connecting" or "verifying".
The signature *is* the sale. There is no gas on the victim's side for the
listing; only the fulfillment pays gas — and that's the attacker's, trivially
cheap.

**Defense.** If a dApp asks you to sign *listing/marketplace* payloads, verify
price, duration, and offerer in the popup. Marketplace listing signatures
should be revoked on the marketplace if compromised.

---

### 3.4 `eth_sign` abuse — signing a transaction

**How it works.** `eth_sign` takes an arbitrary 32-byte hash and returns a raw
secp256k1 signature — no EIP-712 struct, no readable rendering in most wallets.
A transaction's `hash` is exactly such a 32-byte value. So a lure can:

1. Compute the hash of a transaction that says
   `attacker.transfer(victim_balance)`.
2. Ask the user to "sign a message to verify your wallet."
3. Broadcast that signature **as the transaction signature** — the victim just
   signed the tx they were about to be robbed by.

**Why it's dangerous.** Older wallet UIs render `eth_sign` as "Sign message
0xdeadbeef…" — indistinguishable from a harmless verify.

**Defense.** Wallets now **block `eth_sign` by default**. If you ever see a
popup that shows only a hex hash and says "sign message", reject it — a real
dApp never needs `eth_sign`.

---

### 3.5 Clipboard hijacking

**How it works.** Malicious sites listen for `copy`/`paste` events and rewrite
the clipboard to an attacker address with a visually similar checksum
(e.g. `0x1234…abcd` vs `0x1234…abcD`).

**Why it's dangerous.** The victim pastes "their" address into the withdrawal
form. Zero signatures, zero approvals — the funds go to the attacker and the
victim sees the same-looking address they copied.

**Defense.** After pasting an address, **visually confirm the first 4 + last 4
characters** in the *destination* field (not the clipboard). Use an address
book. Never trust a clipboard value you didn't intend to copy.

---

### 3.6 Drainer-kit malware & browser extensions

**How it works.** "Wallet drainer" kits (Inferno, Pink, Angel Drainer and their
successors) are sold as-a-service. They bundle: a lure page, a
WalletConnect-v2 relayer, a signature harvester, and automated sweep bots.
Beyond the page, they ship **malicious browser extensions** that:

- inject fake token-balance popups, or
- rewrite page state so the victim *believes* a transaction was a harmless
  "connect", or
- read the real wallet's chain state and auto-sign permits when the user
  interacts with the lure.

**Why it's dangerous.** It's not one attack — it's a full credential-and-sign
pipeline, continuously updated to match new wallet UI.

**Defense.** Only install extensions from trusted stores, audit what they ask
to read (wallet-extensions asking for `tabs` + all-site access are a red flag),
and keep a dedicated "cold" wallet with zero approvals that never visits
unknown sites.

---

### 3.7 ERC-1271 smart-wallet signatures

**How it works.** Smart contract wallets (Gnosis Safe, Argent, etc.) sign via
`isValidSignature(bytes32 hash, bytes signature)` rather than `ecrecover`.
ERC-1271 is **off-chain first**: a dApp asks the wallet to sign, and the wallet
returns a signature that the *contract* validates later.

**Why it's dangerous.** A malicious dApp can harvest a signature whose validity
is only decided **on-chain, later** — by a contract the attacker might also
influence. Combined with an upgradeable wallet or a malicious `isValidSignature`
implementation, a signature meant for "connect" can authorize a transfer.

**Defense.** Verify what the signing *domain* is before signing from a smart
wallet; smart wallets should render EIP-1271 sign requests with the same
scrutiny as EOA sign requests.

---

## 4. Cheat sheet

| Technique | Signature or tx? | Gas paid by victim? | Primary defense |
|---|---|---|---|
| EIP-2612 permit (lab 01/05/06/09) | signature | no | check spender + amount, revoke |
| ERC-20 approve (lab 03) | tx | **yes** | limited approvals |
| NFT operator (lab 04) | tx | **yes** | revoke operators |
| Permit2 | signature | no | treat as approve; scope amount |
| EIP-3009 (USDC) | signature | no | never sign transfer msgs from unknown dApps |
| Seaport listing | signature | no | verify price/offerer/duration |
| `eth_sign` | signature of tx hash | no | never sign raw hex |
| Clipboard hijack | neither | — | verify pasted address chars |
| Drainer extension | both | no | trusted extensions only |
| ERC-1271 | signature | no | verify signing domain |

---

## 5. Suggested next lab

**Method 10 — Permit2 phishing (Sepolia).** Mirror of 09 but against a local
Permit2 clone: blank-slate `permit()` for 1 USDC-ish token, then
`transferFrom` sweep, plus the "revoke via Permit2" kill-switch lesson. This
would close the largest gap in the 9 and give students hands-on practice with
the vector real drainers use most today.