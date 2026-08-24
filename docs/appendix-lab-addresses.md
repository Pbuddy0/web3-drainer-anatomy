# Appendix — Sepolia Lab Contract Addresses

Addresses referenced across the documentation, deployed during the original coursework on
**Sepolia testnet only**. They are inert artifacts of the lab exercise — listed here so readers
can trace transactions on Sepolia explorers and see the attack flow end-to-end on-chain.

> These addresses do not exist on mainnet and are not meant to. Nothing here is a template.

| Label | Address | Used for |
|---|---|---|
| FreeClaimToken | `0x695b6A16eaE003a168BB9568E38CF8e9005941a1` | Lure-token minting |
| DrainerPermit | `0xEaB1C8605992c545f35C8c1054878011db25FE45` | EIP-2612 permit drain demo |
| DrainerApprove | `0x56d81cf601F6961A6703dA9da36b0576DBf65b11` | Legacy approve drain demo |
| DrainerNFT | `0x80096EFbB8f95d90Db0d81d349E9b448F4850416` | `setApprovalForAll` demo |
| SoulBoundIdentity | `0x16418B1C599102E381608188D5D74C2DA5FBBE82` | SBT phishing lure |
| DrainerENS | `0x8FA7D9a8F2F90E4558132bD598C57F2439924D12` | ENS-themed lure |
| RugToken | `0x12DF6D24C3D93f8E2CbE4C6d0f8960A210e30a60` | Rug-pull case study |
| DrainerRug | `0xED9ff2afb0105A35164dCeC1e10797bB89DA6e86` | Rug-pull case study |
| StakingVaultV1 | `0x48d5B67C0c4c968f72271D71ED30661560cf7226` | Fake staking, v1 |
| TransparentUpgradeableProxy | `0x464EF9593b3442472D456E5d99B4f64f0f424002` | Upgrade path demo |
| StakingVaultV2 | `0x2555867fdad41704d4eA84C3533b687affd28998` | Fake staking, v2 |
| FakeStakingPool | `0x639321535EC4249D87ce695B111b157f75895e18` | Fake staking lure |
| TeachToken | `0xb12DC72B709ec44682d62CD7b7B45b871801bb53` | Teaching currency |
| DrainerTeach | `0x8262a1E26f5eA458B1d64C456c3FdAEc7f3dD830` | Permit drain on TeachToken |
| M10Token | `0x2679Cc793e18dd8972101a33C9a6cC54C4F9481e` | Second brand lure token |
| DrainerM10 | `0x694628626347590CD9528A86567F78e8A06ecA95` | Permit drain on M10 |

Suggested classroom flow: fund two Sepolia wallets (victim/attacker), mint FreeClaimToken to
the victim, walk through doc 05's permit vector, then watch the `Approval`/`Transfer` events on
an explorer while matching them against the detection heuristics in
[doc 07](07-detection-and-defense.md).
