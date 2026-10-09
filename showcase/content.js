// What the showcase says: the four Privacy Pool actions (captures/own-pool-flow, recorded on
// Starknet Sepolia on 2026-10-08), the proving phases, and measured devices to compare with.
// Shared by the iOS and Android apps (and the browser). The facts come from the captures' proof
// outputs (docs/BROWSER-TX-PLAN.md); the words follow Outis's: shield, unshield, [STRK] for a
// shielded amount.
window.SHOWCASE = {
  actions: [
    {
      id: "register",
      short: "Register",
      title: "Bob registers in the Privacy Pool",
      tagline: "Sets up a private balance",
      summary: "Bob registers with the pool, so that he can hold [STRK] and be paid privately.",
      icon: "key",
      who: "Bob",
      flow: { from: { icon: "key", label: "Bob's keys" }, move: { text: "Register" }, to: { icon: "eyeOff", label: "Privacy Pool" } },
      private: ["Bob's private key. The proof needs it, and it never leaves this device."],
      public: ["Bob's address and public key", "His viewing key, encrypted so that only the pool's auditor can read it"],
    },
    {
      id: "deposit",
      short: "Shield",
      title: "Alice shields 5 STRK",
      tagline: "From her public balance into the pool",
      summary: "Alice moves 5 STRK from her public balance into the Privacy Pool, where it becomes a note only she can spend.",
      icon: "shieldDown",
      who: "Alice",
      flow: { from: { icon: "globe", label: "Public balance" }, move: { text: "5 STRK" }, to: { icon: "eyeOff", label: "Private balance" } },
      private: ["Alice's private key", "The note she now holds, and what she does with it next"],
      public: ["That Alice shielded 5 STRK: the token, the amount and her address"],
    },
    {
      id: "pay",
      short: "Send",
      title: "Alice sends Bob 3 [STRK]",
      tagline: "A private payment",
      summary: "Inside the pool, Alice pays Bob 3 [STRK] and keeps 2 [STRK] as change. Bob sees the amount and that it came from her. Nobody else on-chain does.",
      icon: "pay",
      who: "Alice",
      flow: { from: { icon: "eyeOff", label: "Alice" }, move: { text: "3 [STRK]", hidden: true }, to: { icon: "eyeOff", label: "Bob" } },
      private: [
        "The amounts: 3 [STRK] to Bob, 2 [STRK] back to Alice",
        "Which of Alice's notes paid for it",
        "Alice's private key",
      ],
      public: [
        "That one note was spent, so that it can't be spent twice",
        "Two new notes, encrypted: Bob's and Alice's change",
        "That a payment channel to Bob's address was opened",
      ],
    },
    {
      id: "withdraw",
      short: "Unshield",
      title: "Bob unshields 2 [STRK]",
      tagline: "Back to a public address",
      summary: "Bob takes 2 [STRK] out of the pool to a public address, and keeps 1 [STRK] private.",
      icon: "shieldUp",
      who: "Bob",
      flow: { from: { icon: "eyeOff", label: "Private balance" }, move: { text: "2 STRK" }, to: { icon: "globe", label: "Public address" } },
      private: ["That it was Bob: his address is encrypted", "Which notes paid, and the 1 [STRK] he keeps", "Bob's private key"],
      public: ["That 2 STRK left the pool, and the address it went to"],
    },
  ],

  // The Progress phases of os_wasm_probe::replay, in order.
  phases: [
    { id: "state", label: "Read the Starknet state", doing: "Reading the Starknet state…" },
    { id: "execute", label: "Run the action", doing: "Running the action…", detail: "The pool's code, with the private key" },
    { id: "os", label: "Run the Starknet OS", doing: "Running the Starknet OS…" },
    { id: "prove", label: "Build the ZK proof", doing: "Building the ZK proof…" },
    { id: "verify", label: "Verify the proof", doing: "Verifying the proof…", detail: "The check the network runs" },
  ],

  // The prover-results service (outis/prover-results): scores sent from the result screen, and
  // the results page. ?results=<url> points the page at another one (local testing).
  resultsUrl: "https://rpc.outis.cash/prover-results",

  // Hardware identifiers to marketing names (only ones we are sure of; others show as is).
  deviceNames: {
    "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro", "iPhone13,4": "iPhone 12 Pro Max",
    "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro", "iPhone14,3": "iPhone 13 Pro Max",
    "iPhone14,6": "iPhone SE (3rd generation)", "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus",
    "iPhone15,2": "iPhone 14 Pro", "iPhone15,3": "iPhone 14 Pro Max", "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus",
    "iPhone16,1": "iPhone 15 Pro", "iPhone16,2": "iPhone 15 Pro Max", "iPhone17,1": "iPhone 16 Pro", "iPhone17,2": "iPhone 16 Pro Max",
    "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,5": "iPhone 16e", "iPhone18,1": "iPhone 17 Pro",
    "iPad13,16": "iPad Air (M1)", "iPad13,17": "iPad Air (M1)",
    "SM-S936B": "Galaxy S25+", "SM-S936U": "Galaxy S25+", "SM-S936U1": "Galaxy S25+", "SM-G965F": "Galaxy S9+", "SM-G965U": "Galaxy S9+",
  },
};
