// SPDX-License-Identifier: MIT
// Original (v1) prototype retained unchanged for the gas comparison in Table 7. Not used by the framework.
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract V1ProvenanceTracker is AccessControl {
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    struct Transition {
        uint256 timestamp;
        address verifier;
        string fromStatus;
        string toStatus;
        string decisionJustification;
    }

    mapping(uint256 => Transition[]) private eventTransitions;

    event TransitionLogged(
        uint256 indexed eventID,
        address indexed verifier,
        string fromStatus,
        string toStatus,
        string decisionJustification
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function logTransition(
        uint256 _eventID,
        string calldata _from,
        string calldata _to,
        address _verifier,
        string calldata _justification
    ) external onlyRole(REGISTRY_ROLE) {
        eventTransitions[_eventID].push(
            Transition({
                timestamp: block.timestamp,
                verifier: _verifier,
                fromStatus: _from,
                toStatus: _to,
                decisionJustification: _justification
            })
        );

        emit TransitionLogged(_eventID, _verifier, _from, _to, _justification);
    }

    function getAuditTrail(uint256 _eventID) external view returns (Transition[] memory) {
        return eventTransitions[_eventID];
    }
}
