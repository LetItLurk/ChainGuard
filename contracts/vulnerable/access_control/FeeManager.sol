// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Access-control fixture: privileged setters without an owner check.
contract FeeManager {
    address public owner;
    address public feeRecipient;
    uint256 public feeBps;

    constructor(address recipient) {
        owner = msg.sender;
        feeRecipient = recipient;
        feeBps = 30;
    }

    function setFeeRecipient(address recipient) external {
        feeRecipient = recipient;
    }

    function setFeeBps(uint256 newFeeBps) external {
        require(msg.sender == owner, "not owner");
        require(newFeeBps <= 1_000, "fee too high");
        feeBps = newFeeBps;
    }
}
