# 07 — Detection & Defense Playbook

The companion to every offensive document in this repo. Organized as: layered mitigations →
detection heuristics and IOCs → role-based checklists → incident response.

## 1. Layered mitigation architecture

No single layer catches everything. The reference model has three layers, ordered by how early
they can intervene:

### Layer 1 — RPC / pre-execution simulation

Intercept `eth_sendTransaction`, `eth_signTypedData_v4`, and `eth_sign` payloads *before* the
wallet UI renders, and dry-run them against a forked state (`eth_call` at pending state) to
compute **predicted net balance changes**.

- A permit signature should resolve to "this allows contract X to move up to N of token T from
  you." If N is `type(uint256).max`, that's an unconditional red flag.
- Simulation must use the *victim's* state — a drain only reverts after it's too late if you
  simulate against someone else's balances.
- This is what commercial wallet-security providers (Blockaid, Blowfish-style architectures)
  sell; wallets can also integrate open simulation tooling directly.

### Layer 2 — Wallet / client UI decoding

Decode raw EIP-712 hashes back into human-readable parameters and make the dangerous parts
unmissable:

- Show the **spender** address with its public label/reputation, not just a hex string.
- Render `value` in token units with decimals applied — and flag `unlimited` in red.
- Distinguish message-signing from transaction-signing visually; never let a permit look like
  a login.
- For `eth_sign`: modern wallets should refuse or heavily warn (it signs a hash that can be a
  transaction — see [doc 06](06-real-world-drain-vectors.md#4-eth_sign-abuse)).

### Layer 3 — Contract & account level

- **Scoped approvals**: dapps should request exact amounts, not `MaxUint256`. Users should
  treat unlimited approvals as a bug in the dapp.
- **Time-bound permissions** where supported (permit deadlines, Permit2 expirations).
- **Account abstraction (ERC-4337)** smart accounts: daily spending caps, guardian/circuit
  breaker recovery, session keys with policy.
- **Allowance hygiene**: periodic review via revocation tools (revoke.cash and similar);
  revoke anything unused for months.

## 2. Detection heuristics & IOCs

For monitoring, blocklists, and threat intel pipelines.

### On-chain signals

| Signal | Why it matters |
|---|---|
| `Approval(spender, uint256.max)` to an unlabeled fresh contract | Classic pre-drain setup |
| `Permit2` allowances granted to non-marketplace contracts | Permit2 abuse dominates modern drains |
| Contracts calling `permit()` then `transferFrom()` atomically | Relay-drainer fingerprint |
| Drain contracts with `98/2` split + Gelato-style fee recipients | Commodity drainer economics |
| Batch drains (`drainBatch`) hitting many victims in one tx | Industrial-scale operation |

### Off-chain / infrastructure signals

- Homoglyph and typo domains registered days before a campaign; check CT logs for new certs.
- Lure pages sharing JS bundles or relay endpoints across "different" brands — one kit, many
  skins. Correlate by script hashes and POST endpoints, not domain names.
- Signature-collection APIs (`POST /api/permit`, `/api/drain` patterns) on freshly deployed
  frontends.

### Wallet-user-visible red flags

- Signature requested when the site's story says "verify" or "login" — verification doesn't
  need transfer authority.
- Any signature request mentioning tokens you hold but the site story didn't.
- Countdown-timer urgency combined with wallet connection.
- After pasting an address: first/last 4 characters changed (clipboard hijacker).

## 3. Role-based checklists

### If you're a user

1. Read the spender address on every approval — character by character if it matters.
2. Prefer exact-amount approvals; re-approve when needed instead of approving max forever.
3. Use a simulation-aware wallet or extension; treat warnings as blocking, not advisory.
4. Review and revoke allowances monthly (revoke.cash and similar tools).
5. Separate wallets: hot wallet for interactions, cold storage for savings. The hot wallet
   should be able to lose everything without ruining you.
6. Verify addresses after paste (first 4 + last 4).

### If you ship a dapp

1. Never request `MaxUint256`. Request exact amounts; your users' security reviewers will
   thank you, and your conversion loss is smaller than you fear.
2. Decode-and-display what you ask users to sign, in your own UI, before the wallet popup.
3. Audit every third-party SDK that touches `window.ethereum` — supply-chain injections are a
   documented drainer distribution channel.
4. Pin and SRI-check frontend dependencies; monitor your own domain for lookalikes.
5. If you must support Permit2 flows, show expiration and scope plainly.

### If you run security for a team

1. Subscribe to threat-intel sources that track drainer kits (ScamSniffer and similar).
2. Maintain denylists keyed on relay endpoints and drain-contract code hashes, not domains.
3. Simulate inbound signature requests server-side if your product ever handles them.
4. Run tabletop exercises: "our Discord admin account posted a claim link" — who pulls the
   trigger, how fast, what's the comms plan?

## 4. Incident response

If a signature was signed maliciously but not yet relayed, or funds just moved:

1. **Seconds matter for pending permits**: some relays wait for gas optimization windows.
   Revoking the allowance immediately (if it was an approve/permit that already landed) can
   still save funds.
2. Check `approve`/`Permit2` state for the affected wallet and revoke all active allowances.
3. Assume any asset approved by that signature is gone; inventory before hoping.
4. Move remaining assets from the affected wallet using a *fresh* wallet for fees — the
   compromised one may have standing grants you haven't found yet.
5. Report: chain-analytics firms, the token issuer (some can freeze), and law enforcement.
6. Post-mortem: which layer should have caught this? Feed it back into Section 1.

## Further study

- [05 — Red-team implementation report](05-red-team-report.md): payload anatomy of each vector
- [06 — Real-world drain vectors](06-real-world-drain-vectors.md): the wild techniques beyond the lab
- [04 — Signature vectors primer](04-signature-vectors-primer.md): the cryptographic mechanics under everything above
