// =============================================================================
//                                  Config
// =============================================================================
const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
var defaultAccount;

// Constant we use later
var GENESIS = '0x0000000000000000000000000000000000000000000000000000000000000000';

// This is the ABI for your contract (get it from Remix, in the 'Compile' tab)
// ============================================================
var abi = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "creditor",
				"type": "address"
			},
			{
				"internalType": "uint32",
				"name": "amount",
				"type": "uint32"
			}
		],
		"name": "add_IOU",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "ious",
		"outputs": [
			{
				"internalType": "uint32",
				"name": "",
				"type": "uint32"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "debtor",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "creditor",
				"type": "address"
			}
		],
		"name": "lookup",
		"outputs": [
			{
				"internalType": "uint32",
				"name": "",
				"type": "uint32"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "addr",
				"type": "address"
			},
			{
				"internalType": "uint32",
				"name": "min",
				"type": "uint32"
			}
		],
		"name": "subtract_debts",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

// ============================================================
abiDecoder.addABI(abi);
// call abiDecoder.decodeMethod to use this - see 'getAllFunctionCalls' for more

var contractAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

var BlockchainSplitwise = new ethers.Contract(contractAddress, abi, provider.getSigner());

// =============================================================================
//                            Helper Functions
// =============================================================================

async function getNeighbors(node) {
	// Get all users to check against
	const users = await getUsers();
	let neighbors = [];

	// Go through all users and find any users that the current node owes money
	for (let user of users) {
		let debtFromNode = await BlockchainSplitwise.lookup(node, user);

		if (parseInt(debtFromNode) > 0) {
			neighbors.push(user);
		}
	}

	return neighbors;
}

// =============================================================================
//                            Functions To Implement
// =============================================================================


// Return a list of all users (creditors or debtors) in the system
// All users in the system are everyone who has ever sent or received an IOU
async function getUsers() {
	// Get all 'add_IOU' function calls
	let addIOUCalls = await getAllFunctionCalls(contractAddress, "add_IOU");
	let users = new Set(); // set to store unique users

	addIOUCalls.forEach((call) => {
		// Assuming that 'args[0]' is the debtor and 'args[1]' is the creditor
		users.add(call.from.toLowerCase()); // sender of the transaction
		users.add(call.args[0].toLowerCase()); // debtor
	});

	// Convert the set of users to an array
	return Array.from(users);
}


// Get the total amount owed by the user specified by 'user'
async function getTotalOwed(user) {
	try {
		const users = await getUsers();
		let totalOwed = 0;

		for (const currentUser of users) {
			if (currentUser !== user) {
				const debt = await BlockchainSplitwise.lookup(user, currentUser);
				totalOwed += debt;
			}
		}

		return totalOwed;
	} catch (error) {
		console.error('Error getting total owed:', error);
		throw error;
	}
}


// Return null if you can't find any activity for the user.
async function getLastActive(user) {
	let lastActive = null;
	let curBlock = await provider.getBlockNumber();

	while (curBlock !== GENESIS) {
		let b = await provider.getBlockWithTransactions(curBlock);
		let txns = b.transactions;
		for (let txn of txns) {
			// check that destination of txn is our contract
			if (txn.to && txn.to.toLowerCase() === contractAddress.toLowerCase()) {
				let func_call = abiDecoder.decodeMethod(txn.data);

				// If function call is decoded successfully and involves the user
				if (func_call && (txn.from.toLowerCase() === user.toLowerCase() ||
					func_call.params.some(param => param.value.toLowerCase() === user.toLowerCase()))) {

					let timeBlock = await provider.getBlock(curBlock);
					lastActive = timeBlock.timestamp;
					// Since we want the last active time, we can break as soon as we find the most recent activity
					break;
				}
			}
		}

		// If we have found a transaction, we do not need to check older blocks
		if (lastActive) break;

		curBlock = (await provider.getBlock(curBlock)).parentHash;
	}

	return lastActive;
}


// The person you owe money is passed as 'creditor'
// The amount you owe them is passed as 'amount'
async function add_IOU(creditor, amount) {
	// detect cycle
	const cycle = await doBFS(creditor, defaultAccount, getNeighbors);
	if (cycle) {
		// find min IOU
		var amounts = [];
		for (var i = 0; i < cycle.length - 1; i++) {
			amounts.push(await BlockchainSplitwise.lookup(cycle[i], cycle[i + 1]));
		}

		min = Math.min(...amounts, amount);
		amount = amount - min;

		for (let i = 0; i < cycle.length - 1; i++) {
			await BlockchainSplitwise.connect(provider.getSigner(cycle[i + 1])).subtract_debts(cycle[i + 1], min)
		}
	}
	if (amount > 0) await BlockchainSplitwise.connect(provider.getSigner(defaultAccount)).add_IOU(creditor, amount);
}


// =============================================================================
//                              Provided Functions
// =============================================================================
// Reading and understanding these should help you implement the above

// This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
// It returns an array of objects, one for each call, containing the sender ('from'), arguments ('args'), and the timestamp ('t')
async function getAllFunctionCalls(addressOfContract, functionName) {
	var curBlock = await provider.getBlockNumber();
	var function_calls = [];

	while (curBlock !== GENESIS) {
		var b = await provider.getBlockWithTransactions(curBlock);
		var txns = b.transactions;
		for (var j = 0; j < txns.length; j++) {
			var txn = txns[j];

			// check that destination of txn is our contract
			if (txn.to == null) { continue; }
			if (txn.to.toLowerCase() === addressOfContract.toLowerCase()) {
				var func_call = abiDecoder.decodeMethod(txn.data);

				// check that the function getting called in this txn is 'functionName'
				if (func_call && func_call.name === functionName) {
					var timeBlock = await provider.getBlock(curBlock);
					var args = func_call.params.map(function (x) { return x.value });
					function_calls.push({
						from: txn.from.toLowerCase(),
						args: args,
						t: timeBlock.timestamp
					})
				}
			}
		}
		curBlock = b.parentHash;
	}
	return function_calls;
}

// We've provided a breadth-first search implementation for you, if that's useful
// It will find a path from start to end (or return null if none exists)
// You just need to pass in a function ('getNeighbors') that takes a node (string) and returns its neighbors (as an array)
async function doBFS(start, end, getNeighbors) {
	var queue = [[start]];
	while (queue.length > 0) {
		var cur = queue.shift();
		var lastNode = cur[cur.length - 1]
		if (lastNode.toLowerCase() === end.toString().toLowerCase()) {
			return cur;
		} else {
			var neighbors = await getNeighbors(lastNode);
			for (var i = 0; i < neighbors.length; i++) {
				queue.push(cur.concat([neighbors[i]]));
			}
		}
	}
	return null;
}

// =============================================================================
//                                      UI
// =============================================================================

// This sets the default account on load and displays the total owed to that
// account.
provider.listAccounts().then((response) => {
	defaultAccount = response[0];

	getTotalOwed(defaultAccount).then((response) => {
		$("#total_owed").html("$" + response);
	});

	getLastActive(defaultAccount).then((response) => {
		time = timeConverter(response)
		$("#last_active").html(time)
	});
});

// This code updates the 'My Account' UI with the results of your functions
$("#myaccount").change(function () {
	defaultAccount = $(this).val();

	getTotalOwed(defaultAccount).then((response) => {
		$("#total_owed").html("$" + response);
	})

	getLastActive(defaultAccount).then((response) => {
		time = timeConverter(response)
		$("#last_active").html(time)
	});
});

// Allows switching between accounts in 'My Account' and the 'fast-copy' in 'Address of person you owe
provider.listAccounts().then((response) => {
	var opts = response.map(function (a) {
		return '<option value="' +
			a.toLowerCase() + '">' + a.toLowerCase() + '</option>'
	});
	$(".account").html(opts);
	$(".wallet_addresses").html(response.map(function (a) { return '<li>' + a.toLowerCase() + '</li>' }));
});

// This code updates the 'Users' list in the UI with the results of your function
getUsers().then((response) => {
	$("#all_users").html(response.map(function (u, i) { return "<li>" + u + "</li>" }));
});

// This runs the 'add_IOU' function when you click the button
// It passes the values from the two inputs above
$("#addiou").click(function () {
	defaultAccount = $("#myaccount").val(); //sets the default account
	add_IOU($("#creditor").val(), $("#amount").val()).then((response) => {
		window.location.reload(false); // refreshes the page after add_IOU returns and the promise is unwrapped
	})
});

// This is a log function, provided if you want to display things to the page instead of the JavaScript console
// Pass in a discription of what you're printing, and then the object to print
function log(description, obj) {
	$("#log").html($("#log").html() + description + ": " + JSON.stringify(obj, null, 2) + "\n\n");
}


// =============================================================================
//                                      TESTING
// =============================================================================

// This section contains a sanity check test that you can use to ensure your code
// works. We will be testing your code this way, so make sure you at least pass
// the given test. You are encouraged to write more tests!

// Remember: the tests will assume that each of the four client functions are
// async functions and thus will return a promise. Make sure you understand what this means.

function check(name, condition) {
	if (condition) {
		console.log(name + ": SUCCESS");
		return 3;
	} else {
		console.log(name + ": FAILED");
		return 0;
	}
}

async function sanityCheck() {
	console.log("\nTEST", "Simplest possible test: only runs one add_IOU; uses all client functions: lookup, getTotalOwed, getUsers, getLastActive");

	var score = 0;

	var accounts = await provider.listAccounts();
	defaultAccount = accounts[0];

	var users = await getUsers();
	score += check("getUsers() initially empty", users.length === 0);

	var owed = await getTotalOwed(accounts[1]);
	score += check("getTotalOwed(0) initially empty", owed === 0);

	var lookup_0_1 = await BlockchainSplitwise.lookup(accounts[0], accounts[1]);
	console.log("lookup(0, 1) current value" + lookup_0_1);
	score += check("lookup(0,1) initially 0", parseInt(lookup_0_1, 10) === 0);

	var response = await add_IOU(accounts[1], "10");

	users = await getUsers();
	score += check("getUsers() now length 2", users.length === 2);

	owed = await getTotalOwed(accounts[0]);
	score += check("getTotalOwed(0) now 10", owed === 10);

	lookup_0_1 = await BlockchainSplitwise.lookup(accounts[0], accounts[1]);
	score += check("lookup(0,1) now 10", parseInt(lookup_0_1, 10) === 10);

	var timeLastActive = await getLastActive(accounts[0]);
	var timeNow = Date.now() / 1000;
	var difference = timeNow - timeLastActive;
	score += check("getLastActive(0) works", difference <= 60 && difference >= -3); // -3 to 60 seconds

	console.log("Final Score: " + score + "/21");
}

// sanityCheck() //Uncomment this line to run the sanity check when you first open index.html
