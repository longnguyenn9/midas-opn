// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRepOracle} from "../interfaces/IRepOracle.sol";

/// @notice Test/testnet stand-in for the OPN native REP registry.
contract MockRepOracle is IRepOracle {
    mapping(address => uint256) private _rep;

    function setRep(address account, uint256 score) external {
        _rep[account] = score;
    }

    function repOf(address account) external view returns (uint256) {
        return _rep[account];
    }
}
