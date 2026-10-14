// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ProvenanceTracker
/// @notice Append-only, hash-chained provenance log of every event state transition.
///         Only the bound EventRegistry may append. Each entry extends a per-event
///         chain head: head_n = keccak256(head_{n-1}, id, from, to, actor, time, dataHash),
///         so any omitted or reordered entry in an off-chain copy of the history is detectable.
contract ProvenanceTracker {
    address public immutable registryDeployer;
    address public registry;

    mapping(uint256 => bytes32) public head;
    mapping(uint256 => uint32) public length;

    event Transition(
        uint256 indexed eventId,
        uint8 from,
        uint8 to,
        address indexed actor,
        uint64 time,
        bytes32 dataHash,
        bytes32 newHead
    );

    constructor() {
        registryDeployer = msg.sender;
    }

    /// @notice One-time binding to the EventRegistry.
    function bind(address registry_) external {
        require(msg.sender == registryDeployer && registry == address(0) && registry_ != address(0), "bind");
        registry = registry_;
    }

    function record(uint256 eventId, uint8 from, uint8 to, address actor, bytes32 dataHash) external {
        require(msg.sender == registry, "only registry");
        uint64 t = uint64(block.timestamp);
        bytes32 h = keccak256(abi.encode(head[eventId], eventId, from, to, actor, t, dataHash));
        head[eventId] = h;
        length[eventId]++;
        emit Transition(eventId, from, to, actor, t, dataHash, h);
    }
}
