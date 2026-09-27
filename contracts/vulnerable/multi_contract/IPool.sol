// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPool {
    function getReserves() external view returns (uint112 reserveCollateral, uint112 reserveDebt);
}
