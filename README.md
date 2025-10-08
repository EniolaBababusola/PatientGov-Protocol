# PatientGov Protocol

A Web3 project built on the Stacks blockchain using Clarity smart contracts. This protocol empowers patients to participate in healthcare governance through a decentralized autonomous organization (DAO). Patients earn HEALTH tokens as rewards for contributions such as sharing anonymized health data, voting on proposals, or participating in clinical trials. 

## Real-World Problems Solved

- **Low Patient Engagement**: Traditional healthcare systems often exclude patients from decision-making. PatientGov incentivizes participation via token rewards, increasing engagement in governance, research, and policy.
- **Data Privacy and Ownership**: Patients lack control over their health data. This protocol enables secure, consent-based data sharing with blockchain-verified provenance, reducing breaches and empowering monetization.
- **Transparency in Healthcare Funding**: Opaque allocation of research funds. The DAO's on-chain governance ensures transparent voting and treasury management.
- **Incentivizing Research Participation**: Clinical trials suffer from low enrollment. Rewards for verified participation boost recruitment while maintaining pseudonymity.
- **Equity in Access**: Underserved communities can stake tokens or earn rewards to influence decisions, democratizing healthcare priorities.

The system uses Stacks for Bitcoin-anchored security, ensuring tamper-proof records. Patients interact via a dApp (not implemented here; frontend integration via Hiro Wallet recommended).

## Architecture Overview

- **Tokens**: HEALTH (fungible token for governance and rewards).
- **Key Flows**:
  1. Patients register and verify identity (pseudonymous).
  2. Stake HEALTH to propose/vote on governance (e.g., fund allocations).
  3. Share data or participate in activities to earn rewards.
  4. Rewards auto-distributed from treasury.
- **5 Smart Contracts** (kept to 5 for solidity; expandable):
  1. **health-token.clar**: ERC-20-like fungible token for HEALTH.
  2. **patient-registry.clar**: Registers patients and tracks participation scores.
  3. **governance-dao.clar**: Handles proposals, voting, and execution.
  4. **reward-distributor.clar**: Calculates and distributes rewards based on participation.
  5. **treasury.clar**: Manages funds, including reward pools and grants.

Deployment: Use Clarinet for local testing. Deploy to mainnet via Hiro.

## Smart Contracts

### 1. health-token.clar
```clar
;; health-token.clar
;; Simple fungible token for HEALTH governance token.

(define-fungible-token health-token u100000000)  ;; Total supply: 100M

(define-constant err-owner-only (err u100))
(define-constant err-insufficient-balance (err u101))
(define-constant err-invalid-amount (err u102))

(define-data-var token-admin principal tx-sender)

(define-public (set-admin (new-admin principal))
    (begin
        (asserts! (is-eq tx-sender (var-get token-admin)) err-owner-only)
        (var-set token-admin new-admin)
        (ok true)
    )
)

(define-public (mint (amount uint))
    (begin
        (asserts! (is-eq tx-sender (var-get token-admin)) err-owner-only)
        (asserts! (> amount u0) err-invalid-amount)
        (ft-mint? health-token amount tx-sender)
    )
)

(define-public (transfer (amount uint) (recipient principal))
    (begin
        (asserts! (> amount u0) err-invalid-amount)
        (asserts! (ft-get-balance health-token tx-sender)
                  (>= (ft-get-balance health-token tx-sender) amount)
                  err-insufficient-balance)
        (ft-transfer? health-token amount tx-sender recipient)
    )
)

(define-read-only (get-balance (who principal))
    (ft-get-balance health-token who)
)

(define-read-only (get-total-supply)
    (ft-get-supply health-token)
)
```

### 2. patient-registry.clar
```clar
;; patient-registry.clar
;; Registers patients and tracks participation (e.g., data shares, votes).

(define-map patients principal {registered-at: uint, participation-score: uint})

(define-constant err-already-registered (err u200))
(define-constant err-invalid-score (err u201))

(define-public (register-patient)
    (let
        (
            (patient tx-sender)
            (exists (map-get? patients patient))
        )
        (asserts! (not exists) err-already-registered)
        (map-insert patients patient {registered-at: block-height, participation-score: u0})
        (ok true)
    )
)

(define-public (update-participation (score-increment uint))
    (let
        (
            (patient tx-sender)
            (patient-data (unwrap! (map-get? patients patient) (err u202)))  ;; Not registered
            (new-score (+ (get participation-score patient-data) score-increment))
        )
        (asserts! (> score-increment u0) err-invalid-score)
        (map-set patients patient {registered-at: (get registered-at patient-data), participation-score: new-score})
        (ok new-score)
    )
)

(define-read-only (get-patient-info (patient principal))
    (map-get? patients patient)
)
```

### 3. governance-dao.clar
```clar
;; governance-dao.clar
;; DAO for proposals and voting. Requires staked HEALTH tokens.

(define-map proposals uint {title: (string-ascii 128), description: (string-ascii 512), votes-for: uint, votes-against: uint, executed: bool, creator: principal})

(define-map votes principal {proposal-id: uint, voted-for: bool, weight: uint})  ;; Tracks individual votes

(define-data-var next-proposal-id uint u1)
(define-data-var voting-period uint u144)  ;; ~1 day on Stacks (adjust for blocks)

(define-constant err-not-registered (err u300))
(define-constant err-insufficient-stake (err u301))
(define-constant err-voting-closed (err u302))
(define-constant err-already-voted (err u303))

(define-public (propose (title (string-ascii 128)) (description (string-ascii 512)))
    (let
        (
            (proposer tx-sender)
            (patient-info (unwrap! (contract-call? .patient-registry get-patient-info proposer) err-not-registered))
            (stake (contract-call? .health-token get-balance proposer))
        )
        (asserts! (>= stake u1000) err-insufficient-stake)  ;; Min stake to propose
        (let
            (
                (new-id (var-get next-proposal-id))
            )
            (map-insert proposals new-id {title: title, description: description, votes-for: u0, votes-against: u0, executed: false, creator: proposer})
            (var-set next-proposal-id (+ new-id u1))
            (ok new-id)
        )
    )
)

(define-public (vote (proposal-id uint) (support bool))
    (let
        (
            (voter tx-sender)
            (proposal (unwrap! (map-get? proposals proposal-id) (err u304)))  ;; Proposal not found
            (current-block block-height)
            (voting-ends (+ (get votes-for proposal) u100))  ;; Simple: ends after 100 blocks
            (already-voted (map-get? votes voter))
            (stake (contract-call? .health-token get-balance voter))
            (weight (/ stake u1000))  ;; 1 vote per 1000 tokens
        )
        (asserts! (not (get executed proposal)) err-voting-closed)
        (asserts! (<= current-block voting-ends) err-voting-closed)
        (asserts! (is-none already-voted) err-already-voted)
        (if support
            (map-set proposals proposal-id {title: (get title proposal), description: (get description proposal), votes-for: (+ (get votes-for proposal) weight), votes-against: (get votes-against proposal), executed: false, creator: (get creator proposal)})
            (map-set proposals proposal-id {title: (get title proposal), description: (get description proposal), votes-for: (get votes-for proposal), votes-against: (+ (get votes-against proposal) weight), executed: false, creator: (get creator proposal)})
        )
        (map-insert votes voter {proposal-id: proposal-id, voted-for: support, weight: weight})
        (ok true)
    )
)

(define-public (execute-proposal (proposal-id uint))
    (let
        ((proposal (unwrap! (map-get? proposals proposal-id) (err u304))))
        (asserts! (not (get executed proposal)) (err u305))
        (let
            (
                (for-votes (get votes-for proposal))
                (against-votes (get votes-against proposal))
            )
            (if (>= for-votes against-votes)
                (begin
                    ;; Execute: e.g., transfer from treasury (integrate with treasury contract)
                    (map-set proposals proposal-id {title: (get title proposal), description: (get description proposal), votes-for: for-votes, votes-against: against-votes, executed: true, creator: (get creator proposal)})
                    (ok true)
                )
                (err u306)  ;; Proposal rejected
            )
        )
    )
)

(define-read-only (get-proposal (id uint))
    (map-get? proposals id)
)
```

### 4. reward-distributor.clar
```clar
;; reward-distributor.clar
;; Distributes HEALTH tokens based on participation scores.

(define-constant err-not-registered (err u400))
(define-constant err-no-rewards (err u401))
(define-constant err-claim-period (err u402))

(define-data-var reward-pool uint u1000000)  ;; Initial pool; fund via treasury
(define-data-var last-claim-height uint u0)
(define-constant claim-cooldown u500)  ;; ~1 week

(define-public (claim-rewards)
    (let
        (
            (claimer tx-sender)
            (patient-info (unwrap! (contract-call? .patient-registry get-patient-info claimer) err-not-registered))
            (score (get participation-score patient-info))
            (current-height block-height)
            (rewards-eligible (if (> score u10) (* score u10) u0))  ;; Simple: 10 tokens per score point, min 10
        )
        (asserts! (>= (- current-height (var-get last-claim-height)) claim-cooldown) err-claim-period)
        (asserts! (> rewards-eligible u0) err-no-rewards)
        (asserts! (>= (var-get reward-pool) rewards-eligible) (err u403))
        (var-set reward-pool (- (var-get reward-pool) rewards-eligible))
        (var-set last-claim-height current-height)
        ;; Mint or transfer from pool (assume admin mints to distributor)
        (as-contract (contract-call? .health-token transfer rewards-eligible claimer))
        (ok rewards-eligible)
    )
)

(define-public (fund-pool (amount uint))
    ;; Admin or treasury funds the pool
    (begin
        (asserts! (is-eq tx-sender (var-get token-admin)) err-owner-only)  ;; From health-token
        (var-set reward-pool (+ (var-get reward-pool) amount))
        (ok true)
    )
)

(define-read-only (get-reward-pool)
    (var-get reward-pool)
)
```

### 5. treasury.clar
```clar
;; treasury.clar
;; Manages funds, including reward pool funding and grants via governance.

(define-map treasury-balances {asset: principal} uint)

(define-constant err-unauthorized (err u500))
(define-constant err-insufficient-funds (err u501))

(define-data-var admin principal tx-sender)

(define-public (set-admin (new-admin principal))
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-unauthorized)
        (var-set admin new-admin)
        (ok true)
    )
)

(define-public (deposit (amount uint))
    ;; Deposit HEALTH to treasury
    (begin
        (let
            (
                (depositor tx-sender)
            )
            (contract-call? .health-token transfer amount depositor (as-contract tx-sender))
            (let
                (
                    (current-bal (default-to u0 (map-get? treasury-balances {asset: .health-token})))
                )
                (map-set treasury-balances {asset: .health-token} (+ current-bal amount))
                (ok true)
            )
        )
    )
)

(define-public (fund-rewards (amount uint))
    ;; Governance-executed: Transfer to reward distributor
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-unauthorized)  ;; Or check governance execution
        (let
            (
                (current-bal (default-to u0 (map-get? treasury-balances {asset: .health-token})))
            )
            (asserts! (>= current-bal amount) err-insufficient-funds)
            (map-set treasury-balances {asset: .health-token} (- current-bal amount))
            (as-contract (contract-call? .reward-distributor fund-pool amount))
            (ok true)
        )
    )
)

(define-read-only (get-treasury-balance (asset principal))
    (default-to u0 (map-get? treasury-balances {asset: asset}))
)
```

## Deployment & Testing

1. **Setup**: Install Clarinet (`cargo install clarinet`). Create `Clarinet.toml` with contracts.
2. **Test Locally**: `clarinet integrate` – Write integration tests for flows (e.g., register → participate → claim).
3. **Deploy**: Use `clarinet deploy` to testnet, then mainnet via Hiro dashboard.
4. **dApp Integration**: Use stacks.js for frontend (React/Vue) to call contracts via wallet.

## Security Considerations

- **Audits**: Recommend external audit (e.g., via KDE).
- **Upgrades**: Use SIP-010 for upgradable contracts if needed.
- **Oracles**: For real data verification (e.g., clinical trial proof), integrate Chainlink on Stacks.
- **Risks**: Reentrancy mitigated by Clarity's atomic tx; stake slashing for bad actors (extend governance).

## Future Roadmap

- Add NFT badges for high-participation patients.
- Integrate with EHR systems via APIs.
- Cross-chain bridges for BTC incentives.

## License

MIT License. Contribute via GitHub.