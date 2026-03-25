// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VaultX {
    struct PasswordEntry {
        string website;
        string username;
        string encryptedPassword;
        uint256 timestamp;
    }

    mapping(address => PasswordEntry[]) private userEntries;

    event EntryAdded(address indexed user, string website, string username);
    event EntryDeleted(address indexed user, uint256 index);

    function addEntry(string memory _website, string memory _username, string memory _encryptedPassword) public {
        userEntries[msg.sender].push(PasswordEntry({
            website: _website,
            username: _username,
            encryptedPassword: _encryptedPassword,
            timestamp: block.timestamp
        }));
        emit EntryAdded(msg.sender, _website, _username);
    }

    function getEntries() public view returns (PasswordEntry[] memory) {
        return userEntries[msg.sender];
    }

    function deleteEntry(uint256 _index) public {
        require(_index < userEntries[msg.sender].length, "Index out of bounds");
        
        // Move the last element to the deleted spot and pop (gas efficient)
        uint256 lastIndex = userEntries[msg.sender].length - 1;
        if (_index != lastIndex) {
            userEntries[msg.sender][_index] = userEntries[msg.sender][lastIndex];
        }
        userEntries[msg.sender].pop();
        
        emit EntryDeleted(msg.sender, _index);
    }
}
