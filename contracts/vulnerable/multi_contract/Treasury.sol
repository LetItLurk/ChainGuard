// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Protocol fee treasury.
contract Treasury {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function sweep(address payable to) external {
        require(tx.origin == owner, "not owner");
        to.transfer(address(this).balance);
    }

    receive() external payable {}
}
