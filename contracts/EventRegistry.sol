// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AuthorityManager.sol";
import "./ProvenanceTracker.sol";

/// @title EventRegistry
/// @notice Registration and k-of-m threshold adjudication of smart-city events.
///         States are ordered so that every legal transition strictly increases the
///         state rank (enum index), which gives the monotonic-progress invariant.
contract EventRegistry {
    enum State {
        REPORTED, // 0
        UNDER_REVIEW, // 1
        DISPUTED, // 2
        VERIFIED, // 3
        REJECTED, // 4 (terminal)
        ACTIONED, // 5
        CLOSED // 6 (terminal)
    }

    enum Outcome {
        NONE,
        RESOLVED,
        FALSE_ALARM,
        EXPIRED
    }

    uint8 public constant SEVERITY_CRITICAL = 3;
    bytes32 public constant DOMAIN_TAG = keccak256("ChainProv-City/Event/v1");

    struct EventRecord {
        bytes32 commitment; // C_i, canonical SHA-256 commitment
        bytes32 cid; // digest of the CIDv1 of the encrypted evidence object
        address device; // source device that signed C_i
        address gateway; // reporting gateway
        uint64 reportedAt;
        uint64 deadline; // end of the current review window
        uint32 epoch; // authority epoch at registration
        uint16 m; // eligible verifiers at registration
        uint16 k; // approval threshold at registration
        uint16 approvals;
        uint16 rejections;
        State state;
        Outcome outcome;
        uint8 severity;
        address provisionalActor; // set if break-glass was used
    }

    AuthorityManager public immutable authorities;
    ProvenanceTracker public immutable provenance;
    uint64 public immutable reviewWindow;
    uint64 public immutable escalationWindow;
    uint64 public immutable maxCaptureAge;
    uint64 public constant MAX_CLOCK_SKEW = 30;

    uint256 public eventCount;
    mapping(uint256 => EventRecord) private events;
    mapping(uint256 => mapping(address => uint8)) public voteOf; // 0 none, 1 approve, 2 reject
    mapping(bytes32 => bool) public commitmentUsed;
    mapping(bytes32 => bool) public contentSeen;

    event EventReported(uint256 indexed id, bytes32 indexed commitment, address indexed device, bytes32 cid, uint8 severity);
    event VoteCast(uint256 indexed id, address indexed authority, bool approve, bytes32 justification);
    event StateChanged(uint256 indexed id, State from, State to, Outcome outcome);
    event BreakGlass(uint256 indexed id, address indexed actor, bytes32 reason);

    error Unauthorized();
    error BadSignature();
    error Duplicate();
    error ReplayedContent();
    error StaleOrFutureCapture();
    error InvalidState();
    error AlreadyVoted();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error NotCritical();

    struct Report {
        bytes32 contentDigest; // SHA-256 of the plaintext evidence d_i
        bytes32 cid;
        bytes32 metaHash; // SHA-256 of canonical metadata m_i
        uint64 capturedAt; // t_i
        address device; // s_i
        uint8 severity;
        bytes signature; // device signature over C_i
    }

    constructor(
        AuthorityManager authorities_,
        ProvenanceTracker provenance_,
        uint64 reviewWindow_,
        uint64 escalationWindow_,
        uint64 maxCaptureAge_
    ) {
        authorities = authorities_;
        provenance = provenance_;
        reviewWindow = reviewWindow_;
        escalationWindow = escalationWindow_;
        maxCaptureAge = maxCaptureAge_;
    }

    // ------------------------------------------------------------ helpers

    function getRecord(uint256 id) external view returns (EventRecord memory) {
        return events[id];
    }

    /// @notice Canonical event commitment C_i (fixed-width ABI encoding, domain separated).
    function commitmentOf(
        bytes32 contentDigest,
        uint64 capturedAt,
        address device,
        bytes32 metaHash,
        uint8 severity
    ) public view returns (bytes32) {
        return sha256(abi.encode(DOMAIN_TAG, block.chainid, contentDigest, capturedAt, device, metaHash, severity));
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        // reject malleable signatures (EIP-2)
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        return ecrecover(ethHash, v, r, s);
    }

    function _transition(uint256 id, EventRecord storage e, State to, bytes32 dataHash) internal {
        State from = e.state;
        e.state = to;
        emit StateChanged(id, from, to, e.outcome);
        provenance.record(id, uint8(from), uint8(to), msg.sender, dataHash);
    }

    // ------------------------------------------------------------ reporting

    struct Snapshot {
        uint32 epoch;
        uint16 m;
        uint16 k;
    }

    function _snapshot() internal view returns (Snapshot memory) {
        return Snapshot(authorities.epoch(), authorities.verifierCount(), authorities.k());
    }

    function reportEvent(Report calldata r) external returns (uint256) {
        if (!authorities.hasRole(msg.sender, authorities.ROLE_REPORTER())) revert Unauthorized();
        return _report(r, _snapshot());
    }

    /// @notice Registers several events in one transaction (amortises base cost).
    function reportBatch(Report[] calldata rs) external returns (uint256 firstId) {
        if (!authorities.hasRole(msg.sender, authorities.ROLE_REPORTER())) revert Unauthorized();
        firstId = eventCount + 1;
        Snapshot memory snap = _snapshot(); // authority set cannot change within a transaction
        for (uint256 i = 0; i < rs.length; i++) _report(rs[i], snap);
    }

    function _report(Report calldata r, Snapshot memory snap) internal returns (uint256 id) {
        if (!authorities.isActiveDevice(r.device, msg.sender)) revert Unauthorized();
        if (r.capturedAt > block.timestamp + MAX_CLOCK_SKEW || r.capturedAt + maxCaptureAge < block.timestamp) {
            revert StaleOrFutureCapture();
        }
        bytes32 c = commitmentOf(r.contentDigest, r.capturedAt, r.device, r.metaHash, r.severity);
        if (_recover(c, r.signature) != r.device) revert BadSignature();
        if (commitmentUsed[c]) revert Duplicate();
        if (contentSeen[r.contentDigest]) revert ReplayedContent();
        commitmentUsed[c] = true;
        contentSeen[r.contentDigest] = true;

        id = ++eventCount;
        EventRecord storage e = events[id];
        e.commitment = c;
        e.cid = r.cid;
        e.device = r.device;
        e.gateway = msg.sender;
        e.reportedAt = uint64(block.timestamp);
        e.deadline = uint64(block.timestamp) + reviewWindow;
        e.epoch = snap.epoch;
        e.m = snap.m;
        e.k = snap.k;
        e.severity = r.severity;
        emit EventReported(id, c, r.device, r.cid, r.severity);
        provenance.record(id, uint8(State.REPORTED), uint8(State.REPORTED), msg.sender, c);
    }

    // ------------------------------------------------------------ adjudication

    function submitVote(uint256 id, bool approve, bytes32 justification) external {
        EventRecord storage e = events[id];
        if (e.state != State.REPORTED && e.state != State.UNDER_REVIEW && e.state != State.DISPUTED) {
            revert InvalidState();
        }
        if (block.timestamp > e.deadline) revert DeadlinePassed();
        if (!authorities.isEligibleVerifier(msg.sender, e.epoch)) revert Unauthorized();
        if (voteOf[id][msg.sender] != 0) revert AlreadyVoted();

        voteOf[id][msg.sender] = approve ? 1 : 2;
        if (approve) e.approvals++;
        else e.rejections++;
        emit VoteCast(id, msg.sender, approve, justification);

        if (e.approvals >= e.k) {
            _transition(id, e, State.VERIFIED, justification);
        } else if (e.rejections > e.m - e.k) {
            // k approvals are no longer reachable
            e.outcome = Outcome.FALSE_ALARM;
            _transition(id, e, State.REJECTED, justification);
        } else if (e.state == State.REPORTED) {
            _transition(id, e, State.UNDER_REVIEW, justification);
        }
    }

    /// @notice Callable by anyone after a deadline. First expiry escalates to DISPUTED
    ///         with a fresh window; expiry of the escalation window fails safe to REJECTED.
    function finalizeTimeout(uint256 id) external {
        EventRecord storage e = events[id];
        if (block.timestamp <= e.deadline) revert DeadlineNotPassed();
        if (e.state == State.REPORTED || e.state == State.UNDER_REVIEW) {
            e.deadline = uint64(block.timestamp) + escalationWindow;
            _transition(id, e, State.DISPUTED, bytes32(0));
        } else if (e.state == State.DISPUTED) {
            e.outcome = Outcome.EXPIRED;
            _transition(id, e, State.REJECTED, bytes32(0));
        } else {
            revert InvalidState();
        }
    }

    /// @notice Risk-tiered emergency path: an authorised actor may start a provisional
    ///         response to a CRITICAL event before the threshold is met. The state is not
    ///         changed; the action is recorded and remains subject to k-of-m ratification.
    function breakGlass(uint256 id, bytes32 reason) external {
        if (!authorities.hasRole(msg.sender, authorities.ROLE_ACTOR())) revert Unauthorized();
        EventRecord storage e = events[id];
        if (e.state != State.REPORTED && e.state != State.UNDER_REVIEW && e.state != State.DISPUTED) {
            revert InvalidState();
        }
        if (e.severity != SEVERITY_CRITICAL) revert NotCritical();
        if (e.provisionalActor != address(0)) revert Duplicate();
        e.provisionalActor = msg.sender;
        emit BreakGlass(id, msg.sender, reason);
        provenance.record(id, uint8(e.state), uint8(e.state), msg.sender, reason);
    }

    // ------------------------------------------------------------ response

    function actionEvent(uint256 id, bytes32 ref) external {
        if (!authorities.hasRole(msg.sender, authorities.ROLE_ACTOR())) revert Unauthorized();
        EventRecord storage e = events[id];
        if (e.state != State.VERIFIED) revert InvalidState();
        _transition(id, e, State.ACTIONED, ref);
    }

    function closeEvent(uint256 id, bool falseAlarm, bytes32 report) external {
        if (!authorities.hasRole(msg.sender, authorities.ROLE_ACTOR())) revert Unauthorized();
        EventRecord storage e = events[id];
        if (e.state != State.ACTIONED) revert InvalidState();
        e.outcome = falseAlarm ? Outcome.FALSE_ALARM : Outcome.RESOLVED;
        _transition(id, e, State.CLOSED, report);
    }
}
