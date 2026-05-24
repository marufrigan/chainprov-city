// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AuthorityManager is Ownable {
    struct Authority {
        bool authorized;
        string role;
    }

    mapping(address => Authority) private authorities;
    uint256 public totalAuthorities;

    event AuthorityAdded(address indexed authority, string role);
    event AuthorityRemoved(address indexed authority);

    constructor() {}

    function addAuthority(address _authority, string calldata _role) external onlyOwner {
        require(_authority != address(0), "Invalid authority");
        require(bytes(_role).length > 0, "Invalid role");
        require(!authorities[_authority].authorized, "Authority already exists");

        authorities[_authority] = Authority({authorized: true, role: _role});
        unchecked {
            totalAuthorities += 1;
        }

        emit AuthorityAdded(_authority, _role);
    }

    function removeAuthority(address _authority) external onlyOwner {
        require(authorities[_authority].authorized, "Authority not found");

        delete authorities[_authority];
        unchecked {
            totalAuthorities -= 1;
        }

        emit AuthorityRemoved(_authority);
    }

    function isAuthorized(address _authority) external view returns (bool, string memory role) {
        Authority storage authority = authorities[_authority];
        return (authority.authorized, authority.role);
    }
}
