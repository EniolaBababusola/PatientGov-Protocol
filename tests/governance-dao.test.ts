import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, cvToValue, stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_REGISTERED = 300;
const ERR_INSUFFICIENT_STAKE = 301;
const ERR_VOTING_CLOSED = 302;
const ERR_ALREADY_VOTED = 303;
const ERR_PROPOSAL_NOT_FOUND = 304;
const ERR_ALREADY_EXECUTED = 305;
const ERR_INVALID_TITLE = 307;
const ERR_INVALID_DESCRIPTION = 308;
const ERR_INVALID_PROPOSAL_TYPE = 309;
const ERR_INVALID_FUNDING_AMOUNT = 310;
const ERR_INVALID_START_DELAY = 311;
const ERR_INVALID_VOTING_DURATION = 312;
const ERR_INVALID_QUORUM = 313;
const ERR_INVALID_TARGET = 314;
const ERR_NOT_AUTHORIZED = 315;
const ERR_INVALID_UPDATE_PARAM = 316;
const ERR_MAX_PROPOSALS_EXCEEDED = 319;

interface Proposal {
  title: string;
  description: string;
  proposalType: string;
  fundingAmount: number;
  startDelay: number;
  votingDuration: number;
  quorumPercent: number;
  target: string | null;
  votesFor: number;
  votesAgainst: number;
  startHeight: number;
  executed: boolean;
  creator: string;
  status: string;
}

interface Vote {
  votedFor: boolean;
  weight: number;
}

interface ProposalUpdate {
  updateTitle: string;
  updateDescription: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class DaoGovernanceMock {
  state: {
    nextProposalId: number;
    maxProposals: number;
    proposalCreationFee: number;
    minStakeToPropose: number;
    defaultVotingDuration: number;
    defaultQuorumPercent: number;
    admin: string;
    proposals: Map<number, Proposal>;
    votes: Map<string, Vote>;
    proposalUpdates: Map<number, ProposalUpdate>;
  } = {
    nextProposalId: 1,
    maxProposals: 1000,
    proposalCreationFee: 1000,
    minStakeToPropose: 1000,
    defaultVotingDuration: 144,
    defaultQuorumPercent: 50,
    admin: "ST1TEST",
    proposals: new Map(),
    votes: new Map(),
    proposalUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  registeredPatients: Set<string> = new Set(["ST1TEST"]);
  tokenBalances: Map<string, number> = new Map([["ST1TEST", 5000]]);
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  treasuryFunds: number = 1000000;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProposalId: 1,
      maxProposals: 1000,
      proposalCreationFee: 1000,
      minStakeToPropose: 1000,
      defaultVotingDuration: 144,
      defaultQuorumPercent: 50,
      admin: "ST1TEST",
      proposals: new Map(),
      votes: new Map(),
      proposalUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.registeredPatients = new Set(["ST1TEST"]);
    this.tokenBalances = new Map([["ST1TEST", 5000]]);
    this.stxTransfers = [];
    this.treasuryFunds = 1000000;
  }

  getPatientInfo(principal: string): { registered: boolean } | null {
    return this.registeredPatients.has(principal) ? { registered: true } : null;
  }

  getBalance(principal: string): number {
    return this.tokenBalances.get(principal) || 0;
  }

  fundRewards(amount: number): Result<boolean> {
    if (this.treasuryFunds < amount) return { ok: false, value: false };
    this.treasuryFunds -= amount;
    return { ok: true, value: true };
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMinStakeToPropose(newStake: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newStake <= 0) return { ok: false, value: false };
    this.state.minStakeToPropose = newStake;
    return { ok: true, value: true };
  }

  setDefaultVotingDuration(newDuration: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newDuration <= 0) return { ok: false, value: false };
    this.state.defaultVotingDuration = newDuration;
    return { ok: true, value: true };
  }

  setDefaultQuorumPercent(newQuorum: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newQuorum <= 0 || newQuorum > 100) return { ok: false, value: false };
    this.state.defaultQuorumPercent = newQuorum;
    return { ok: true, value: true };
  }

  setProposalCreationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.proposalCreationFee = newFee;
    return { ok: true, value: true };
  }

  setMaxProposals(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxProposals = newMax;
    return { ok: true, value: true };
  }

  propose(
    title: string,
    description: string,
    ptype: string,
    fundingAmount: number,
    startDelay: number,
    votingDuration: number,
    quorum: number,
    target: string | null
  ): Result<number> {
    const nextId = this.state.nextProposalId;
    if (nextId >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    const stake = this.getBalance(this.caller);
    if (stake < this.state.minStakeToPropose) return { ok: false, value: ERR_INSUFFICIENT_STAKE };
    if (!this.getPatientInfo(this.caller)) return { ok: false, value: ERR_NOT_REGISTERED };
    if (!title || title.length > 128) return { ok: false, value: ERR_INVALID_TITLE };
    if (!description || description.length > 512) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!["funding", "policy", "upgrade"].includes(ptype)) return { ok: false, value: ERR_INVALID_PROPOSAL_TYPE };
    if (fundingAmount <= 0) return { ok: false, value: ERR_INVALID_FUNDING_AMOUNT };
    if (startDelay < 0) return { ok: false, value: ERR_INVALID_START_DELAY };
    if (votingDuration <= 0) return { ok: false, value: ERR_INVALID_VOTING_DURATION };
    if (quorum <= 0 || quorum > 100) return { ok: false, value: ERR_INVALID_QUORUM };
    if (target && target === this.caller) return { ok: false, value: ERR_INVALID_TARGET };
    this.stxTransfers.push({ amount: this.state.proposalCreationFee, from: this.caller, to: this.state.admin });
    const startHeight = this.blockHeight + startDelay;
    const proposal: Proposal = {
      title,
      description,
      proposalType: ptype,
      fundingAmount,
      startDelay,
      votingDuration,
      quorumPercent: quorum,
      target,
      votesFor: 0,
      votesAgainst: 0,
      startHeight,
      executed: false,
      creator: this.caller,
      status: "active",
    };
    this.state.proposals.set(nextId, proposal);
    this.state.nextProposalId++;
    return { ok: true, value: nextId };
  }

  vote(proposalId: number, support: boolean): Result<boolean> {
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) return { ok: false, value: false };
    const endHeight = proposal.startHeight + proposal.votingDuration;
    if (this.blockHeight < proposal.startHeight || this.blockHeight >= endHeight) return { ok: false, value: false };
    if (proposal.executed) return { ok: false, value: false };
    const voteKey = `${proposalId}-${this.caller}`;
    if (this.state.votes.has(voteKey)) return { ok: false, value: false };
    const stake = this.getBalance(this.caller);
    const weight = Math.floor(stake / 1000);
    if (support) {
      proposal.votesFor += weight;
    } else {
      proposal.votesAgainst += weight;
    }
    this.state.votes.set(voteKey, { votedFor: support, weight });
    return { ok: true, value: true };
  }

  executeProposal(proposalId: number): Result<boolean> {
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) return { ok: false, value: false };
    const endHeight = proposal.startHeight + proposal.votingDuration;
    if (this.blockHeight < endHeight) return { ok: false, value: false };
    if (proposal.executed) return { ok: false, value: false };
    const totalVotes = proposal.votesFor + proposal.votesAgainst;
    const quorumRequired = Math.floor((totalVotes * proposal.quorumPercent) / 100);
    if (proposal.votesFor < quorumRequired) return { ok: false, value: false };
    if (proposal.votesFor <= proposal.votesAgainst) return { ok: false, value: false };
    proposal.executed = true;
    proposal.status = "executed";
    if (proposal.proposalType === "funding") {
      this.fundRewards(proposal.fundingAmount);
    }
    return { ok: true, value: true };
  }

  updateProposal(proposalId: number, newTitle: string, newDescription: string): Result<boolean> {
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) return { ok: false, value: false };
    if (proposal.creator !== this.caller) return { ok: false, value: false };
    if (this.blockHeight >= proposal.startHeight) return { ok: false, value: false };
    if (!newTitle || newTitle.length > 128) return { ok: false, value: false };
    if (!newDescription || newDescription.length > 512) return { ok: false, value: false };
    proposal.title = newTitle;
    proposal.description = newDescription;
    this.state.proposalUpdates.set(proposalId, {
      updateTitle: newTitle,
      updateDescription: newDescription,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getProposal(proposalId: number): Proposal | undefined {
    return this.state.proposals.get(proposalId);
  }

  getProposalCount(): Result<number> {
    return { ok: true, value: this.state.nextProposalId };
  }
}

describe("DaoGovernanceMock", () => {
  let contract: DaoGovernanceMock;

  beforeEach(() => {
    contract = new DaoGovernanceMock();
    contract.reset();
  });

  it("sets admin successfully", () => {
    const result = contract.setAdmin("ST2NEW");
    expect(result.ok).toBe(true);
    expect(contract.state.admin).toBe("ST2NEW");
  });

  it("rejects set admin by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setAdmin("ST4NEW");
    expect(result.ok).toBe(false);
  });

  it("sets min stake to propose successfully", () => {
    const result = contract.setMinStakeToPropose(2000);
    expect(result.ok).toBe(true);
    expect(contract.state.minStakeToPropose).toBe(2000);
  });

  it("rejects invalid min stake", () => {
    const result = contract.setMinStakeToPropose(0);
    expect(result.ok).toBe(false);
  });

  it("sets default voting duration successfully", () => {
    const result = contract.setDefaultVotingDuration(288);
    expect(result.ok).toBe(true);
    expect(contract.state.defaultVotingDuration).toBe(288);
  });

  it("rejects invalid voting duration", () => {
    const result = contract.setDefaultVotingDuration(0);
    expect(result.ok).toBe(false);
  });

  it("sets default quorum percent successfully", () => {
    const result = contract.setDefaultQuorumPercent(60);
    expect(result.ok).toBe(true);
    expect(contract.state.defaultQuorumPercent).toBe(60);
  });

  it("rejects invalid quorum percent", () => {
    const result = contract.setDefaultQuorumPercent(101);
    expect(result.ok).toBe(false);
  });

  it("sets proposal creation fee successfully", () => {
    const result = contract.setProposalCreationFee(500);
    expect(result.ok).toBe(true);
    expect(contract.state.proposalCreationFee).toBe(500);
  });

  it("rejects negative creation fee", () => {
    const result = contract.setProposalCreationFee(-100);
    expect(result.ok).toBe(false);
  });

  it("sets max proposals successfully", () => {
    const result = contract.setMaxProposals(500);
    expect(result.ok).toBe(true);
    expect(contract.state.maxProposals).toBe(500);
  });

  it("rejects invalid max proposals", () => {
    const result = contract.setMaxProposals(0);
    expect(result.ok).toBe(false);
  });

  it("creates proposal successfully", () => {
    const result = contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const proposal = contract.getProposal(1);
    expect(proposal?.title).toBe("Title1");
    expect(proposal?.description).toBe("Desc1");
    expect(proposal?.proposalType).toBe("funding");
    expect(proposal?.fundingAmount).toBe(1000);
    expect(proposal?.startDelay).toBe(0);
    expect(proposal?.votingDuration).toBe(144);
    expect(proposal?.quorumPercent).toBe(50);
    expect(proposal?.target).toBe(null);
    expect(proposal?.votesFor).toBe(0);
    expect(proposal?.votesAgainst).toBe(0);
    expect(proposal?.startHeight).toBe(0);
    expect(proposal?.executed).toBe(false);
    expect(proposal?.creator).toBe("ST1TEST");
    expect(proposal?.status).toBe("active");
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST1TEST" }]);
  });

  it("rejects proposal with insufficient stake", () => {
    contract.tokenBalances.set("ST1TEST", 500);
    const result = contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_STAKE);
  });

  it("rejects proposal from unregistered patient", () => {
    contract.registeredPatients.clear();
    const result = contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_REGISTERED);
  });

  it("rejects invalid title", () => {
    const result = contract.propose(
      "",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects invalid proposal type", () => {
    const result = contract.propose(
      "Title1",
      "Desc1",
      "invalid",
      1000,
      0,
      144,
      50,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_TYPE);
  });

  it("votes successfully", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    const result = contract.vote(1, true);
    expect(result.ok).toBe(true);
    const proposal = contract.getProposal(1);
    expect(proposal?.votesFor).toBe(5);
  });

  it("rejects vote on non-existent proposal", () => {
    const result = contract.vote(99, true);
    expect(result.ok).toBe(false);
  });

  it("rejects vote before start", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      10,
      144,
      50,
      null
    );
    const result = contract.vote(1, true);
    expect(result.ok).toBe(false);
  });

  it("rejects vote after end", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    contract.blockHeight = 145;
    const result = contract.vote(1, true);
    expect(result.ok).toBe(false);
  });

  it("rejects double vote", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    contract.vote(1, true);
    const result = contract.vote(1, false);
    expect(result.ok).toBe(false);
  });

  it("executes proposal successfully", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    contract.vote(1, true);
    contract.blockHeight = 145;
    const result = contract.executeProposal(1);
    expect(result.ok).toBe(true);
    const proposal = contract.getProposal(1);
    expect(proposal?.executed).toBe(true);
    expect(proposal?.status).toBe("executed");
    expect(contract.treasuryFunds).toBe(999000);
  });

  it("rejects execution before end", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    contract.vote(1, true);
    const result = contract.executeProposal(1);
    expect(result.ok).toBe(false);
  });

  it("updates proposal successfully", () => {
    contract.propose(
      "OldTitle",
      "OldDesc",
      "funding",
      1000,
      10,
      144,
      50,
      null
    );
    const result = contract.updateProposal(1, "NewTitle", "NewDesc");
    expect(result.ok).toBe(true);
    const proposal = contract.getProposal(1);
    expect(proposal?.title).toBe("NewTitle");
    expect(proposal?.description).toBe("NewDesc");
    const update = contract.state.proposalUpdates.get(1);
    expect(update?.updateTitle).toBe("NewTitle");
    expect(update?.updateDescription).toBe("NewDesc");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update by non-creator", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      10,
      144,
      50,
      null
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateProposal(1, "NewTitle", "NewDesc");
    expect(result.ok).toBe(false);
  });

  it("rejects update after start", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    const result = contract.updateProposal(1, "NewTitle", "NewDesc");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid update title", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      10,
      144,
      50,
      null
    );
    const result = contract.updateProposal(1, "", "NewDesc");
    expect(result.ok).toBe(false);
  });

  it("gets proposal count correctly", () => {
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    contract.propose(
      "Title2",
      "Desc2",
      "policy",
      2000,
      0,
      144,
      50,
      null
    );
    const result = contract.getProposalCount();
    expect(result.value).toBe(3);
  });

  it("parses proposal parameters with Clarity types", () => {
    const title = stringAsciiCV("TestTitle");
    const fundingAmount = uintCV(1000);
    expect(cvToValue(title)).toBe("TestTitle");
    expect(cvToValue(fundingAmount)).toEqual(BigInt(1000));
  });

  it("rejects proposal with max proposals exceeded", () => {
    contract.state.maxProposals = 1;
    contract.propose(
      "Title1",
      "Desc1",
      "funding",
      1000,
      0,
      144,
      50,
      null
    );
    const result = contract.propose(
      "Title2",
      "Desc2",
      "policy",
      2000,
      0,
      144,
      50,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PROPOSALS_EXCEEDED);
  });
});