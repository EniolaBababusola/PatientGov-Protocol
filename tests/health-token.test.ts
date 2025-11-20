// health-token.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { principalCV, uintCV } from "@stacks/transactions";

const ERR_OWNER_ONLY = 100;
const ERR_INSUFFICIENT_BALANCE = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_NOT_MINTER = 103;
const ERR_PAUSED = 104;
const ERR_BLACKLISTED = 105;
const ERR_INVALID_ADDRESS = 106;
const ERR_ALREADY_PAUSED = 107;
const ERR_NOT_PAUSED = 108;
const ERR_INVALID_ROLE = 109;
const ERR_ALLOWANCE_INSUFFICIENT = 110;
const ERR_SELF_TRANSFER = 111;
const ERR_MINT_LIMIT_EXCEEDED = 112;
const ERR_INVALID_MINT_AMOUNT = 116;

interface AllowanceKey {
  owner: string;
  spender: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class HealthTokenMock {
  state: {
    tokenAdmin: string;
    isPaused: boolean;
    totalMinted: number;
    mintLimit: number;
    maxMinters: number;
    balances: Map<string, number>;
    allowances: Map<string, number>;
    minters: Map<string, boolean>;
    blacklisted: Map<string, boolean>;
    roles: Map<string, string>;
    totalSupply: number;
  } = {
    tokenAdmin: "",
    isPaused: false,
    totalMinted: 0,
    mintLimit: 100000000,
    maxMinters: 10,
    balances: new Map(),
    allowances: new Map(),
    minters: new Map(),
    blacklisted: new Map(),
    roles: new Map(),
    totalSupply: 0,
  };
  caller: string = "ST1TEST";
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      tokenAdmin: this.caller,
      isPaused: false,
      totalMinted: 0,
      mintLimit: 100000000,
      maxMinters: 10,
      balances: new Map(),
      allowances: new Map(),
      minters: new Map(),
      blacklisted: new Map(),
      roles: new Map(),
      totalSupply: 0,
    };
    this.events = [];
  }

  private getAllowanceKey(owner: string, spender: string): string {
    return `${owner}-${spender}`;
  }

  getBalance(who: string): number {
    return this.state.balances.get(who) || 0;
  }

  getTotalSupply(): number {
    return this.state.totalSupply;
  }

  getAllowance(owner: string, spender: string): number {
    return this.state.allowances.get(this.getAllowanceKey(owner, spender)) || 0;
  }

  isMinter(account: string): boolean {
    return this.state.minters.get(account) || false;
  }

  isBlacklisted(account: string): boolean {
    return this.state.blacklisted.get(account) || false;
  }

  getRole(account: string): string {
    return this.state.roles.get(account) || "none";
  }

  getPaused(): boolean {
    return this.state.isPaused;
  }

  getMintLimit(): number {
    return this.state.mintLimit;
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    this.state.tokenAdmin = newAdmin;
    this.events.push({ event: "admin-changed", newAdmin });
    return { ok: true, value: true };
  }

  addMinter(newMinter: string): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (newMinter === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (this.isMinter(newMinter)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.minters.set(newMinter, true);
    this.events.push({ event: "minter-added", minter: newMinter });
    return { ok: true, value: true };
  }

  removeMinter(minter: string): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (!this.isMinter(minter)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.minters.delete(minter);
    this.events.push({ event: "minter-removed", minter });
    return { ok: true, value: true };
  }

  pause(): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (this.state.isPaused) return { ok: false, value: ERR_ALREADY_PAUSED };
    this.state.isPaused = true;
    this.events.push({ event: "paused" });
    return { ok: true, value: true };
  }

  unpause(): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (!this.state.isPaused) return { ok: false, value: ERR_NOT_PAUSED };
    this.state.isPaused = false;
    this.events.push({ event: "unpaused" });
    return { ok: true, value: true };
  }

  blacklistAddress(addr: string): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (addr === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (this.isBlacklisted(addr)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.blacklisted.set(addr, true);
    this.events.push({ event: "blacklisted", address: addr });
    return { ok: true, value: true };
  }

  unblacklistAddress(addr: string): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (!this.isBlacklisted(addr)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.blacklisted.delete(addr);
    this.events.push({ event: "unblacklisted", address: addr });
    return { ok: true, value: true };
  }

  setMintLimit(newLimit: number): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (newLimit < this.state.totalMinted) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.mintLimit = newLimit;
    this.events.push({ event: "mint-limit-set", limit: newLimit });
    return { ok: true, value: true };
  }

  mint(amount: number, recipient: string): Result<boolean> {
    if (!this.isMinter(this.caller)) return { ok: false, value: ERR_NOT_MINTER };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    if (this.isBlacklisted(recipient)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.state.totalMinted + amount > this.state.mintLimit) return { ok: false, value: ERR_MINT_LIMIT_EXCEEDED };
    const currentBalance = this.getBalance(recipient);
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalMinted += amount;
    this.state.totalSupply += amount;
    this.events.push({ event: "minted", amount, recipient });
    return { ok: true, value: true };
  }

  burn(amount: number): Result<boolean> {
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const balance = this.getBalance(this.caller);
    if (balance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    this.state.balances.set(this.caller, balance - amount);
    this.state.totalSupply -= amount;
    this.events.push({ event: "burned", amount, burner: this.caller });
    return { ok: true, value: true };
  }

  transfer(amount: number, recipient: string): Result<boolean> {
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (this.caller === recipient) return { ok: false, value: ERR_SELF_TRANSFER };
    const balance = this.getBalance(this.caller);
    if (balance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    if (this.isBlacklisted(this.caller)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.isBlacklisted(recipient)) return { ok: false, value: ERR_BLACKLISTED };
    this.state.balances.set(this.caller, balance - amount);
    const recipientBalance = this.getBalance(recipient);
    this.state.balances.set(recipient, recipientBalance + amount);
    this.events.push({ event: "transferred", amount, from: this.caller, to: recipient });
    return { ok: true, value: true };
  }

  approve(spender: string, amount: number): Result<boolean> {
    if (spender === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    if (this.isBlacklisted(this.caller)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.isBlacklisted(spender)) return { ok: false, value: ERR_BLACKLISTED };
    this.state.allowances.set(this.getAllowanceKey(this.caller, spender), amount);
    this.events.push({ event: "approved", owner: this.caller, spender, amount });
    return { ok: true, value: true };
  }

  transferFrom(owner: string, recipient: string, amount: number): Result<boolean> {
    if (owner === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (owner === recipient) return { ok: false, value: ERR_SELF_TRANSFER };
    const allowance = this.getAllowance(owner, this.caller);
    if (allowance < amount) return { ok: false, value: ERR_ALLOWANCE_INSUFFICIENT };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    if (this.isBlacklisted(owner)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.isBlacklisted(recipient)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.isBlacklisted(this.caller)) return { ok: false, value: ERR_BLACKLISTED };
    const ownerBalance = this.getBalance(owner);
    this.state.balances.set(owner, ownerBalance - amount);
    const recipientBalance = this.getBalance(recipient);
    this.state.balances.set(recipient, recipientBalance + amount);
    this.state.allowances.set(this.getAllowanceKey(owner, this.caller), allowance - amount);
    this.events.push({ event: "transferred-from", amount, owner, recipient, spender: this.caller });
    return { ok: true, value: true };
  }

  increaseAllowance(spender: string, amount: number): Result<boolean> {
    if (spender === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    if (this.isBlacklisted(this.caller)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.isBlacklisted(spender)) return { ok: false, value: ERR_BLACKLISTED };
    const currentAllowance = this.getAllowance(this.caller, spender);
    this.state.allowances.set(this.getAllowanceKey(this.caller, spender), currentAllowance + amount);
    this.events.push({ event: "allowance-increased", owner: this.caller, spender, amount });
    return { ok: true, value: true };
  }

  decreaseAllowance(spender: string, amount: number): Result<boolean> {
    if (spender === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const currentAllowance = this.getAllowance(this.caller, spender);
    if (currentAllowance < amount) return { ok: false, value: ERR_ALLOWANCE_INSUFFICIENT };
    if (this.state.isPaused) return { ok: false, value: ERR_PAUSED };
    if (this.isBlacklisted(this.caller)) return { ok: false, value: ERR_BLACKLISTED };
    if (this.isBlacklisted(spender)) return { ok: false, value: ERR_BLACKLISTED };
    this.state.allowances.set(this.getAllowanceKey(this.caller, spender), currentAllowance - amount);
    this.events.push({ event: "allowance-decreased", owner: this.caller, spender, amount });
    return { ok: true, value: true };
  }

  setRole(account: string, role: string): Result<boolean> {
    if (this.caller !== this.state.tokenAdmin) return { ok: false, value: ERR_OWNER_ONLY };
    if (account === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ADDRESS };
    if (!["admin", "minter", "none"].includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.roles.set(account, role);
    this.events.push({ event: "role-set", account, role });
    return { ok: true, value: true };
  }
}

describe("HealthTokenMock", () => {
  let contract: HealthTokenMock;

  beforeEach(() => {
    contract = new HealthTokenMock();
    contract.reset();
  });

  it("sets admin successfully", () => {
    const result = contract.setAdmin("ST2NEWADMIN");
    expect(result.ok).toBe(true);
    expect(contract.state.tokenAdmin).toBe("ST2NEWADMIN");
  });

  it("rejects set admin by non-owner", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setAdmin("ST4NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_OWNER_ONLY);
  });

  it("adds minter successfully", () => {
    const result = contract.addMinter("ST2MINTER");
    expect(result.ok).toBe(true);
    expect(contract.isMinter("ST2MINTER")).toBe(true);
  });

  it("rejects add minter by non-owner", () => {
    contract.caller = "ST3FAKE";
    const result = contract.addMinter("ST4MINTER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_OWNER_ONLY);
  });

  it("removes minter successfully", () => {
    contract.addMinter("ST2MINTER");
    const result = contract.removeMinter("ST2MINTER");
    expect(result.ok).toBe(true);
    expect(contract.isMinter("ST2MINTER")).toBe(false);
  });

  it("pauses successfully", () => {
    const result = contract.pause();
    expect(result.ok).toBe(true);
    expect(contract.getPaused()).toBe(true);
  });

  it("unpauses successfully", () => {
    contract.pause();
    const result = contract.unpause();
    expect(result.ok).toBe(true);
    expect(contract.getPaused()).toBe(false);
  });

  it("blacklists address successfully", () => {
    const result = contract.blacklistAddress("ST2BAD");
    expect(result.ok).toBe(true);
    expect(contract.isBlacklisted("ST2BAD")).toBe(true);
  });

  it("unblacklists address successfully", () => {
    contract.blacklistAddress("ST2BAD");
    const result = contract.unblacklistAddress("ST2BAD");
    expect(result.ok).toBe(true);
    expect(contract.isBlacklisted("ST2BAD")).toBe(false);
  });

  it("sets mint limit successfully", () => {
    const result = contract.setMintLimit(200000000);
    expect(result.ok).toBe(true);
    expect(contract.getMintLimit()).toBe(200000000);
  });

  it("mints successfully", () => {
    contract.addMinter("ST1TEST");
    const result = contract.mint(1000, "ST3RECIPIENT");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST3RECIPIENT")).toBe(1000);
    expect(contract.getTotalSupply()).toBe(1000);
  });

  it("rejects mint by non-minter", () => {
    const result = contract.mint(1000, "ST3RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_MINTER);
  });

  it("burns successfully", () => {
    contract.addMinter("ST1TEST");
    contract.mint(1000, "ST1TEST");
    const result = contract.burn(500);
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1TEST")).toBe(500);
    expect(contract.getTotalSupply()).toBe(500);
  });

  it("transfers successfully", () => {
    contract.addMinter("ST1TEST");
    contract.mint(1000, "ST1TEST");
    const result = contract.transfer(300, "ST4RECIPIENT");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1TEST")).toBe(700);
    expect(contract.getBalance("ST4RECIPIENT")).toBe(300);
  });

  it("approves successfully", () => {
    const result = contract.approve("ST5SPENDER", 500);
    expect(result.ok).toBe(true);
    expect(contract.getAllowance("ST1TEST", "ST5SPENDER")).toBe(500);
  });

  it("transfers from successfully", () => {
    contract.addMinter("ST1TEST");
    contract.mint(1000, "ST6OWNER");
    contract.caller = "ST6OWNER";
    contract.approve("ST7SPENDER", 400);
    contract.caller = "ST7SPENDER";
    const result = contract.transferFrom("ST6OWNER", "ST8RECIPIENT", 200);
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST6OWNER")).toBe(800);
    expect(contract.getBalance("ST8RECIPIENT")).toBe(200);
    expect(contract.getAllowance("ST6OWNER", "ST7SPENDER")).toBe(200);
  });

  it("increases allowance successfully", () => {
    contract.approve("ST5SPENDER", 500);
    const result = contract.increaseAllowance("ST5SPENDER", 300);
    expect(result.ok).toBe(true);
    expect(contract.getAllowance("ST1TEST", "ST5SPENDER")).toBe(800);
  });

  it("decreases allowance successfully", () => {
    contract.approve("ST5SPENDER", 500);
    const result = contract.decreaseAllowance("ST5SPENDER", 200);
    expect(result.ok).toBe(true);
    expect(contract.getAllowance("ST1TEST", "ST5SPENDER")).toBe(300);
  });

  it("sets role successfully", () => {
    const result = contract.setRole("ST9ACCOUNT", "minter");
    expect(result.ok).toBe(true);
    expect(contract.getRole("ST9ACCOUNT")).toBe("minter");
  });

  it("rejects mint when paused", () => {
    contract.addMinter("ST1TEST");
    contract.pause();
    const result = contract.mint(1000, "ST3RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("rejects transfer to blacklisted", () => {
    contract.addMinter("ST1TEST");
    contract.mint(1000, "ST1TEST");
    contract.blacklistAddress("ST4RECIPIENT");
    const result = contract.transfer(300, "ST4RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BLACKLISTED);
  });

  it("rejects mint over limit", () => {
    contract.addMinter("ST1TEST");
    contract.setMintLimit(500);
    const result = contract.mint(600, "ST3RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MINT_LIMIT_EXCEEDED);
  });
});