/**
 * Test script untuk verifikasi Rubic API
 * Jalankan dengan: node test-rubic-api.js
 */

// Test 1: Format yang BERHASIL (dari curl test sebelumnya)
const workingPayload = {
  srcTokenAddress: "0x55d398326f99059ff775485246999027b3197955",
  srcTokenBlockchain: "BSC",
  srcTokenAmount: "100",
  dstTokenAddress: "0x7083609fce4d1d8dc0c979aab8c869ea2c873402",
  dstTokenBlockchain: "BSC",
  referrer: "rubic.exchange"
};

// Test 2: Simulasi dari aplikasi (USDT → DOT, 100 USDT)
// amount_in_big = 100000000000000000000 (100 * 10^18)
// des_input = 18
const amount_in_big = "100000000000000000000";
const des_input = 18;
const amountNum = parseFloat(amount_in_big) / Math.pow(10, des_input);
const precision = Math.min(des_input, 18);
const amountInTokens = amountNum.toFixed(precision).replace(/\.?0+$/, '');

const appPayload = {
  srcTokenAddress: "0x55d398326f99059ff775485246999027b3197955".toLowerCase(),
  srcTokenBlockchain: "BSC",
  srcTokenAmount: amountInTokens,
  dstTokenAddress: "0x7083609fce4d1d8dc0c979aab8c869ea2c873402".toLowerCase(),
  dstTokenBlockchain: "BSC",
  referrer: "rubic.exchange"
};

console.log("========== WORKING PAYLOAD (from curl) ==========");
console.log(JSON.stringify(workingPayload, null, 2));
console.log("");
console.log("========== APP PAYLOAD (from code) ==========");
console.log(JSON.stringify(appPayload, null, 2));
console.log("");
console.log("========== COMPARISON ==========");
console.log("Amount match:", workingPayload.srcTokenAmount === appPayload.srcTokenAmount);
console.log("Working amount:", workingPayload.srcTokenAmount);
console.log("App amount:", appPayload.srcTokenAmount);
console.log("");

// Test actual fetch
async function testRubicAPI() {
  console.log("========== TESTING RUBIC API ==========");

  try {
    const response = await fetch('https://api-v2.rubic.exchange/api/routes/quoteAll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(appPayload)
    });

    console.log("Status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText.substring(0, 500));
      return;
    }

    const data = await response.json();
    console.log("Success! Routes found:", data.routes?.length || 0);

    if (data.routes && data.routes.length > 0) {
      console.log("\nTop 3 providers:");
      data.routes.slice(0, 3).forEach((route, idx) => {
        console.log(`  ${idx + 1}. ${route.providerType}: ${route.estimate?.destinationTokenAmount} DOT`);
      });
    }
  } catch (error) {
    console.error("Fetch error:", error.message);
  }
}

// Run test
testRubicAPI();
