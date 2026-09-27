// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPool} from "./IPool.sol";

/// @notice Prices collateral from the spot reserves of a single AMM pool.
contract SpotPriceOracle {
    address public owner;
    IPool public pool;

    event PoolUpdated(address indexed previousPool, address indexed newPool);

    constructor(address initialPool) {
        owner = msg.sender;
        pool = IPool(initialPool);
    }

    function setPool(address newPool) external {
        emit PoolUpdated(address(pool), newPool);
        pool = IPool(newPool);
    }

    /// @return price Collateral price denominated in the debt asset, 18 decimals.
    function getPrice() external view returns (uint256 price) {
        (uint112 reserveCollateral, uint112 reserveDebt) = pool.getReserves();
        require(reserveCollateral > 0, "empty pool");
        price = (uint256(reserveDebt) * 1e18) / uint256(reserveCollateral);
    }
}
