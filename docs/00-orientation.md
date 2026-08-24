# 00 — Orientation & Threat Model

> Part of **web3-drainer-anatomy** — an educational field guide to modern wallet-draining
> attacks. Everything in this repo is analysis and testnet-only exercises. Nothing here should
> ever be pointed at mainnet or at wallets you don't own.

## Who this is for

- **Dapp developers** who connect wallets, request signatures, and can accidentally (or via a
  compromised dependency) ship something that drains users.
- **Security researchers and blue teams** who need payload-level literacy in the dominant
  theft class on EVM chains.
- **Wallet users** who want to understand what they're actually agreeing to when a popup says
  "Sign this message."

## The threat model in one page

**Attacker goal:** obtain one valid signature from the victim that authorizes moving assets.

The attacker does *not* need the victim's private key. They do not break cryptography. The
entire industry of "wallet drainers" is a funnel built around manufacturing a moment where the
victim approves something they misunderstand.

**Attacker capabilities (typical):**

| Capability | Notes |
|---|---|
| Cheap lookalike domains | Homoglyphs, extra hyphens, `claim-` / `-airdrop` prefixes |
| Cloned frontend CSS | Pixel-perfect copies of real brands, bypassing casual inspection |
| Distribution at scale | Shill replies on X/Discord/Telegram, paid KOL posts, compromised accounts |
| Gasless signing abuse | Off-chain signatures (`permit`, Permit2) produce no pending tx to alarm the user |
| Relaying infrastructure | A backend submits the victim's signature on-chain within seconds |

**What the attacker cannot do:**

- Derive a private key from an address (one-way hash — see [doc 03](03-hot-wallet-sweep-myths.md))
- Move tokens without *some* authorization from the owner (signature or prior approval)
- Stay undetected forever — relays and drain contracts are highly fingerprintable

## The two-layer model

Every successful campaign has both layers. Confusing them is the most common analytical error
(see [doc 01](01-lure-vs-exploit-two-layer-model.md)):

1. **Lure layer** — social engineering. Static HTML, urgency, brand trust. Gets the click.
2. **Exploit layer** — wallet interaction code. Constructs the typed-data payload, obtains the
   signature, relays it. Moves the money.

Defenses must address both; blocking lures without understanding signatures leaves the exploit
layer intact, and vice versa.

## The vector map

| Vector | What's signed | Result | Deep-dive |
|---|---|---|---|
| ERC-20 `approve` | On-chain tx | Standing allowance, drained later | [04](04-signature-vectors-primer.md), [05](05-red-team-report.md) |
| EIP-2612 permit | Off-chain EIP-712 sig | Relay calls `permit()` + `transferFrom()` | [04](04-signature-vectors-primer.md), [05](05-red-team-report.md) |
| Uniswap Permit2 | Off-chain EIP-712 sig | One approval covers every token | [06](06-real-world-drain-vectors.md), [05](05-red-team-report.md) |
| EIP-3009 | Off-chain sig | USDC moved with no approve at all | [05](05-red-team-report.md) |
| Seaport order | Off-chain sig | NFT sold for ~0 | [06](06-real-world-drain-vectors.md) |
| `eth_sign` abuse | Raw tx hash disguised as message | Arbitrary tx executed | [06](06-real-world-drain-vectors.md) |
| EIP-7702 | Authorization tuple | Persistent delegate code on the EOA | [05](05-red-team-report.md) |
| Clipboard hijack | Nothing (local malware/page) | Address swap at paste time | [06](06-real-world-drain-vectors.md) |

## How to read this repo

- Docs are numbered; each stands alone but builds on earlier ones.
- Code appears as **annotated excerpts** for reading, not as runnable tooling.
- The one runnable thing is [`exercises/01-permit-phishing-BROKEN`](../exercises/01-permit-phishing-BROKEN/)
  — a relay server with three injected bugs. Find them before opening `ANSWER.md`.
- Sepolia addresses referenced across docs are collected in the
  [appendix](appendix-lab-addresses.md).

## A note on tone

Some documents here were written from the attacker team's perspective (that was the
assignment: red team vs. blue team). That perspective is preserved deliberately — defenders
who understand the attacker's checklist make better design decisions. Every offensive section
is paired with detection or defense notes somewhere in the repo; start at
[07 — Detection & Defense](07-detection-and-defense.md) if you only have ten minutes.
