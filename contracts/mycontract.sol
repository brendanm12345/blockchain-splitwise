// SPDX-License-Identifier: UNLICENSED

// DO NOT MODIFY BELOW THIS
pragma solidity ^0.8.17;

import "hardhat/console.sol";

contract Splitwise {
    // DO NOT MODIFY ABOVE THIS

    // ADD YOUR CONTRACT CODE BELOW
    mapping(address => mapping(address => uint32)) public ious;

    // Returns the amount that the debtor owes the creditor
    function lookup(address debtor, address creditor) public view returns (uint32) {
        return ious[debtor][creditor];
    }

    function subtract_debts(address addr, uint32 min) public {
        require(ious[msg.sender][addr] - min <= ious[msg.sender][addr], "Cannot subtract more than the owed amount");
        ious[msg.sender][addr] -= min;
    }

    function add_IOU(address creditor, uint32 amount) public {
        require(creditor != msg.sender, "Cannot owe to oneself");
        require(amount > 0, "IOU amount must be positive");

        ious[msg.sender][creditor] += amount;
    }
}
