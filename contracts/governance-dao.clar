(define-constant ERR-NOT-REGISTERED u300)
(define-constant ERR-INSUFFICIENT-STAKE u301)
(define-constant ERR-VOTING-CLOSED u302)
(define-constant ERR-ALREADY-VOTED u303)
(define-constant ERR-PROPOSAL-NOT-FOUND u304)
(define-constant ERR-ALREADY-EXECUTED u305)
(define-constant ERR-PROPOSAL-REJECTED u306)
(define-constant ERR-INVALID-TITLE u307)
(define-constant ERR-INVALID-DESCRIPTION u308)
(define-constant ERR-INVALID-PROPOSAL-TYPE u309)
(define-constant ERR-INVALID-FUNDING-AMOUNT u310)
(define-constant ERR-INVALID-START-DELAY u311)
(define-constant ERR-INVALID-VOTING-DURATION u312)
(define-constant ERR-INVALID-QUORUM u313)
(define-constant ERR-INVALID-TARGET u314)
(define-constant ERR-NOT-AUTHORIZED u315)
(define-constant ERR-INVALID-UPDATE-PARAM u316)
(define-constant ERR-QUORUM-NOT-MET u317)
(define-constant ERR-INVALID-TIMESTAMP u318)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u319)
(define-constant ERR-INVALID-STATUS u320)

(define-data-var next-proposal-id uint u1)
(define-data-var max-proposals uint u1000)
(define-data-var proposal-creation-fee uint u1000)
(define-data-var min-stake-to-propose uint u1000)
(define-data-var default-voting-duration uint u144)
(define-data-var default-quorum-percent uint u50)
(define-data-var admin principal tx-sender)

(define-map proposals
  uint
  {
    title: (string-ascii 128),
    description: (string-ascii 512),
    proposal-type: (string-ascii 50),
    funding-amount: uint,
    start-delay: uint,
    voting-duration: uint,
    quorum-percent: uint,
    target: (optional principal),
    votes-for: uint,
    votes-against: uint,
    start-height: uint,
    executed: bool,
    creator: principal,
    status: (string-ascii 20)
  }
)

(define-map votes
  {proposal-id: uint, voter: principal}
  {voted-for: bool, weight: uint}
)

(define-map proposal-updates
  uint
  {
    update-title: (string-ascii 128),
    update-description: (string-ascii 512),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)

(define-read-only (get-vote (id uint) (voter principal))
  (map-get? votes {proposal-id: id, voter: voter})
)

(define-read-only (get-proposal-update (id uint))
  (map-get? proposal-updates id)
)

(define-read-only (get-proposal-count)
  (var-get next-proposal-id)
)

(define-private (validate-title (title (string-ascii 128)))
  (if (and (> (len title) u0) (<= (len title) u128))
    (ok true)
    (err ERR-INVALID-TITLE))
)

(define-private (validate-description (desc (string-ascii 512)))
  (if (and (> (len desc) u0) (<= (len desc) u512))
    (ok true)
    (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-proposal-type (ptype (string-ascii 50)))
  (if (or (is-eq ptype "funding") (is-eq ptype "policy") (is-eq ptype "upgrade"))
    (ok true)
    (err ERR-INVALID-PROPOSAL-TYPE))
)

(define-private (validate-funding-amount (amount uint))
  (if (> amount u0)
    (ok true)
    (err ERR-INVALID-FUNDING-AMOUNT))
)

(define-private (validate-start-delay (delay uint))
  (if (>= delay u0)
    (ok true)
    (err ERR-INVALID-START-DELAY))
)

(define-private (validate-voting-duration (duration uint))
  (if (> duration u0)
    (ok true)
    (err ERR-INVALID-VOTING-DURATION))
)

(define-private (validate-quorum (quorum uint))
  (if (and (> quorum u0) (<= quorum u100))
    (ok true)
    (err ERR-INVALID-QUORUM))
)

(define-private (validate-target (target (optional principal)))
  (match target
    t (if (not (is-eq t tx-sender))
        (ok true)
        (err ERR-INVALID-TARGET))
    (ok true))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP))
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-min-stake-to-propose (new-stake uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-stake u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set min-stake-to-propose new-stake)
    (ok true)
  )
)

(define-public (set-default-voting-duration (new-duration uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-voting-duration new-duration))
    (var-set default-voting-duration new-duration)
    (ok true)
  )
)

(define-public (set-default-quorum-percent (new-quorum uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-quorum new-quorum))
    (var-set default-quorum-percent new-quorum)
    (ok true)
  )
)

(define-public (set-proposal-creation-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set proposal-creation-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-proposals (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-proposals new-max)
    (ok true)
  )
)

(define-public (propose
  (title (string-ascii 128))
  (description (string-ascii 512))
  (ptype (string-ascii 50))
  (funding-amount uint)
  (start-delay uint)
  (voting-duration uint)
  (quorum uint)
  (target (optional principal))
)
  (let
    (
      (proposer tx-sender)
      (next-id (var-get next-proposal-id))
      (stake (contract-call? .health-token get-balance proposer))
      (patient-info (unwrap! (contract-call? .patient-registry get-patient-info proposer) (err ERR-NOT-REGISTERED)))
      (start-height (+ block-height start-delay))
    )
    (asserts! (< next-id (var-get max-proposals)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (asserts! (>= stake (var-get min-stake-to-propose)) (err ERR-INSUFFICIENT-STAKE))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-proposal-type ptype))
    (try! (validate-funding-amount funding-amount))
    (try! (validate-start-delay start-delay))
    (try! (validate-voting-duration voting-duration))
    (try! (validate-quorum quorum))
    (try! (validate-target target))
    (try! (stx-transfer? (var-get proposal-creation-fee) tx-sender (var-get admin)))
    (map-set proposals next-id
      {
        title: title,
        description: description,
        proposal-type: ptype,
        funding-amount: funding-amount,
        start-delay: start-delay,
        voting-duration: voting-duration,
        quorum-percent: quorum,
        target: target,
        votes-for: u0,
        votes-against: u0,
        start-height: start-height,
        executed: false,
        creator: proposer,
        status: "active"
      }
    )
    (var-set next-proposal-id (+ next-id u1))
    (print { event: "proposal-created", id: next-id })
    (ok next-id)
  )
)

(define-public (vote (proposal-id uint) (support bool))
  (let
    (
      (voter tx-sender)
      (proposal (unwrap! (map-get? proposals proposal-id) (err ERR-PROPOSAL-NOT-FOUND)))
      (current-height block-height)
      (end-height (+ (get start-height proposal) (get voting-duration proposal)))
      (stake (contract-call? .health-token get-balance voter))
      (weight (/ stake u1000))
      (existing-vote (map-get? votes {proposal-id: proposal-id, voter: voter}))
    )
    (asserts! (>= current-height (get start-height proposal)) (err ERR-VOTING-CLOSED))
    (asserts! (< current-height end-height) (err ERR-VOTING-CLOSED))
    (asserts! (is-none existing-vote) (err ERR-ALREADY-VOTED))
    (asserts! (not (get executed proposal)) (err ERR-ALREADY-EXECUTED))
    (if support
      (map-set proposals proposal-id
        (merge proposal { votes-for: (+ (get votes-for proposal) weight) })
      )
      (map-set proposals proposal-id
        (merge proposal { votes-against: (+ (get votes-against proposal) weight) })
      )
    )
    (map-set votes {proposal-id: proposal-id, voter: voter}
      { voted-for: support, weight: weight }
    )
    (print { event: "vote-cast", proposal-id: proposal-id, voter: voter, support: support })
    (ok true)
  )
)

(define-public (execute-proposal (proposal-id uint))
  (let
    (
      (proposal (unwrap! (map-get? proposals proposal-id) (err ERR-PROPOSAL-NOT-FOUND)))
      (current-height block-height)
      (end-height (+ (get start-height proposal) (get voting-duration proposal)))
      (total-votes (+ (get votes-for proposal) (get votes-against proposal)))
      (quorum-required (/ (* total-votes (get quorum-percent proposal)) u100))
    )
    (asserts! (>= current-height end-height) (err ERR-VOTING-CLOSED))
    (asserts! (not (get executed proposal)) (err ERR-ALREADY-EXECUTED))
    (asserts! (>= (get votes-for proposal) quorum-required) (err ERR-QUORUM-NOT-MET))
    (asserts! (> (get votes-for proposal) (get votes-against proposal)) (err ERR-PROPOSAL-REJECTED))
    (map-set proposals proposal-id
      (merge proposal { executed: true, status: "executed" })
    )
    (match (get proposal-type proposal)
      "funding" (try! (as-contract (contract-call? .treasury fund-rewards (get funding-amount proposal))))
      "policy" (ok true)
      "upgrade" (ok true)
      (err ERR-INVALID-PROPOSAL-TYPE)
    )
    (print { event: "proposal-executed", id: proposal-id })
    (ok true)
  )
)

(define-public (update-proposal
  (proposal-id uint)
  (new-title (string-ascii 128))
  (new-description (string-ascii 512))
)
  (let
    (
      (proposal (unwrap! (map-get? proposals proposal-id) (err ERR-PROPOSAL-NOT-FOUND)))
    )
    (asserts! (is-eq (get creator proposal) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (< block-height (get start-height proposal)) (err ERR-VOTING-CLOSED))
    (try! (validate-title new-title))
    (try! (validate-description new-description))
    (map-set proposals proposal-id
      (merge proposal { title: new-title, description: new-description })
    )
    (map-set proposal-updates proposal-id
      {
        update-title: new-title,
        update-description: new-description,
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (print { event: "proposal-updated", id: proposal-id })
    (ok true)
  )
)