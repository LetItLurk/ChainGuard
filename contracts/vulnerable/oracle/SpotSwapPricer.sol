// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @notice Oracle fixture: prices an asset from instantaneous AMM reserves.
contract SpotSwapPricer {
    IPair public immutable pair;

    constructor(address pair_) {
        pair = IPair(pair_);
    }

    function quote(uint256 amountIn) external view returns (uint256) {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        return (amountIn * reserve1) / reserve0;
    }
}
