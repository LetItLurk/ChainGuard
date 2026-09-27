// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SpotPriceOracle} from "./SpotPriceOracle.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice ETH-collateralised lending vault that issues a debt token.
contract LendingVault {
    uint256 public constant COLLATERAL_FACTOR_BPS = 7_500;

    SpotPriceOracle public immutable oracle;
    IERC20 public immutable debtToken;

    mapping(address => uint256) public collateral;
    mapping(address => uint256) public debt;

    constructor(address oracle_, address debtToken_) {
        oracle = SpotPriceOracle(oracle_);
        debtToken = IERC20(debtToken_);
    }

    function depositCollateral() external payable {
        collateral[msg.sender] += msg.value;
    }

    function collateralValue(address account) public view returns (uint256) {
        return (collateral[account] * oracle.getPrice()) / 1e18;
    }

    function maxBorrow(address account) public view returns (uint256) {
        return (collateralValue(account) * COLLATERAL_FACTOR_BPS) / 10_000;
    }

    function borrow(uint256 amount) external {
        require(debt[msg.sender] + amount <= maxBorrow(msg.sender), "insufficient collateral");
        debt[msg.sender] += amount;
        require(debtToken.transfer(msg.sender, amount), "transfer failed");
    }

    function withdrawCollateral(uint256 amount) external {
        require(collateral[msg.sender] >= amount, "insufficient collateral");
        uint256 remainingValue = ((collateral[msg.sender] - amount) * oracle.getPrice()) / 1e18;
        require(debt[msg.sender] <= (remainingValue * COLLATERAL_FACTOR_BPS) / 10_000, "undercollateralized");

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");

        collateral[msg.sender] -= amount;
    }
}
