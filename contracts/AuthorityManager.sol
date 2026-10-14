// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title AuthorityManager
/// @notice Registry of institutional authorities, edge gateways and sensing devices.
///         Membership changes are themselves governed by a kGov-of-m approval rule,
///         so no single administrator can add, revoke or re-parameterise authorities.
///         Every membership change advances an epoch; events are bound to the epoch
///         in which they were reported, which fixes the eligible verifier set (m).
contract AuthorityManager {
    uint8 public constant ROLE_REPORTER = 1; // edge gateway
    uint8 public constant ROLE_VERIFIER = 2; // agency that votes on events
    uint8 public constant ROLE_ACTOR = 4; // agency that may action, close or break glass

    uint32 private constant NEVER = type(uint32).max;

    struct Member {
        uint8 roles;
        uint32 activeFrom; // first epoch in which the member is active
        uint32 revokedAt; // epoch at which membership was revoked (NEVER if active)
    }

    struct Device {
        address gateway; // gateway the device is bound to
        bool active;
    }

    enum Kind {
        ADD_MEMBER,
        REVOKE_MEMBER,
        ADD_DEVICE,
        REVOKE_DEVICE,
        SET_THRESHOLD,
        SET_GOV_THRESHOLD
    }

    struct Proposal {
        Kind kind;
        address target;
        address aux; // gateway for ADD_DEVICE
        uint8 roles;
        uint16 value; // threshold for SET_* proposals
        uint16 approvals;
        bool executed;
    }

    uint32 public epoch;
    uint16 public k; // verification threshold
    uint16 public kGov; // governance threshold
    uint16 public verifierCount; // active verifiers in the current epoch

    mapping(address => Member) public members;
    mapping(address => Device) public devices;
    mapping(uint32 => uint16) public verifierCountAt; // epoch => m

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public approvedBy;

    event MemberChanged(address indexed member, uint8 roles, bool active, uint32 epoch);
    event DeviceChanged(address indexed device, address indexed gateway, bool active);
    event ThresholdChanged(uint16 k, uint16 kGov, uint32 epoch);
    event ProposalCreated(uint256 indexed id, Kind kind, address indexed target, address indexed proposer);
    event ProposalApproved(uint256 indexed id, address indexed approver, uint16 approvals);
    event ProposalExecuted(uint256 indexed id);

    error NotGovernor();
    error AlreadyApproved();
    error AlreadyExecuted();
    error InvalidThreshold();
    error InvalidProposal();

    /// @dev The deployer bootstraps the initial consortium and retains no privileges.
    constructor(
        address[] memory initialMembers,
        uint8[] memory initialRoles,
        address[] memory initialDevices,
        address[] memory deviceGateways,
        uint16 k_,
        uint16 kGov_
    ) {
        require(initialMembers.length == initialRoles.length, "length");
        require(initialDevices.length == deviceGateways.length, "length");
        for (uint256 i = 0; i < initialMembers.length; i++) {
            members[initialMembers[i]] = Member(initialRoles[i], 0, NEVER);
            if (initialRoles[i] & ROLE_VERIFIER != 0) verifierCount++;
            emit MemberChanged(initialMembers[i], initialRoles[i], true, 0);
        }
        for (uint256 i = 0; i < initialDevices.length; i++) {
            devices[initialDevices[i]] = Device(deviceGateways[i], true);
            emit DeviceChanged(initialDevices[i], deviceGateways[i], true);
        }
        if (k_ == 0 || k_ > verifierCount || kGov_ == 0 || kGov_ > verifierCount) revert InvalidThreshold();
        k = k_;
        kGov = kGov_;
        verifierCountAt[0] = verifierCount;
        emit ThresholdChanged(k_, kGov_, 0);
    }

    // ---------------------------------------------------------------- views

    function hasRole(address a, uint8 role) public view returns (bool) {
        Member memory mb = members[a];
        return mb.roles & role != 0 && mb.revokedAt == NEVER && mb.activeFrom <= epoch;
    }

    /// @notice A verifier may vote on an event of epoch `e` if it belonged to the
    ///         eligible set of that epoch and has not been revoked since.
    function isEligibleVerifier(address a, uint32 e) external view returns (bool) {
        Member memory mb = members[a];
        return mb.roles & ROLE_VERIFIER != 0 && mb.activeFrom <= e && mb.revokedAt == NEVER;
    }

    function isActiveDevice(address device, address gateway) external view returns (bool) {
        Device memory d = devices[device];
        return d.active && d.gateway == gateway;
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    // ----------------------------------------------------------- governance

    modifier onlyGovernor() {
        if (!hasRole(msg.sender, ROLE_VERIFIER)) revert NotGovernor();
        _;
    }

    function propose(Kind kind, address target, address aux, uint8 roles, uint16 value)
        external
        onlyGovernor
        returns (uint256 id)
    {
        if (kind == Kind.ADD_MEMBER && (target == address(0) || roles == 0 || members[target].roles != 0)) {
            revert InvalidProposal();
        }
        id = proposals.length;
        proposals.push(Proposal(kind, target, aux, roles, value, 0, false));
        emit ProposalCreated(id, kind, target, msg.sender);
        _approve(id);
    }

    function approve(uint256 id) external onlyGovernor {
        _approve(id);
    }

    function _approve(uint256 id) internal {
        Proposal storage p = proposals[id];
        if (p.executed) revert AlreadyExecuted();
        if (approvedBy[id][msg.sender]) revert AlreadyApproved();
        approvedBy[id][msg.sender] = true;
        p.approvals++;
        emit ProposalApproved(id, msg.sender, p.approvals);
        if (p.approvals >= kGov) _execute(id, p);
    }

    function _execute(uint256 id, Proposal storage p) internal {
        p.executed = true;
        if (p.kind == Kind.ADD_MEMBER) {
            epoch++;
            members[p.target] = Member(p.roles, epoch, NEVER);
            if (p.roles & ROLE_VERIFIER != 0) verifierCount++;
            emit MemberChanged(p.target, p.roles, true, epoch);
        } else if (p.kind == Kind.REVOKE_MEMBER) {
            Member storage mb = members[p.target];
            if (mb.revokedAt != NEVER || mb.roles == 0) revert InvalidProposal();
            epoch++;
            mb.revokedAt = epoch;
            if (mb.roles & ROLE_VERIFIER != 0) {
                verifierCount--;
                if (verifierCount < k || verifierCount < kGov) revert InvalidThreshold();
            }
            emit MemberChanged(p.target, mb.roles, false, epoch);
        } else if (p.kind == Kind.ADD_DEVICE) {
            devices[p.target] = Device(p.aux, true);
            emit DeviceChanged(p.target, p.aux, true);
        } else if (p.kind == Kind.REVOKE_DEVICE) {
            devices[p.target].active = false;
            emit DeviceChanged(p.target, devices[p.target].gateway, false);
        } else if (p.kind == Kind.SET_THRESHOLD) {
            if (p.value == 0 || p.value > verifierCount) revert InvalidThreshold();
            epoch++;
            k = p.value;
            emit ThresholdChanged(k, kGov, epoch);
        } else {
            if (p.value == 0 || p.value > verifierCount) revert InvalidThreshold();
            kGov = p.value;
            emit ThresholdChanged(k, kGov, epoch);
        }
        verifierCountAt[epoch] = verifierCount;
        emit ProposalExecuted(id);
    }
}
