// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Pays accrued ETH rewards to stakers.
contract RewardDistributor {
    address public immutable owner;
    mapping(address => uint256) public accrued;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() payable {
        owner = msg.sender;
    }

    function accrue(address account, uint256 amount) external onlyOwner {
        accrued[account] += amount;
    }

    function claim() external {
        uint256 reward = accrued[msg.sender];
        accrued[msg.sender] = 0;
        payable(msg.sender).send(reward);
    }
}
