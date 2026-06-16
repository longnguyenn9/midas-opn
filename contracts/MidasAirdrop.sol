// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IRepOracle} from "./interfaces/IRepOracle.sol";

/// @title MidasAirdrop
/// @notice Distributes GOLD to eligible OPN wallets via a Merkle allowlist, with the claimable
///         amount boosted by the claimer's on-chain REP score. The same reputation signal that
///         powers MidasVault yield therefore also weights the airdrop: higher-REP NeoID holders
///         receive a larger multiple of their base allocation.
/// @dev The Merkle leaf commits only to (account, baseAmount). The boost is applied at claim time
///      from the live REP oracle, so the tree never needs to encode per-user multipliers and the
///      boost reflects reputation at the moment of claiming.
contract MidasAirdrop is Ownable {
    using SafeERC20 for IERC20;

    /* --------------------------------- Errors -------------------------------- */
    error ZeroAddress();
    error AlreadyClaimed();
    error InvalidProof();
    error ClaimWindowClosed();
    error ClaimWindowOpen();
    error NothingToSweep();

    /* --------------------------------- Events -------------------------------- */
    event Claimed(address indexed account, uint256 baseAmount, uint256 boostedAmount, uint256 boostBps);
    event RootUpdated(bytes32 root);
    event Swept(address indexed to, uint256 amount);

    /* -------------------------------- Constants ------------------------------ */
    /// @dev Boost math mirrors MidasVault: 1e4 = 1x, +1bp per 100 REP, capped at 2.5x.
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_BOOST_BPS = 25_000;
    uint256 public constant REP_PER_BP = 100;

    /* --------------------------------- State --------------------------------- */
    IERC20 public immutable token;
    IRepOracle public repOracle;
    bytes32 public merkleRoot;
    uint256 public immutable claimDeadline;

    mapping(address => bool) public hasClaimed;

    constructor(
        address token_,
        address repOracle_,
        bytes32 merkleRoot_,
        uint256 claimDeadline_,
        address owner_
    ) Ownable(owner_) {
        if (token_ == address(0) || repOracle_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        repOracle = IRepOracle(repOracle_);
        merkleRoot = merkleRoot_;
        claimDeadline = claimDeadline_;
    }

    /* ---------------------------------- Boost -------------------------------- */

    /// @notice REP-derived multiplier in basis points (>= 1x), identical curve to the vault.
    function boostBps(address account) public view returns (uint256) {
        uint256 score = repOracle.repOf(account);
        uint256 bps = BPS + (score / REP_PER_BP);
        return bps > MAX_BOOST_BPS ? MAX_BOOST_BPS : bps;
    }

    /// @notice Preview the GOLD `account` would receive for a given base allocation right now.
    function previewClaim(address account, uint256 baseAmount) external view returns (uint256) {
        return (baseAmount * boostBps(account)) / BPS;
    }

    /* ---------------------------------- Claim -------------------------------- */

    /// @notice Claim a REP-boosted GOLD allocation.
    /// @param baseAmount The base allocation committed in the Merkle leaf for msg.sender.
    /// @param proof Merkle proof for leaf = keccak256(abi.encodePacked(msg.sender, baseAmount)).
    function claim(uint256 baseAmount, bytes32[] calldata proof) external {
        if (block.timestamp > claimDeadline) revert ClaimWindowClosed();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, baseAmount))));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        hasClaimed[msg.sender] = true;

        uint256 bps = boostBps(msg.sender);
        uint256 boosted = (baseAmount * bps) / BPS;

        token.safeTransfer(msg.sender, boosted);
        emit Claimed(msg.sender, baseAmount, boosted, bps);
    }

    /* --------------------------------- Admin --------------------------------- */

    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
        emit RootUpdated(root);
    }

    function setRepOracle(address oracle) external onlyOwner {
        if (oracle == address(0)) revert ZeroAddress();
        repOracle = IRepOracle(oracle);
    }

    /// @notice Recover unclaimed GOLD after the claim window closes.
    function sweep(address to) external onlyOwner {
        if (block.timestamp <= claimDeadline) revert ClaimWindowOpen();
        uint256 bal = token.balanceOf(address(this));
        if (bal == 0) revert NothingToSweep();
        token.safeTransfer(to, bal);
        emit Swept(to, bal);
    }
}
