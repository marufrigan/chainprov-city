// SPDX-License-Identifier: MIT
// Original (v1) prototype retained unchanged for the gas comparison in Table 7. Not used by the framework.
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IV1AuthorityManager {
    function isAuthorized(address _authority) external view returns (bool, string memory role);
    function totalAuthorities() external view returns (uint256);
}

interface IV1ProvenanceTracker {
    function logTransition(
        uint256 _eventID,
        string calldata _from,
        string calldata _to,
        address _verifier,
        string calldata _justification
    ) external;
}

contract V1EventRegistry is Ownable, ReentrancyGuard {
    // Implements k-of-m threshold from Section 5.2
    enum EventStatus {
        REPORTED,
        UNDER_REVIEW,
        VERIFIED,
        REJECTED,
        DISPUTED,
        ACTIONED,
        CLOSED
    }

    struct EventData {
        bytes32 eventHash;
        string contentCID;
        string metadata;
        address submitter;
        uint256 timestamp;
        EventStatus status;
        uint8 approvalCount;
        uint8 rejectionCount;
    }

    uint256 public eventCounter;
    uint256 public thresholdK;
    address public authorityManager;
    address public provenanceTracker;

    mapping(uint256 => EventData) private eventsData;
    mapping(uint256 => mapping(address => bool)) private hasVoted;

    event EventReported(uint256 indexed eventID, bytes32 indexed eventHash, address indexed submitter);
    event VoteSubmitted(uint256 indexed eventID, address indexed verifier, bool isApproval, string justification);
    event EventVerified(uint256 indexed eventID, address indexed verifier);
    event EventRejected(uint256 indexed eventID, address indexed verifier);
    event EventStatusChanged(uint256 indexed eventID, EventStatus fromStatus, EventStatus toStatus);
    event ProvenanceTrackerUpdated(address indexed tracker);

    constructor(address _authorityManager, uint256 _thresholdK) {
        require(_authorityManager != address(0), "Invalid authority manager");
        require(_thresholdK > 0, "Invalid threshold");
        authorityManager = _authorityManager;
        thresholdK = _thresholdK;
    }

    function setProvenanceTracker(address _provenanceTracker) external onlyOwner {
        require(_provenanceTracker != address(0), "Invalid tracker");
        provenanceTracker = _provenanceTracker;
        emit ProvenanceTrackerUpdated(_provenanceTracker);
    }

    function reportEvent(
        bytes32 _eventHash,
        string calldata _contentCID,
        string calldata _metadata
    ) external returns (uint256 eventID) {
        require(_eventHash != bytes32(0), "Invalid event hash");
        require(bytes(_contentCID).length > 0, "Invalid content CID");

        eventID = ++eventCounter;
        EventData storage item = eventsData[eventID];
        item.eventHash = _eventHash;
        item.contentCID = _contentCID;
        item.metadata = _metadata;
        item.submitter = msg.sender;
        item.timestamp = block.timestamp;
        item.status = EventStatus.REPORTED;

        emit EventReported(eventID, _eventHash, msg.sender);
    }

    function submitVote(
        uint256 _eventID,
        bool _isApproval,
        string calldata _justification
    ) external nonReentrant {
        EventData storage item = eventsData[_eventID];
        require(item.timestamp != 0, "Event does not exist");

        (bool authorized, ) = IV1AuthorityManager(authorityManager).isAuthorized(msg.sender);
        require(authorized, "Not authorized verifier");
        require(!hasVoted[_eventID][msg.sender], "Already voted");

        if (item.status == EventStatus.VERIFIED || item.status == EventStatus.CLOSED) {
            revert("Event already finalized");
        }
        if (item.status != EventStatus.REPORTED && item.status != EventStatus.UNDER_REVIEW) {
            revert("Event not in reviewable state");
        }

        EventStatus oldStatus = item.status;
        if (item.status == EventStatus.REPORTED) {
            item.status = EventStatus.UNDER_REVIEW;
            emit EventStatusChanged(_eventID, oldStatus, EventStatus.UNDER_REVIEW);
            _logTransition(_eventID, oldStatus, EventStatus.UNDER_REVIEW, msg.sender, "Moved to review");
        }

        hasVoted[_eventID][msg.sender] = true;
        if (_isApproval) {
            unchecked {
                item.approvalCount += 1;
            }
        } else {
            unchecked {
                item.rejectionCount += 1;
            }
        }
        emit VoteSubmitted(_eventID, msg.sender, _isApproval, _justification);

        // k-of-m threshold check
        if (item.approvalCount >= thresholdK) {
            EventStatus fromStatus = item.status;
            item.status = EventStatus.VERIFIED;
            emit EventVerified(_eventID, msg.sender);
            emit EventStatusChanged(_eventID, fromStatus, EventStatus.VERIFIED);
            _logTransition(_eventID, fromStatus, EventStatus.VERIFIED, msg.sender, _justification);
            return;
        }

        uint256 total = IV1AuthorityManager(authorityManager).totalAuthorities();
        uint256 rejectionBoundary = total - thresholdK;
        // Use >= for deterministic early finalization in tests and deployments.
        if (item.rejectionCount >= rejectionBoundary) {
            EventStatus fromStatusRejected = item.status;
            item.status = EventStatus.REJECTED;
            emit EventRejected(_eventID, msg.sender);
            emit EventStatusChanged(_eventID, fromStatusRejected, EventStatus.REJECTED);
            _logTransition(_eventID, fromStatusRejected, EventStatus.REJECTED, msg.sender, _justification);
        }
    }

    function getEvent(
        uint256 _eventID
    )
        external
        view
        returns (
            bytes32 eventHash,
            string memory contentCID,
            string memory metadata,
            address submitter,
            uint256 timestamp,
            EventStatus status,
            uint8 approvalCount,
            uint8 rejectionCount
        )
    {
        EventData storage item = eventsData[_eventID];
        require(item.timestamp != 0, "Event does not exist");
        return (
            item.eventHash,
            item.contentCID,
            item.metadata,
            item.submitter,
            item.timestamp,
            item.status,
            item.approvalCount,
            item.rejectionCount
        );
    }

    function hasAuthorityVoted(uint256 _eventID, address _authority) external view returns (bool) {
        return hasVoted[_eventID][_authority];
    }

    function _logTransition(
        uint256 _eventID,
        EventStatus _from,
        EventStatus _to,
        address _verifier,
        string memory _justification
    ) internal {
        if (provenanceTracker == address(0)) {
            return;
        }

        IV1ProvenanceTracker(provenanceTracker).logTransition(
            _eventID,
            _statusToString(_from),
            _statusToString(_to),
            _verifier,
            _justification
        );
    }

    function _statusToString(EventStatus _status) internal pure returns (string memory) {
        if (_status == EventStatus.REPORTED) return "REPORTED";
        if (_status == EventStatus.UNDER_REVIEW) return "UNDER_REVIEW";
        if (_status == EventStatus.VERIFIED) return "VERIFIED";
        if (_status == EventStatus.REJECTED) return "REJECTED";
        if (_status == EventStatus.DISPUTED) return "DISPUTED";
        if (_status == EventStatus.ACTIONED) return "ACTIONED";
        return "CLOSED";
    }
}
