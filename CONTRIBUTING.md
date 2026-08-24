# Contributing

Thanks for wanting to make this field guide better. This repo has one hard rule and a few
conventions — read both sections before opening a PR.

## The hard rule

**No deployable attack tooling.** That means no working drainer kits, lure/fake-login pages,
relay servers intended for real use, mainnet configurations, or keys. Contributions are
analytical: explain the mechanism, show annotated excerpts where needed, always pair offense
with detection/defense value. The [PR template](.github/PULL_REQUEST_TEMPLATE.md) makes you
confirm this; PRs that cross the line get closed regardless of quality.

## What's wanted most

See the [`good first issue`](https://github.com/Pbuddy0/web3-drainer-anatomy/labels/good%20first%20issue)
label, but generally:

1. **Corrections with evidence** — EIPs, postmortems, tx traces. Wrong security content is
   worse than missing content.
2. **New vector write-ups** following the shape of existing docs (mechanism → payload anatomy →
   real-world usage → detection & defense). Open a
   [new-vector-proposal](https://github.com/Pbuddy0/web3-drainer-anatomy/issues/new?template=new-vector-proposal.yml)
   issue first.
3. **Diagrams** — mermaid preferred (renders natively on GitHub).
4. **Translations** of `docs/00`–`02` (start where newcomers land).
5. **Exercise improvements** in `exercises/` — better hints, harder bug variants.

## Style conventions

- One topic per file; files numbered `NN-name.md` in `docs/`.
- Every offensive section must link its defense counterpart (usually `07-detection-and-defense.md`).
- Code appears as short annotated excerpts for reading — not runnable projects.
- Testnet-only examples; lab addresses live in the appendix.
- Tables over prose for enumerations; keep paragraphs short.
- Relative links between docs so they work on GitHub and in exports.

## Process

1. Open or comment on an issue describing the change.
2. Fork, branch (`feat/...` or `fix/...`), commit with clear messages.
3. PR against `main`. CI runs a link checker and secret scan — green required.
4. Expect review within a week; maintainers may request evidence for factual claims.
