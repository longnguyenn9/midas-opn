// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRepOracle} from "./interfaces/IRepOracle.sol";

/// @title MidasVault
/// @notice Stake an OPN loyalty token (e.g. NeoPoints) to earn a streamed reward token.
///         A staker's effective weight is boosted by their on-chain REP score, so
///         reputable OPN identities earn a larger share of the same reward stream.
/// @dev Reward accounting follows the Synthetix StakingRewards pattern, but per-account
///      balances are scaled into "boosted" units. The global accumulator therefore tracks
///      reward-per-boosted-token rather than reward-per-raw-token.
contract MidasVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* --------------------------------- Errors -------------------------------- */
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();
    error RewardTooHigh();
    error RewardPeriodActive();

    /* --------------------------------- Events -------------------------------- */
    event Staked(address indexed account, uint256 amount, uint256 boostedAmount);
    event Withdrawn(address indexed account, uint256 amount, uint256 boostedAmount);
    event RewardPaid(address indexed account, uint256 reward);
    event RewardAdded(uint256 reward, uint256 duration);
    event BoostRefreshed(address indexed account, uint256 oldBoosted, uint256 newBoosted);
    event RepOracleUpdated(address indexed oracle);

    /* -------------------------------- Constants ------------------------------ */
    /// @dev Boost math is expressed in basis points (1e4 = 1x). 100 REP => +1 bp of boost.
    uint256 public constant BPS = 10_000;
    /// @dev Hard ceiling on the multiplier so a whale-REP account can't drain the stream.
    uint256 public constant MAX_BOOST_BPS = 25_000; // 2.5x
    /// @dev REP points required per 1 bp of boost above the 1x base.
    uint256 public constant REP_PER_BP = 100;

    /* --------------------------------- State --------------------------------- */
    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;
    IRepOracle public repOracle;

    uint256 public rewardRate;          // reward tokens distributed per second
    uint256 public periodFinish;        // timestamp the current stream ends
    uint256 public lastUpdateTime;      // last time reward accounting ran
    uint256 public rewardPerBoostedStored; // accumulated reward per boosted token (scaled 1e18)

    uint256 public totalBoosted;        // sum of all boosted balances

    mapping(address => uint256) public balanceOf;        // raw staked amount
    mapping(address => uint256) public boostedBalanceOf; // REP-scaled amount
    mapping(address => uint256) public userRewardPerBoostedPaid;
    mapping(address => uint256) public rewards;          // accrued, unclaimed reward

    constructor(
        address stakingToken_,
        address rewardToken_,
        address repOracle_,
        address owner_
    ) Ownable(owner_) {
        if (stakingToken_ == address(0) || rewardToken_ == address(0) || repOracle_ == address(0)) {
            revert ZeroAddress();
        }
        stakingToken = IERC20(stakingToken_);
        rewardToken = IERC20(rewardToken_);
        repOracle = IRepOracle(repOracle_);
    }

    /* ------------------------------ Reward math ------------------------------ */

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerBoosted() public view returns (uint256) {
        if (totalBoosted == 0) {
            return rewardPerBoostedStored;
        }
        uint256 elapsed = lastTimeRewardApplicable() - lastUpdateTime;
        return rewardPerBoostedStored + (elapsed * rewardRate * 1e18) / totalBoosted;
    }

    /// @notice Reward earned by `account` but not yet claimed.
    function earned(address account) public view returns (uint256) {
        uint256 delta = rewardPerBoosted() - userRewardPerBoostedPaid[account];
        return (boostedBalanceOf[account] * delta) / 1e18 + rewards[account];
    }

    /* --------------------------------- Boost --------------------------------- */

    /// @notice Effective boost multiplier for `account`, in basis points (>= 1x).
    function boostBps(address account) public view returns (uint256) {
        uint256 score = repOracle.repOf(account);
        uint256 bps = BPS + (score / REP_PER_BP);
        return bps > MAX_BOOST_BPS ? MAX_BOOST_BPS : bps;
    }

    function _boostedFor(address account, uint256 rawAmount) internal view returns (uint256) {
        return (rawAmount * boostBps(account)) / BPS;
    }

    /* ------------------------------- Modifiers ------------------------------- */

    modifier updateReward(address account) {
        rewardPerBoostedStored = rewardPerBoosted();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerBoostedPaid[account] = rewardPerBoostedStored;
        }
        _;
    }

    /* ----------------------------- User actions ------------------------------ */

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();

        // Recompute this user's boosted balance from scratch at the current REP score.
        uint256 oldBoosted = boostedBalanceOf[msg.sender];
        uint256 newRaw = balanceOf[msg.sender] + amount;
        uint256 newBoosted = _boostedFor(msg.sender, newRaw);

        balanceOf[msg.sender] = newRaw;
        boostedBalanceOf[msg.sender] = newBoosted;
        totalBoosted = totalBoosted - oldBoosted + newBoosted;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, newBoosted);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        uint256 raw = balanceOf[msg.sender];
        if (amount > raw) revert InsufficientBalance();

        uint256 oldBoosted = boostedBalanceOf[msg.sender];
        uint256 newRaw = raw - amount;
        uint256 newBoosted = _boostedFor(msg.sender, newRaw);

        balanceOf[msg.sender] = newRaw;
        boostedBalanceOf[msg.sender] = newBoosted;
        totalBoosted = totalBoosted - oldBoosted + newBoosted;

        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, newBoosted);
    }

    function claim() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(balanceOf[msg.sender]);
        claim();
    }

    /// @notice Re-sync the caller's boost to their latest REP score without changing stake.
    /// @dev REP can change over time; this lets a staker realise a higher boost (or forces
    ///      a stale high boost down) without depositing more. Must settle rewards first.
    function refreshBoost() external nonReentrant updateReward(msg.sender) {
        uint256 oldBoosted = boostedBalanceOf[msg.sender];
        uint256 newBoosted = _boostedFor(msg.sender, balanceOf[msg.sender]);
        if (newBoosted != oldBoosted) {
            boostedBalanceOf[msg.sender] = newBoosted;
            totalBoosted = totalBoosted - oldBoosted + newBoosted;
            emit BoostRefreshed(msg.sender, oldBoosted, newBoosted);
        }
    }

    /* -------------------------------- Admin ---------------------------------- */

    /// @notice Fund a new reward stream of `reward` tokens over `duration` seconds.
    /// @dev Caller must transfer `reward` tokens to this contract before/with this call.
    function notifyRewardAmount(uint256 reward, uint256 duration)
        external
        onlyOwner
        updateReward(address(0))
    {
        if (duration == 0) revert ZeroAmount();

        if (block.timestamp >= periodFinish) {
            rewardRate = reward / duration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / duration;
        }

        // Guard against rounding leaving the contract unable to pay the promised rate.
        uint256 balance = rewardToken.balanceOf(address(this));
        if (rewardRate > balance / duration) revert RewardTooHigh();

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit RewardAdded(reward, duration);
    }

    function setRepOracle(address oracle) external onlyOwner {
        if (oracle == address(0)) revert ZeroAddress();
        repOracle = IRepOracle(oracle);
        emit RepOracleUpdated(oracle);
    }

    /// @notice Recover tokens accidentally sent here. Cannot touch the staking token
    ///         (user principal) and cannot be used while a reward stream is live.
    function recoverERC20(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(stakingToken)) revert ZeroAddress();
        if (token == address(rewardToken) && block.timestamp < periodFinish) {
            revert RewardPeriodActive();
        }
        IERC20(token).safeTransfer(to, amount);
    }
}
