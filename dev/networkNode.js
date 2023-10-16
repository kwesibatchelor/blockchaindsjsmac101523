const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const uuid = require('uuid').v1;
const port = process.argv[2];
const rp = require('request-promise');

const nodeAddress = uuid().split('-').join('');

const ccc = new Blockchain();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


// test
app.get('/', function (req, res) {
    res.send('CCC')
})

// fetch entire blockchain
app.get('/blockchain', function (req, res) {
    res.send(ccc);
});
// create a new transaction
app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex =  ccc.addTransactionToPendingTransactions(newTransaction);
    res.json({ note: `Transaction will be added in block ${blockIndex}`})
});

app.post('/transaction/broadcast', function(req, res) {
    const newTransaction = ccc.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    ccc.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    ccc.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(data => {
        res.json({ note: 'Transaction created and broadcasted successfully' })
    });
});

// mine a new block
app.get('/mine', function (req, res) {
    const lastBlock = ccc.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: ccc.pendingTransactions,
        index: lastBlock['index'] + 1
    };
    const nonce = ccc.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = ccc.hashBlock(previousBlockHash, currentBlockData, nonce);
    //ccc.createNewTransaction(5, "00", nodeAddress);
    const newBlock = ccc.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestPromises = [];
    ccc.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(data => {
        const requestOptions = {
            uri: ccc.currentNodeUrl + '/transaction/broadcast',
            method: 'POST',
            body: {
                amount: 5,
                sender: "00",
                recipient: nodeAddress
            },
            json: true 
        };

        return rp(requestOptions);
    })
    .then(data => {
        res.json({
            note: "New block mined successfully",
            block: newBlock
        });
    });
/* moved 
    res.json({
        note: "New block mined successfully",
        block: newBlock
    });
*/
});

app.post('/receive-new-block', function(req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = ccc.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];    

    if(correctHash && correctIndex) {
        ccc.chain.push(newBlock);
        ccc.pendingTransactions = [];
        res.json({
            note: 'New block received and accepted',
            newBlock: newBlock
        });
    } else {
        res.json({
            note: 'New block rejected',
            newBlock: newBlock
        });
    }
});

// Register node and broadcast to entire network (1st endpoint)
app.post('/register-and-broadcast-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    //different than others 
    if (ccc.networkNodes.indexOf(newNodeUrl) ===-1) {
        ccc.networkNodes.push(newNodeUrl);
    }

    const regNodesPromises = [];
    ccc.networkNodes.forEach(networkNodeUrl => {
        // '/request-node' using request-promise library 
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl },
            json: true 
        };

        regNodesPromises.push(rp(requestOptions));
    });

    Promise.all(regNodesPromises)
    .then(data => {
        // use the data
        const bulkRegisterOptions = {
            uri: newNodeUrl + '/register-nodes-bulk',
            method: 'POST',
            body: { allNetworkNodes: [ ...ccc.networkNodes, ccc.currentNodeUrl ]}, 
            json: true
        };

        return rp(bulkRegisterOptions); 
    })
    .then(data => {
        res.json({ note: 'New node registered with network successfully' })
    })
    .catch(error => {
        res.status(500).json({ error: 'An error occurred while registering the node' });
    });
});

// Register a new node with the network - receive broadcast sent by '/register-and-broadcast-node'
app.post('/register-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = ccc.networkNodes.indexOf(newNodeUrl) ==-1;
    const notCurrentNode = ccc.currentNodeUrl !== newNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNode) ccc.networkNodes.push(newNodeUrl);
    res.json({ note: 'New node registered successfully' });
});

// Register multiple nodes at once 
app.post('/register-nodes-bulk', function(req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    //loop through allNetworkNodes array and register with new node 
    allNetworkNodes.forEach(networkNodeUrl => {
        //make sure node doesnt already exist 
        const nodeNotAlreadyPresent = ccc.networkNodes.indexOf(networkNodeUrl) == -1;
        //make sure new node not same node currently on 
        const notCurrentNode = ccc.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNode) ccc.networkNodes.push(networkNodeUrl);
    });

    res.json({ note: 'Bulk registration successful' })

});

app.get('/consensus', function(req, res) {
    const requestPromises = [];
    ccc.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/blockchain',
            method: 'GET',
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(blockchains => {
        const currentChainLength = ccc.chain.length;
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingTransactions = null;
        
        blockchains.forEach(blockchain => {
            if (blockchain.chain.length > maxChainLength) {
                maxChainLength = blockchain.chain.length;
                newLongestChain                                                                                                                                                                                                       = blockchain.chain;
                newPendingTransactions = blockchain.pendingTransactions;
            };
        });

        if (!newLongestChain || (newLongestChain && !ccc.chainIsValid(newLongestChain))) {
            res.json({
                note: 'Current chain has not been replaced',
                chain: ccc.chain
            });
        }
        else if (newLongestChain && ccc.chainIsValid(newLongestChain)) {
            ccc.chain = newLongestChain;
            ccc.pendingTransactions = newPendingTransactions;
            res.json({
                note: 'This chain has been replaced',
                chain: ccc.chain 
            });
        }
    });
});

app.get('/block/:blockHash', function(req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = ccc.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});

app.get('/transaction/:transactionId', function(req, res) {
    const transactionId = req.params.transactionId;
    const transactionData = ccc.getTransaction(transactionId);  
    res.json({
        transaction: transactionData.transaction,
        block: transactionData.block
    });       
});


app.get('address/:address', function(req, res) {

});

// listen
app.listen(port, () => {
    console.log(`Listening on port ${port}...`);

})