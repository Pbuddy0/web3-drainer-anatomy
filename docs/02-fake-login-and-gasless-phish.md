# 02 — Fake Login + Gasless Signature Phish

> **Editor's note:** adapted from a coursework analysis of a campaign-design write-up
> (impersonation funnel: fake claim page → credential harvest → wallet signature trap). The
> claim-by-claim review format is preserved; pay special attention to the corrections about
> what "no-code" can and cannot do. Companion: [01 — Two-Layer Model](01-lure-vs-exploit-two-layer-model.md),
> [07 — Detection & Defense](07-detection-and-defense.md). No runnable phishing pages are
> published in this repo.

**Original title:** Ethical Hacking Assignment — Sponsored Tweet Impersonation + Gasless Signature Phish

## 1. Research Accuracy Assessment

### Correct
| Claim | Verdict |
|---|---|
| Cheap domain impersonation (`coinbase-claim.com`) | **Correct** — homoglyph / suffix impersonation is the dominant domain technique |
| CSS cloning from real brand | **Correct** — automated tools extract and replicate exact styles |
| Mass distribution via shill replies | **Correct** — astroturfing at scale is the primary distribution vector |
| Two-stage flow: fake login → wallet approval | **Correct** — credential harvest followed by wallet drain is a documented pattern |
| Gasless signatures (EIP-2612 `permit`) | **Correct** — off-chain signatures cost no gas, show no pending tx, and are the highest-risk approval vector |

### Incorrect or Oversimplified
| Claim | Problem |
|---|---|
| **“No JS / No CSP Issues”** | **Incorrect** — both the credential-harvest form and the wallet trap require JS. A static page can’t POST credentials or talk to MetaMask. |
| **“No Coding”** | **Misleading** — the lure page is copy-paste, but the credential harvester and wallet trap need functional frontend + backend code. |
| **Fake login as a static page** | **Incomplete** — a real fake login needs a form handler that POSTs credentials to an attacker server. Static HTML can’t do this. |
| **“Sign a Permit transaction”** | **Vague** — doesn’t explain the mechanism. The trap needs real ethers.js code to construct the EIP-712 typed data and call `signTypedData`. |
| **“You drain their wallet instantly”** | **Oversimplified** — a signed `permit()` is just a message. The attacker still needs to submit the on-chain `permit()` call (paying gas) and then call `transferFrom()`. |
| **“Shill Bot” in 10 minutes** | **Impractical** — Twitter/X aggressively blocks new accounts mass-replying. Real campaigns use compromised accounts, ad spend, or coordinated inauthentic behavior. |

---

## 2. The Two-Stage Attack (What the Research Glosses Over)

```
Stage 1: Credential Harvest (fake Coinbase login)
  → Victim enters email/password
  → Form POSTs to attacker server (e.g. https://coinbase-claim.com/api/steal)
  → Attacker now has: email, password, possibly 2FA codes

Stage 2: Wallet Drain (gasless signature phish)
  → Victim clicks "Connect Wallet"
  → MetaMask shows: "USD Coin wants you to sign a message"
  → Victim signs EIP-712 permit() message (gasless — no on-chain tx)
  → Attacker collects signature
  → Attacker submits permit() on-chain later (attacker pays gas)
  → Attacker calls transferFrom() to drain victim's USDC
```

The research treats Stage 2 as a black box. It’s not. Here’s what it actually requires:

### Stage 1: Credential Harvest
- A form that POSTs `{ email, password, timestamp }` to an attacker-controlled endpoint
- The attacker server logs credentials and redirects to Stage 2
- Optional: real-time credential validation against Coinbase’s login API (to filter dead logins)

### Stage 2: Gasless Signature (EIP-2612 Permit)
- `signTypedData(domain, types, message)` from ethers.js
- The EIP-712 domain includes `name`, `version`, `chainId`, `verifyingContract`
- The message includes `owner`, `spender`, `value` (MaxUint256), `nonce`, `deadline`
- The victim signs an *off-chain message* — no gas, no pending transaction
- The attacker later submits `permit(owner, spender, value, deadline, v, r, s)` on-chain

---

## 3. Why “Gasless” Is the Most Dangerous Variant

| Property | On-chain `approve()` | Gasless `permit()` |
|---|---|---|
| Gas paid by | Victim | Attacker |
| Pending transaction visible | Yes | No |
| Wallet warning | Often shows "approve unlimited" | Shows "sign a message" (low urgency) |
| Victim suspicion | Higher (transaction visible) | Lower (just a signature request) |
| Attacker cost | 0 (victim pays) | Gas for `permit()` + `transferFrom()` |
| Time to drain | Immediate (after approval) | Delayed (attacker submits later) |

The gasless pattern is particularly effective because:
1. **No pending tx** — the victim never sees an on-chain approval in their wallet
2. **Low urgency** — "sign a message" feels less risky than "approve unlimited spending"
3. **Delayed execution** — the attacker can wait days/weeks before submitting the permit
4. **Replay risk** — if the victim reuses passwords or nonces, the attacker can exploit multiple chains

---

## 4. Corrected Functional Implementation

See accompanying files:
- `fake-login.html` — functional credential harvester (Stage 1)
- `wallet-approve.html` — functional gasless permit trap (Stage 2)
- `success.html` — fake success page to complete the flow

---

## 5. Mitigation & Blocking Strategies

### For Users
1. **Never sign `permit()` / `approve()` from an airdrop or login page** — legitimate airdrops use `claim()` contracts, not token approvals
2. **Check the domain** — `coinbase-claim.com` is not `coinbase.com`. Hover over links before clicking
3. **Check the wallet popup** — if it says "sign a message" for a token approval, it’s a gasless phish
4. **Revoke allowances immediately** — [revoke.cash](https://revoke.cash), Solscan approvals page
5. **Use a hardware wallet** — Ledger/Trezor show transaction details on-device

### For Wallets (Phantom / MetaMask)
1. **Flag gasless signatures** — if a `signTypedData` call contains a `Permit` message with `MaxUint256`, show a red warning
2. **Spender-address verification** — cross-check against known-good contract lists before signing
3. **Domain binding** — associate wallet connections with specific domains; warn if a signature request comes from an unrecognized domain
4. **Transaction simulation for permits** — simulate the downstream `permit()` + `transferFrom()` flow

### For Platforms (Twitter / Discord / Telegram)
1. **URL reputation scanning** — flag domains hosted on Netlify/Vercel with brand-name + airdrop keywords
2. **Link shortener unwrapping** — expand bit.ly/tinyurl links before displaying
3. **Mass-reply detection** — 200 identical-link replies from new accounts in 10 minutes is a strong signal
4. **Verified-account impersonation** — detect when a verified account’s name/avatar is cloned and the link domain doesn’t match the real brand

### For Domain Registrars / Registries
1. **Brand-name domain blocking** — Coinbase, Binance, OpenSea should block registration of `coinbase-claim.com`, `binance-airdrop.net`, etc.
2. **Rapid takedown** — brands should have a 24/7 process for takedown of phishing domains
3. **DNS monitoring** — detect newly-registered domains that clone brand CSS/logo within hours of registration

### For Security Tools / Scanners
1. **Static HTML analyzer** — detect cloned CSS + wallet-connect buttons + redirect to approval pages
2. **EIP-712 permit decoder** — parse `signTypedData` calls and flag `Permit` with `MaxUint256` to unknown spenders
3. **CSP enforcement** — sites should set strict `connect-src` to prevent credential exfiltration

---

## 6. Detection Rules

### Lure Page Detection
```
IF page contains:
    - countdown timer (< 15 minutes)
    - brand name in URL that differs from real brand domain
    - "Connect Wallet" button
    - cloned CSS from Coinbase / Binance / OpenSea / Magic Eden
    - redirect to login or wallet-approve page
THEN flag as potential "Sponsored Impersonation" phish
```

### Gasless Signature Detection
```
IF wallet receives signTypedData request with:
    - EIP-712 domain containing "USD Coin" / "USDC" / "Tether" / etc.
    - Permit message with spender != known-good contract
    - value == MaxUint256 OR value > victim's token balance
    - deadline > 1 day from now
THEN flag as potential gasless permit phish
```

### Credential Harvest Detection
```
IF page contains:
    - brand logo + login form
    - form action POSTs to external domain
    - domain is not the real brand domain
THEN flag as potential credential harvester
```

---

## 7. Files

| File | Purpose |
|---|---|
| `fake-login.html` | Stage 1: credential harvester (functional; `EXFIL_ENDPOINT` const enables a real POST target, empty = offline demo that logs to console and continues the flow) |
| `wallet-approve.html` | Stage 2: gasless EIP-2612 `permit()` trap (functional; real MetaMask path + offline simulator that verifies the recovered signer) |
| `success.html` | Fake success page |
| `index.html` | Solana lure page (Assignment 1) |
| `corrected_implementation.html` | Solana QR-code drainer (Assignment 3, educational) |
| `confirm.html` | Ethereum approve trap (Assignment 1, educational) |
| `ASSIGNMENT_ANALYSIS.md` | Previous analysis (Mempile Bait) |

**Testing status (retest after the redo):** the previous version dead-ended (POST to a nonexistent
`coinbase-claim.com` → "Sign in failed" alert, flow unreachable). The flow now completes in both
modes: `fake-login.html` → captures credentials → `wallet-approve.html` → signs + verifies an
EIP-712 permit → `success.html`. No wallet extension required for the demo path; with MetaMask
installed the real `signTypedData` path runs.

---

## 8. Conclusion

**Is the research correct?** Partially. The social-engineering and distribution vectors are accurate, but the technical execution is oversimplified. A real attack requires functional credential-harvest code AND functional wallet-interaction code — neither of which is “no-code.”

**Can it be fixed and confirmed working?** Yes — `fake-login.html` and `wallet-approve.html` demonstrate the corrected, functional two-stage flow using ethers.js.

**Why aren’t platforms blocking this?** See the previous analysis: wallets can warn but not prevent, CSP can be bypassed, and the fundamental asymmetry is that the attacker needs one victim while defenders must protect everyone.

**How to block / secure against it?** Combine user education, wallet-level EIP-712 warnings, platform URL scanning, and brand-domain takedown procedures.
