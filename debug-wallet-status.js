/**
 * DEBUG SCRIPT: Check Wallet Status Data
 * Jalankan di Browser Console untuk debug masalah wallet status
 */

(function debugWalletStatus() {
    console.log('🔍 ===== DEBUG WALLET STATUS =====');

    // 1. Check CEX_WALLET_STATUS data
    const walletStatus = localStorage.getItem('CEX_WALLET_STATUS');
    if (!walletStatus) {
        console.error('❌ CEX_WALLET_STATUS tidak ada di localStorage!');
        console.log('👉 Silakan jalankan UPDATE WALLET EXCHANGER terlebih dahulu');
        return;
    }

    const parsed = JSON.parse(walletStatus);
    console.log('✅ CEX_WALLET_STATUS ditemukan:', parsed);

    // 2. Sample CEX untuk test
    const sampleCex = Object.keys(parsed)[0];
    if (!sampleCex) {
        console.error('❌ Tidak ada data CEX di CEX_WALLET_STATUS');
        return;
    }

    console.log(`\n📦 Testing dengan CEX: ${sampleCex}`);
    const cexData = parsed[sampleCex];

    // 3. Sample token
    const sampleToken = Object.keys(cexData)[0];
    if (!sampleToken) {
        console.error(`❌ Tidak ada token di ${sampleCex}`);
        return;
    }

    console.log(`📦 Testing dengan TOKEN: ${sampleToken}`);
    const tokenData = cexData[sampleToken];
    console.log(`   Available chains:`, Object.keys(tokenData));

    // 4. Check chain label dari CONFIG
    console.log('\n🔧 Checking CONFIG_CHAINS chain labels:');
    Object.keys(CONFIG_CHAINS || {}).forEach(chainKey => {
        const chainConfig = CONFIG_CHAINS[chainKey];
        const walletCex = chainConfig.WALLET_CEX || {};
        const cexInfo = walletCex[sampleCex];
        if (cexInfo) {
            console.log(`   ${chainKey}: chainCEX = "${cexInfo.chainCEX}"`);
        }
    });

    // 5. Check sample token from storage
    console.log('\n🗂️ Checking sample token from storage:');
    const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
    const tokenKey = mode.type === 'single'
        ? `TOKEN_${String(mode.chain).toUpperCase()}`
        : 'TOKEN_MULTICHAIN';

    const tokens = JSON.parse(localStorage.getItem(tokenKey) || '[]');
    const sampleStoredToken = tokens[0];

    if (sampleStoredToken) {
        console.log(`   Sample token:`, sampleStoredToken.symbol_in, '⇄', sampleStoredToken.symbol_out);
        console.log(`   Chain:`, sampleStoredToken.chain);
        console.log(`   DataCexs:`, sampleStoredToken.dataCexs);

        // 6. Check apakah ada data wallet
        if (sampleStoredToken.dataCexs && sampleStoredToken.dataCexs[sampleCex]) {
            const cexDataInToken = sampleStoredToken.dataCexs[sampleCex];
            console.log(`\n✅ ${sampleCex} data found in token:`);
            console.log(`   depositToken: ${cexDataInToken.depositToken}`);
            console.log(`   withdrawToken: ${cexDataInToken.withdrawToken}`);
            console.log(`   depositPair: ${cexDataInToken.depositPair}`);
            console.log(`   withdrawPair: ${cexDataInToken.withdrawPair}`);
        } else {
            console.error(`\n❌ ${sampleCex} data NOT FOUND in token dataCexs!`);
            console.log('   This means applyWalletStatusToTokenList failed to merge data');
        }
    } else {
        console.warn('⚠️ No tokens in storage');
    }

    // 7. Diagnostic summary
    console.log('\n📋 ===== DIAGNOSTIC SUMMARY =====');
    console.log('1. Check if chainCEX labels match with wallet data chain keys');
    console.log('2. If mismatch, the resolveWalletChain will return null');
    console.log('3. Run applyWalletStatusToTokenList again with console.log enabled');
    console.log('4. Look for "NO MATCH" warnings in console');

    console.log('\n🔧 Quick Fix Test:');
    console.log('Copy this to console to manually test chain resolution:');
    console.log(`
const testToken = ${JSON.stringify(sampleToken)};
const testCex = ${JSON.stringify(sampleCex)};
const walletInfo = ${JSON.stringify(tokenData)};
const chainLabel = CONFIG_CHAINS.bsc?.WALLET_CEX?.[testCex]?.chainCEX?.toUpperCase() || '';
console.log('Chain Label:', chainLabel);
console.log('Wallet Keys:', Object.keys(walletInfo));
console.log('Match:', walletInfo[chainLabel]);
    `);

})();
