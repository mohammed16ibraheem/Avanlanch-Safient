// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {
    struct EscrowTransaction {
        address sender;
        address recipient;
        uint256 amount;
        uint256 createdAt;
        uint256 releaseTime;
        bool isReleased;
        bool isReturned;
        bool isActive;
    }
    
    mapping(bytes32 => EscrowTransaction) public escrows;
    mapping(address => bytes32[]) public userEscrows;
    
    uint256 public constant RETURN_WINDOW = 300; // 5 minutes for easier testing
    uint256 public escrowCount;
    
    // Reentrancy guard
    bool private _locked;
    
    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 releaseTime
    );
    
    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed recipient,
        uint256 amount
    );
    
    event EscrowReturned(
        bytes32 indexed escrowId,
        address indexed sender,
        uint256 amount
    );
    
    modifier onlyParties(bytes32 escrowId) {
        require(
            msg.sender == escrows[escrowId].sender || 
            msg.sender == escrows[escrowId].recipient,
            "Not authorized"
        );
        _;
    }
    
    modifier escrowExists(bytes32 escrowId) {
        require(escrows[escrowId].isActive, "Escrow does not exist");
        _;
    }
    
    function createEscrow(address _recipient) external payable returns (bytes32) {
        require(msg.value > 0, "Amount must be greater than 0");
        require(_recipient != address(0), "Invalid recipient address");
        require(_recipient != msg.sender, "Cannot send to yourself");
        
        bytes32 escrowId = keccak256(
            abi.encodePacked(
                msg.sender,
                _recipient,
                msg.value,
                block.timestamp,
                escrowCount++
            )
        );
        
        uint256 releaseTime = block.timestamp + RETURN_WINDOW;
        
        escrows[escrowId] = EscrowTransaction({
            sender: msg.sender,
            recipient: _recipient,
            amount: msg.value,
            createdAt: block.timestamp,
            releaseTime: releaseTime,
            isReleased: false,
            isReturned: false,
            isActive: true
        });
        
        userEscrows[msg.sender].push(escrowId);
        userEscrows[_recipient].push(escrowId);
        
        emit EscrowCreated(escrowId, msg.sender, _recipient, msg.value, releaseTime);
        
        return escrowId;
    }
    
    function releaseEscrow(bytes32 escrowId) 
        external 
        nonReentrant  // ✅ Reentrancy protection
        escrowExists(escrowId) 
        onlyParties(escrowId) 
    {
        EscrowTransaction storage escrow = escrows[escrowId];
        
        // ✅ CHECKS: All require statements first
        require(msg.sender == escrow.recipient, "Only recipient can release");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isReturned, "Already returned");
        require(block.timestamp >= escrow.releaseTime, "Still in return window");
        
        // ✅ EFFECTS: State changes before external calls
        escrow.isReleased = true;
        escrow.isActive = false;
        
        // Cache values before external call
        address recipient = escrow.recipient;
        uint256 amount = escrow.amount;
        
        // ✅ INTERACTIONS: External call last
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit EscrowReleased(escrowId, recipient, amount);
    }
    
    function returnEscrow(bytes32 escrowId) 
        external 
        nonReentrant
        escrowExists(escrowId) 
    {
        EscrowTransaction storage escrow = escrows[escrowId];
        
        // ✅ CHECKS: All require statements first
        require(msg.sender == escrow.sender, "Only sender can return");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isReturned, "Already returned");
        require(block.timestamp < escrow.releaseTime, "Return window expired");
        
        // ✅ EFFECTS: State changes before external calls
        escrow.isReturned = true;
        escrow.isActive = false;
        
        // Cache values before external call
        address sender = escrow.sender;
        uint256 amount = escrow.amount;
        
        // ✅ INTERACTIONS: External call last
        (bool success, ) = sender.call{value: amount}("");
        require(success, "Return failed");
        
        emit EscrowReturned(escrowId, sender, amount);
    }
    
    // View functions
    function getEscrow(bytes32 escrowId) external view returns (EscrowTransaction memory) {
        return escrows[escrowId];
    }
    
    function getUserEscrows(address user) external view returns (bytes32[] memory) {
        return userEscrows[user];
    }
    
    function getEscrowStatus(bytes32 escrowId) external view returns (
        bool isActive,
        bool isReleased,
        bool isReturned,
        uint256 timeRemaining
    ) {
        EscrowTransaction storage escrow = escrows[escrowId];
        
        isActive = escrow.isActive;
        isReleased = escrow.isReleased;
        isReturned = escrow.isReturned;
        
        if (block.timestamp < escrow.releaseTime) {
            timeRemaining = escrow.releaseTime - block.timestamp;
        } else {
            timeRemaining = 0;
        }
    }
    
    function canReturn(bytes32 escrowId) external view returns (bool) {
        EscrowTransaction storage escrow = escrows[escrowId];
        return escrow.isActive && 
               !escrow.isReleased && 
               !escrow.isReturned && 
               block.timestamp < escrow.releaseTime;
    }
    
    function canRelease(bytes32 escrowId) external view returns (bool) {
        EscrowTransaction storage escrow = escrows[escrowId];
        return escrow.isActive && 
               !escrow.isReleased && 
               !escrow.isReturned && 
               block.timestamp >= escrow.releaseTime;
    }
}