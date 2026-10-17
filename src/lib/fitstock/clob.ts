import { clamp, roundToTick } from "./parse";
import { clobProxy } from "./api";

const CHAIN_ID = 137;
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const ZERO = "0x0000000000000000000000000000000000000000";
const POLYGON_PARAMS = {
  chainId: "0x89",
  chainName: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: ["https://polygon-rpc.com"],
  blockExplorerUrls: ["https://polygonscan.com/"],
};

export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
}

export function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

export function walletName(): string {
  if (typeof window === "undefined") return "none";
  const w = window as unknown as {
    ethereum?: EthereumProvider & { isMetaMask?: boolean; isRabby?: boolean; isCoinbaseWallet?: boolean };
  };
  if (!w.ethereum) return "none";
  if (w.ethereum.isRabby) return "Rabby";
  if (w.ethereum.isCoinbaseWallet) return "Coinbase";
  if (w.ethereum.isMetaMask) return "MetaMask";
  return "Injected";
}

export async function ensurePolygon(eth: EthereumProvider): Promise<void> {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
    });
  } catch (err) {
    const code = err && typeof err === "object" ? (err as { code?: number }).code : 0;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [POLYGON_PARAMS],
      });
      return;
    }
    // User rejected or already on another chain — signing still uses 137.
  }
}

export async function connectWallet(): Promise<{ address: string; chainId: string | null }> {
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet found. Install MetaMask, Rabby, or Coinbase Wallet.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("Wallet did not return an address");
  await ensurePolygon(eth);
  let chainId: string | null = null;
  try {
    const chain = await eth.request({ method: "eth_chainId" });
    if (typeof chain === "string") chainId = chain;
  } catch {
    /* ignore */
  }
  return { address, chainId };
}

export async function signTypedData(address: string, typed: Record<string, unknown>): Promise<string> {
  const eth = getEthereum();
  if (!eth) throw new Error("No wallet");
  const sig = await eth.request({
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(typed)],
  });
  if (typeof sig !== "string") throw new Error("Bad signature");
  return sig;
}

function b64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

export async function polyHmac(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body?: string,
): Promise<string> {
  const message = timestamp + method + path + (body ?? "");
  const key = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToB64(sig);
}

export async function l2Headers(input: {
  address: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  method: string;
  path: string;
  body?: string;
}): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const pathOnly = input.path.split("?")[0] ?? input.path;
  const signature = await polyHmac(input.secret, timestamp, input.method, pathOnly, input.body);
  return {
    POLY_ADDRESS: input.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_API_KEY: input.apiKey,
    POLY_PASSPHRASE: input.passphrase,
  };
}

const CLOB_AUTH_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
};

export async function deriveClobCreds(address: string): Promise<{
  apiKey: string;
  secret: string;
  passphrase: string;
}> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const typed = {
    types: CLOB_AUTH_TYPES,
    primaryType: "ClobAuth",
    domain: { name: "ClobAuthDomain", version: "1", chainId: CHAIN_ID },
    message: {
      address,
      timestamp,
      nonce: 0,
      message: "This message attests that I control the given wallet",
    },
  };
  const signature = await signTypedData(address, typed);
  const headers = {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: "0",
  };
  const derived = await clobProxy({
    data: { method: "GET", path: "/auth/derive-api-key", headers },
  });
  if (derived.status >= 200 && derived.status < 300 && derived.body) {
    const parsed = JSON.parse(derived.body) as {
      apiKey?: string;
      secret?: string;
      passphrase?: string;
    };
    if (parsed.apiKey && parsed.secret && parsed.passphrase) {
      return { apiKey: parsed.apiKey, secret: parsed.secret, passphrase: parsed.passphrase };
    }
  }
  const created = await clobProxy({
    data: { method: "POST", path: "/auth/api-key", headers, body: "" },
  });
  if (created.status >= 200 && created.status < 300) {
    const parsed = JSON.parse(created.body) as {
      apiKey?: string;
      secret?: string;
      passphrase?: string;
    };
    if (parsed.apiKey && parsed.secret && parsed.passphrase) {
      return { apiKey: parsed.apiKey, secret: parsed.secret, passphrase: parsed.passphrase };
    }
  }
  throw new Error(`CLOB credentials failed (${derived.status}): ${derived.body.slice(0, 180)}`);
}

const ORDER_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

function toBaseUnits(n: number): string {
  return Math.round(n * 1_000_000).toString();
}

export function buildUnsignedOrder(input: {
  address: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  sizeShares: number;
  tickSize: number;
  negRisk: boolean;
  feeRateBps?: number;
}): {
  order: Record<string, string | number>;
  exchange: string;
} {
  const price = roundToTick(clamp(input.price, input.tickSize, 1 - input.tickSize), input.tickSize);
  const size = input.sizeShares;
  const makerAmt = input.side === "BUY" ? size * price : size;
  const takerAmt = input.side === "BUY" ? size : size * price;
  const salt = Date.now().toString() + Math.floor(Math.random() * 1e6).toString();
  const exchange = input.negRisk ? NEG_RISK_EXCHANGE : CTF_EXCHANGE;
  return {
    exchange,
    order: {
      salt,
      maker: input.address,
      signer: input.address,
      taker: ZERO,
      tokenId: input.tokenId,
      makerAmount: toBaseUnits(makerAmt),
      takerAmount: toBaseUnits(takerAmt),
      expiration: "0",
      nonce: "0",
      feeRateBps: String(input.feeRateBps ?? 0),
      side: input.side === "BUY" ? 0 : 1,
      signatureType: 0,
    },
  };
}

export async function signAndSubmitOrder(input: {
  address: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  sizeShares: number;
  tickSize: number;
  negRisk: boolean;
}): Promise<{ status: number; body: string; orderId?: string }> {
  const { order, exchange } = buildUnsignedOrder(input);
  const typed = {
    types: ORDER_TYPES,
    primaryType: "Order",
    domain: {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: exchange,
    },
    message: order,
  };
  const signature = await signTypedData(input.address, typed);
  const payload = JSON.stringify({
    order: { ...order, signature },
    owner: input.apiKey,
    orderType: "GTC",
  });
  const headers = await l2Headers({
    address: input.address,
    apiKey: input.apiKey,
    secret: input.secret,
    passphrase: input.passphrase,
    method: "POST",
    path: "/order",
    body: payload,
  });
  const res = await clobProxy({
    data: { method: "POST", path: "/order", headers, body: payload },
  });
  let orderId: string | undefined;
  try {
    const parsed = JSON.parse(res.body) as { orderID?: string; id?: string };
    orderId = parsed.orderID || parsed.id;
  } catch {
    /* ignore */
  }
  return { status: res.status, body: res.body, orderId };
}

export { CHAIN_ID };
