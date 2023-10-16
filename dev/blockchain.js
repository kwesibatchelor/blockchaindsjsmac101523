const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
const uuid = require('uuid').v1;

function Blockchain() {
    this.chain = [];
    this.pendingTransactions = [];

    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes = [];

    //create genesis block
    this.createNewBlock(100, '0', '0');
};


Blockchain.prototype.createNewBlock = function(nonce,previousBlockHash, hash) {
    const newBlock = {
        index: this.chain.length + 1,
        timestamp: Date.now(),
        transactions: this.pendingTransactions,
        nonce: nonce,
        hash: hash,
        previousBlockHash: previousBlockHash
    };

    this.pendingTransactions =  [];
    this.chain.push(newBlock);

    return newBlock;
};


Blockchain.prototype.getLastBlock = function() {
    return this.chain[this.chain.length - 1];
};


Blockchain.prototype.createNewTransaction = function(amount, sender, recipient) {
    const newTransaction = {
        amount: amount,
        sender: sender,
        recipient: recipient,
        transactionId: uuid().split('-').join('')
    };

    return newTransaction;
};

Blockchain.prototype.addTransactionToPendingTransactions = function(transactionObj) {
    this.pendingTransactions.push(transactionObj);
    return this.getLastBlock()['index'] + 1;
};



Blockchain.prototype.hashBlock = function(previousBlockHash, currentBlockData, nonce) {
    const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
    const hash = sha256(dataAsString);
    return hash;
};



Blockchain.prototype.proofOfWork = function(previousBlockHash, currentBlockData) {
    //repeatedly hash block until 2 zeros
    //use currentBlockData and previousBlockHash for hash
    //continuosly changes nonce until it finds correct hash
    //return nonce value that creates the correct hash
    let nonce = 0;
    let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    while (hash.substring(0, 2) != '00') {
        nonce++;
        hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    }

    return nonce;
};

Blockchain.prototype.chainIsValid = function(blockchain) {
    let validChain = true;

    for (var i = 1; i < blockchain.length; i++) {
        const currentBlock = blockchain[i];
        const prevBlock = blockchain[i - 1];
        const blockHash = this.hashBlock(prevBlock['hash'], { transactions: currentBlock['transactions'], index: currentBlock['index'] }, currentBlock['nonce'] );
        if (blockHash.substring(0, 2) !== '00') validChain = false;
        if (currentBlock['previousBlockHash'] !== prevBlock['hash']) validChain = false;
    };

    const genesisBlock = blockchain[0];   
    const correctNonce = genesisBlock['nonce'] === 100;
    const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
    const correctHash = genesisBlock['hash'] === '0';
    const correctTransactions = genesisBlock['transactions'].length === 0;

    if(!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions ) validChain = false;
    return validChain;
};

Blockchain.prototype.getBlock = function(blockHash) {
    let correctBlock = null;
    this.chain.forEach(block => {
        if (block.hash === blockHash) correctBlock = block;
    });
    return correctBlock;
};

Blockchain.prototype.getTransaction = function(transactionId) {
    this.chain.forEach(transaction => {
        let correctTransaction = null;
        let correctBlock = null;
    
        this.chain.forEach(block => {
            block.transaction.forEach(transaction => {
                if (transaction.transactionId === transactionId) {
                    correctTransaction = transaction;
                    correctBlock = block;
                };
            });
        });  
    });
    return {
        transaction: correctTransaction,
        block: correctBlock
    }; 
};



module.exports = Blockchain;