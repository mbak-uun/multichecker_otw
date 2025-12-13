// =================================================================================
// DEX Service Module (moved intact) — Pindahkan utuh + shim
// =================================================================================
/**
 * DEX Service Module
 * - Strategy-based price quoting per aggregator (Kyber, 1inch, 0x/Matcha, Odos, OKX)
 * - getPriceDEX builds request and parses response per DEX
 */
(function initDEXService(global){
  const root = global || (typeof window !== 'undefined' ? window : {});
  const App = root.App || (root.App = {});

  // Map HTTP status codes to concise Indonesian descriptions for UI titles
  function describeHttpStatus(code) {
    const map = {
      // 3xx
      300: 'Multiple Choices — Banyak pilihan resource',
      301: 'Moved Permanently — URL pindah permanen',
      302: 'Found — Redirect sementara',
      303: 'See Other — Redirect dengan GET',
      304: 'Not Modified — Pakai cache',
      307: 'Temporary Redirect — Redirect sementara (method sama)',
      308: 'Permanent Redirect — Redirect permanen (method sama)',
      // 4xx
      400: 'Bad Request — Format request salah',
      401: 'Unauthorized — Token/Auth diperlukan',
      402: 'Payment Required — Terkait pembayaran (jarang)',
      403: 'Forbidden — Akses dilarang',
      404: 'Not Found — Resource tidak ada',
      405: 'Method Not Allowed — Method HTTP salah',
      406: 'Not Acceptable — Format tidak didukung',
      407: 'Proxy Auth Required — Autentikasi proxy',
      408: 'Request Timeout — Permintaan terlalu lama',
      409: 'Conflict — Konflik data',
      410: 'Gone — Resource sudah dihapus',
      411: 'Length Required — Header Content-Length wajib',
      412: 'Precondition Failed — If-* gagal',
      413: 'Payload Too Large — Data terlalu besar',
      414: 'URI Too Long — URL terlalu panjang',
      415: 'Unsupported Media Type — Format tidak didukung',
      416: 'Range Not Satisfiable — Range request salah',
      417: 'Expectation Failed — Header Expect gagal',
      421: 'Misdirected Request — Server tujuan salah',
      422: 'Unprocessable Entity — Validasi gagal',
      423: 'Locked — Resource terkunci',
      424: 'Failed Dependency — Ketergantungan gagal',
      425: 'Too Early — Terlalu cepat',
      426: 'Upgrade Required — Wajib upgrade protokol',
      428: 'Precondition Required — Butuh precondition',
      429: 'Too Many Requests — Rate limiting',
      431: 'Header Fields Too Large — Header terlalu besar',
      451: 'Unavailable For Legal Reasons — Diblokir secara legal',
      // 5xx
      500: 'Internal Server Error — Error di sisi server',
      501: 'Not Implemented — Endpoint belum tersedia',
      502: 'Bad Gateway — Kesalahan di gateway/proxy',
      503: 'Service Unavailable — Server sibuk/maintenance',
      504: 'Gateway Timeout — Timeout di server/gateway',
      505: 'HTTP Version Not Supported — Versi tidak didukung',
      507: 'Insufficient Storage — Server kehabisan ruang',
      508: 'Loop Detected — Loop di server',
      510: 'Not Extended — Butuh extension tambahan',
      511: 'Network Auth Required — Login ke jaringan',
    };
    return map[Number(code)] || `HTTP ${code} — Error dari server`;
  }

  // Helper: Calculate gas fee in USD with custom gas price override
  function calculateGasFeeUSD(chainName, gasEstimate, gasPriceGwei) {
    try {
      // Get gas price data from localStorage
      const allGasData = (typeof getFromLocalStorage === 'function')
        ? getFromLocalStorage("ALL_GAS_FEES")
        : null;

      if (!allGasData) return 0;

      // Find gas info for this chain
      const gasInfo = allGasData.find(g =>
        String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
      );

      if (!gasInfo || !gasInfo.nativeTokenPrice) return 0;

      // Get chain config for gas limit
      const chainConfig = (typeof root.CONFIG_CHAINS !== 'undefined')
        ? root.CONFIG_CHAINS[String(chainName || '').toLowerCase()]
        : null;

      const gasLimit = gasEstimate || (chainConfig ? chainConfig.GASLIMIT : 80000);

      // Calculate fee: gasLimit * gasPriceGwei * nativeTokenPrice / 1e9
      const feeUSD = (gasLimit * gasPriceGwei * gasInfo.nativeTokenPrice) / 1e9;

      return Number.isFinite(feeUSD) && feeUSD > 0 ? feeUSD : 0;
    } catch(e) {
      // console.error('[DEX] Error calculating gas fee:', e);
      return 0;
    }
  }

  // Helper: Get default swap fee from utils.js (fallback)
  function getFeeSwap(chainName) {
    if (typeof root.getFeeSwap === 'function') {
      return root.getFeeSwap(chainName);
    }
    // Fallback if getFeeSwap not available
    return 0;
  }

  const dexStrategies = {
    kyber: {
      buildRequest: ({ chainName, sc_input, sc_output, amount_in_big }) => {
        const kyberUrl = `https://aggregator-api.kyberswap.com/${chainName.toLowerCase()}/api/v1/routes?tokenIn=${sc_input}&tokenOut=${sc_output}&amountIn=${amount_in_big}&gasInclude=true`;
        return { url: kyberUrl, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.data?.routeSummary) throw new Error("Invalid KyberSwap response structure");
        return {
          amount_out: response.data.routeSummary.amountOut / Math.pow(10, des_output),
          FeeSwap: parseFloat(response.data.routeSummary.gasUsd) || getFeeSwap(chainName),
          dexTitle: 'KYBER'
        };
      }
    },
    // '1inch': {
    //   buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big }) => {
    //     const baseUrl = 'https://api.1inch.dev/swap/v6.0';
    //     const chainId = codeChain;
    //     const url = `${baseUrl}/${chainId}/quote`;
    //     const params = new URLSearchParams({
    //       src: sc_input,
    //       dst: sc_output,
    //       amount: amount_in_big.toString()
    //     });
    //     return {
    //       url: `${url}?${params.toString()}`,
    //       method: 'GET'
    //     };
    //   },
    //   parseResponse: (response, { des_output, chainName }) => {
    //     if (!response?.dstAmount) throw new Error("1inch dstAmount not found in response");
    //     const amount_out = parseFloat(response.dstAmount) / Math.pow(10, des_output);
    //     const FeeSwap = getFeeSwap(chainName);
    //     return { amount_out, FeeSwap, dexTitle: '1INCH' };
    //   }
    // },
    paraswap5: {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, des_input, des_output }) => {
        const params = new URLSearchParams({
          network: String(codeChain || ''),
          srcToken: sc_input,
          destToken: sc_output,
          amount: amount_in_big.toString(),
          side: 'SELL',
          srcDecimals: String(des_input),
          destDecimals: String(des_output),
          partner: 'paraswap.io'
        });
        return {
          url: `https://apiv5.paraswap.io/prices/?${params.toString()}`,
          method: 'GET'
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const route = response?.priceRoute;
        const destAmountStr = route?.destAmount;
        if (!destAmountStr) throw new Error('Invalid ParaSwap response');
        const destAmountNum = parseFloat(destAmountStr);
        if (!Number.isFinite(destAmountNum) || destAmountNum <= 0) throw new Error('Invalid ParaSwap dest amount');
        const amount_out = destAmountNum / Math.pow(10, des_output);
        const gasUsd = parseFloat(route.gasCostUSD || route.estimatedGasCostUSD || response?.gasCostUSD || 0);
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);
        return { amount_out, FeeSwap, dexTitle: 'PARASWAP' };
      },
      useProxy: false
    },
    paraswap6: {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, des_input, des_output, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          version: '6.2',
          network: String(codeChain || ''),
          srcToken: sc_input,
          destToken: sc_output,
          amount: amount_in_big.toString(),
          side: 'SELL',
          srcDecimals: String(des_input),
          destDecimals: String(des_output),
          otherExchangePrices: 'true',
          partner: 'paraswap.io',
          userAddress: userAddr
        });
        return {
          url: `https://api.paraswap.io/prices/?${params.toString()}`,
          method: 'GET'
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const route = response?.priceRoute;
        const destAmountStr = route?.destAmount;
        if (!destAmountStr) throw new Error('Invalid ParaSwap v6 response');
        const destAmountNum = parseFloat(destAmountStr);
        if (!Number.isFinite(destAmountNum) || destAmountNum <= 0) throw new Error('Invalid ParaSwap v6 dest amount');
        const amount_out = destAmountNum / Math.pow(10, des_output);
        const gasUsd = parseFloat(route.gasCostUSD || route.estimatedGasCostUSD || response?.gasCostUSD || 0);
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);
        return {
          amount_out,
          FeeSwap,
          dexTitle: 'PARASWAP',
          routeTool: 'PARASWAP V6'
        };
      },
      useProxy: false
    },
    'hinkal-odos': {
      // Hinkal ODOS proxy (pair-to-token per permintaan)
      buildRequest: ({ codeChain, SavedSettingData, amount_in_big, sc_input, sc_output }) => {
        const url = 'https://ethmainnet.server.hinkal.pro/OdosSwapData';
        return {
          url,
          method: 'POST',
          data: JSON.stringify({
            chainId: codeChain,
            inputTokens: [{ amount: amount_in_big.toString(), tokenAddress: sc_input }],
            outputTokens: [{ proportion: 1, tokenAddress: sc_output }],
            userAddr: SavedSettingData.walletMeta,
            slippageLimitPercent: 0.3,
            sourceBlacklist: [],
            sourceWhitelist: [],
            simulate: false,
            referralCode: 0
          })
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Gunakan jumlah output mentah (wei) dari outputTokens; outValues adalah nilai (USD) dan tidak dipakai untuk unit token
        const outRawStr = response?.odosResponse?.outputTokens?.[0]?.amount;
        if (!outRawStr) throw new Error('Invalid Hinkal ODOS out amount');
        const outRaw = parseFloat(outRawStr);
        if (!Number.isFinite(outRaw) || outRaw <= 0) throw new Error('Invalid Hinkal ODOS out amount');
        const amount_out = outRaw / Math.pow(10, des_output);
        const feeUsd = parseFloat(response?.odosResponse?.gasEstimateValue || response?.gasEstimateValue || 0);
        const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0) ? feeUsd : getFeeSwap(chainName);
        return { amount_out, FeeSwap, dexTitle: 'ODOS' };
      },
      useProxy: false
    },
    fly: {
      buildRequest: ({ chainName, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big }) => {
        // Map chain name to Fly.trade network parameter
        const chainNetworkMap = {
          'bsc': 'bsc',
          'polygon': 'polygon',
          'arbitrum': 'arbitrum',
          'ethereum': 'ethereum',
          'base': 'base',
          'avalanche': 'avalanche',
          'optimism': 'optimism',
          'fantom': 'fantom',
          'linea': 'linea',
          'scroll': 'scroll',
          'zksync': 'zksync',
          'solana': 'solana'
        };
        const chainLower = String(chainName || '').toLowerCase();
        const net = chainNetworkMap[chainLower] || chainLower;
        // Solana uses base58 addresses (case-sensitive), use original addresses
        const isSolana = chainLower === 'solana';
        const fromAddr = isSolana ? sc_input_in : sc_input;
        const toAddr = isSolana ? sc_output_in : sc_output;
        // Use public endpoint (no API key required)
        const url = `https://api.fly.trade/aggregator/quote?network=${net}&fromTokenAddress=${fromAddr}&toTokenAddress=${toAddr}&sellAmount=${String(amount_in_big)}&slippage=0.1&gasless=false`;
        return {
          url,
          method: 'GET'
        };
      },
      parseResponse: (response, { chainName, des_output }) => {
        const rawOut = response?.amountOut;
        const outNum = parseFloat(rawOut);
        if (!Number.isFinite(outNum) || outNum <= 0) throw new Error('Invalid FlyTrade amountOut');
        // Normalisasi ke unit token keluaran (selaras strategi lain)
        const amount_out = outNum / Math.pow(10, des_output);
        // Gas fee dari response.fees[0].value (dalam USD)
        const gasFee = response?.fees?.find(f => f.type === 'gas');
        const feeDex = parseFloat(gasFee?.value || 0);
        const FeeSwap = (Number.isFinite(feeDex) && feeDex > 0) ? feeDex : getFeeSwap(chainName);
        return { amount_out, FeeSwap, dexTitle: 'FLY' };
      },
      useProxy: true // Public endpoint - gunakan CORS proxy
    },
    // ZeroSwap aggregator untuk 1inch
    'zero-1inch': {
      buildRequest: ({ sc_input, sc_output, amount_in_big, des_input, des_output, codeChain }) => {
        const baseUrl = 'https://api.zeroswap.io/quote/1inch';
        const params = new URLSearchParams({
          fromChain: codeChain,
          fromTokenAddress: sc_input,
          toTokenAddress: sc_output,
          fromTokenDecimals: des_input,
          toTokenDecimals: des_output,
          sellAmount: String(amount_in_big),
          slippage: '0.1'
        });
        return { url: `${baseUrl}?${params.toString()}`, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const q = response?.quote;
        const buyAmount = q?.estimation?.buyAmount;
        if (!buyAmount) throw new Error('Invalid ZeroSwap 1inch response');
        const amount_out = parseFloat(buyAmount) / Math.pow(10, des_output);
        const FeeSwap = getFeeSwap(chainName);
        return { amount_out, FeeSwap, dexTitle: '1INCH', routeTool: 'ZeroSwap' };
      }
    },
    // // Backward compatibility alias
    'zero': {
      buildRequest: (...args) => dexStrategies['zero-1inch'].buildRequest(...args),
      parseResponse: (...args) => dexStrategies['zero-1inch'].parseResponse(...args)
    },    
    // Hinkal proxy untuk 1inch (privacy-focused)
    'hinkal-1inch': {
      buildRequest: ({ sc_input, sc_output, amount_in_big, SavedSettingData, codeChain }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const apiUrl = 'https://ethmainnet.server.hinkal.pro/OneInchSwapData';

        // Build 1inch API URL with dynamic chainId
        const chainId = codeChain || 1; // default to Ethereum mainnet
        const requestData = {
          url: `https://api.1inch.dev/swap/v5.2/${chainId}/swap?` +
            `fromTokenAddress=${sc_input}` +
            `&toTokenAddress=${sc_output}` +
            `&amount=${amount_in_big}` +
            `&fromAddress=${userAddr}` +
            `&slippage=10` +
            `&destReceiver=${userAddr}` +
            `&disableEstimate=true`
        };

        return {
          url: apiUrl,
          method: 'POST',
          data: JSON.stringify(requestData),
          headers: { 'Content-Type': 'application/json' }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const outAmount = response?.oneInchResponse?.toAmount;
        if (!outAmount || parseFloat(outAmount) <= 0) {
          throw new Error('Invalid Hinkal 1inch response');
        }

        const amount_out = parseFloat(outAmount) / Math.pow(10, des_output);

        // Gas estimate with fallback
        let gasEstimate = parseFloat(response?.oneInchResponse?.tx?.gas || 0);
        if (!gasEstimate || gasEstimate === 0) gasEstimate = 350000;

        // Override gas price to 0.1 Gwei for privacy calculation
        const gweiOverride = 0.1;
        const FeeSwap = calculateGasFeeUSD(chainName, gasEstimate, gweiOverride);

        return {
          amount_out,
          FeeSwap,
          dexTitle: '1INCH',
          routeTool: 'Hinkal Privacy',
          gasEstimate,
          gasPrice: gweiOverride
        };
      }
    },
    // Alias untuk hinkal-1inch
    'hinkal': {
        buildRequest: (...args) => dexStrategies['hinkal-1inch'].buildRequest(...args),
        parseResponse: (...args) => dexStrategies['hinkal-1inch'].parseResponse(...args)
    },
    'zero-kyber': {
      buildRequest: ({ sc_input, sc_output, amount_in_big, des_input, des_output, codeChain }) => {
        const baseUrl = 'https://api.zeroswap.io/quote/kyberswap';
        const params = new URLSearchParams({
          fromChain: codeChain,
          fromTokenAddress: sc_input,
          toTokenAddress: sc_output,
          fromTokenDecimals: des_input,
          toTokenDecimals: des_output,
          sellAmount: String(amount_in_big),
          slippage: '0.1'
        });
        return { url: `${baseUrl}?${params.toString()}`, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const q = response?.quote;
        const buyAmount = q?.estimation?.buyAmount;
        if (!buyAmount) throw new Error('Invalid ZeroSwap Kyber response');
        const amount_out = parseFloat(buyAmount) / Math.pow(10, des_output);
        const FeeSwap = getFeeSwap(chainName);
        return { amount_out, FeeSwap, dexTitle: 'KYBER' };
      }
    },
    '0x': {
      buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, codeChain, sc_output, sc_input, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        // ⚠️ IMPORTANT: Matcha Solana endpoint is UNDOCUMENTED
        // - 0x Swap API officially supports only EVM chains (NOT Solana)
        // - Matcha frontend has Solana support but uses internal/undocumented API
        // - This endpoint may be unstable or change without notice
        // - For Solana, DZAP is configured as automatic fallback (see resolveFetchPlan)
        // - References:
        //   - 0x Supported Chains: https://0x.org/docs/developer-resources/supported-chains
        //   - Matcha Solana Launch: https://www.theblock.co/post/349429/0x-dex-aggregator-matcha-solana-cross-chain-avoid-memecoin-rug-pulls
        const url = chainName.toLowerCase() === 'solana'
          ? `https://matcha.xyz/api/swap/quote/solana?sellTokenAddress=${sc_input_in}&buyTokenAddress=${sc_output_in}&sellAmount=${amount_in_big}&dynamicSlippage=true&slippageBps=50&userPublicKey=Eo6CpSc1ViboPva7NZ1YuxUnDCgqnFDXzcDMDAF6YJ1L`
          : `https://matcha.xyz/api/swap/price?chainId=${codeChain}&buyToken=${sc_output}&sellToken=${sc_input}&sellAmount=${amount_in_big}&slippageBps=50&taker=${userAddr}`;
        return { url, method: 'GET' };
      },
      parseResponse: (response, { des_output, des_input, chainName }) => {
        if (!response?.buyAmount) throw new Error("Invalid 0x response structure");

        // ===== SOLANA MATCHA RESPONSE FORMAT =====
        // For Solana, response includes route.tokens with decimals info
        // Example response: { buyAmount: "16986", sellAmount: "10000000", route: { tokens: [...] } }
        let actualDesOutput = des_output;
        let actualDesInput = des_input;

        // Extract decimals from response for Solana (more accurate)
        if (chainName.toLowerCase() === 'solana' && response.route?.tokens) {
          try {
            // response.route.tokens adalah array of tokens dalam route
            // Index terakhir biasanya adalah buyToken
            const tokens = response.route.tokens;
            if (tokens.length > 0) {
              // Cari buyToken dan sellToken dari array tokens
              // Biasanya sellToken adalah tokens[0], buyToken adalah tokens[tokens.length-1]
              const buyTokenInfo = tokens[tokens.length - 1];
              const sellTokenInfo = tokens[0];

              if (buyTokenInfo?.decimals !== undefined) {
                actualDesOutput = Number(buyTokenInfo.decimals);
                console.log(`[MATCHA SOLANA] Using buyToken decimals from response: ${actualDesOutput}`);
              }

              if (sellTokenInfo?.decimals !== undefined) {
                actualDesInput = Number(sellTokenInfo.decimals);
              }
            }
          } catch (e) {
            console.warn('[MATCHA SOLANA] Failed to extract decimals from response, using default:', e);
          }
        }

        // Calculate amount_out with correct decimals
        const amount_out = parseFloat(response.buyAmount) / Math.pow(10, actualDesOutput);

        // For debugging: log rate calculation for Solana
        if (chainName.toLowerCase() === 'solana' && response.sellAmount) {
          try {
            const sellAmountActual = parseFloat(response.sellAmount) / Math.pow(10, actualDesInput);
            const rateUSDT = amount_out / sellAmountActual;
            console.log(`[MATCHA SOLANA] Sell: ${sellAmountActual} tokens, Buy: ${amount_out} USDT, Rate: ${rateUSDT} USDT per token`);
          } catch (e) {
            // Silent fail for debugging
          }
        }

        return {
          amount_out: amount_out,
          FeeSwap: getFeeSwap(chainName),
          dexTitle: '0X'
        };
      }
    },
    'unidex-0x': {
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        // ========== SOLANA CHAIN: Use direct Matcha endpoint ==========
        // Unidex 0x proxy doesn't support Solana (EVM only)
        // For Solana, use direct Matcha Solana API instead
        if (chainName && chainName.toLowerCase() === 'solana') {
          const url = `https://matcha.xyz/api/swap/quote/solana?sellTokenAddress=${sc_input_in}&buyTokenAddress=${sc_output_in}&sellAmount=${amount_in_big}&dynamicSlippage=true&slippageBps=50&userPublicKey=Eo6CpSc1ViboPva7NZ1YuxUnDCgqnFDXzcDMDAF6YJ1L`;
          return { url, method: 'GET' };
        }

        // ========== EVM CHAINS: Use Unidex 0x proxy ==========
        const affiliateAddress = '0x8c128f336B479b142429a5f351Af225457a987Fa';
        const feeRecipient = '0x8c128f336B479b142429a5f351Af225457a987Fa';

        const params = new URLSearchParams({
          chainId: String(codeChain),
          sellToken: sc_input_in,
          buyToken: sc_output_in,
          sellAmount: String(amount_in_big),
          slippagePercentage: '0.002',
          affiliateAddress: affiliateAddress,
          taker: userAddr,
          feeRecipient: feeRecipient
        });

        return {
          url: `https://app.unidex.exchange/api/0x/quote?${params.toString()}`,
          method: 'GET'
        };
      },
      parseResponse: (response, { des_output, des_input, chainName }) => {
        if (!response?.buyAmount) throw new Error("Invalid Unidex 0x response structure");

        // ========== SOLANA CHAIN: Use same parsing as direct Matcha ==========
        let actualDesOutput = des_output;
        let actualDesInput = des_input;

        if (chainName && chainName.toLowerCase() === 'solana' && response.route?.tokens) {
          try {
            const tokens = response.route.tokens;
            if (tokens.length > 0) {
              const buyTokenInfo = tokens[tokens.length - 1];
              const sellTokenInfo = tokens[0];

              if (buyTokenInfo?.decimals !== undefined) {
                actualDesOutput = Number(buyTokenInfo.decimals);
                console.log(`[UNIDEX-0X SOLANA] Using buyToken decimals from response: ${actualDesOutput}`);
              }

              if (sellTokenInfo?.decimals !== undefined) {
                actualDesInput = Number(sellTokenInfo.decimals);
              }
            }
          } catch (e) {
            console.warn('[UNIDEX-0X SOLANA] Failed to extract decimals from response, using default:', e);
          }
        }

        const amount_out = parseFloat(response.buyAmount) / Math.pow(10, actualDesOutput);

        // Debug logging for Solana
        if (chainName && chainName.toLowerCase() === 'solana' && response.sellAmount) {
          try {
            const sellAmountActual = parseFloat(response.sellAmount) / Math.pow(10, actualDesInput);
            const rateUSDT = amount_out / sellAmountActual;
            console.log(`[UNIDEX-0X SOLANA] Sell: ${sellAmountActual} tokens, Buy: ${amount_out} USDT, Rate: ${rateUSDT} USDT per token`);
          } catch (e) {
            // Silent fail for debugging
          }
        }

        const FeeSwap = getFeeSwap(chainName);

        // FIX: Gunakan 'UNIDEX-0X' sebagai routeTool untuk membedakan dari Matcha API biasa
        return {
          amount_out,
          FeeSwap,
          dexTitle: '0X',
          routeTool: 'UNIDEX-0X'
        };
      }
    },
    okx: {
      buildRequest: ({ amount_in_big, codeChain, sc_input_in, sc_output_in }) => {
        const selectedApiKey = getRandomApiKeyOKX(apiKeysOKXDEX);
        const timestamp = new Date().toISOString();
        const path = "/api/v6/dex/aggregator/quote";
        const queryParams = `amount=${amount_in_big}&chainIndex=${codeChain}&fromTokenAddress=${sc_input_in}&toTokenAddress=${sc_output_in}`;
        const dataToSign = timestamp + "GET" + path + "?" + queryParams;
        const signature = calculateSignature("OKX", selectedApiKey.secretKeyOKX, dataToSign);
        return {
          url: `https://web3.okx.com${path}?${queryParams}`,
          method: 'GET',
          headers: { "OK-ACCESS-KEY": selectedApiKey.ApiKeyOKX, "OK-ACCESS-SIGN": signature, "OK-ACCESS-PASSPHRASE": selectedApiKey.PassphraseOKX, "OK-ACCESS-TIMESTAMP": timestamp, "Content-Type": "application/json" }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Validate response structure
        if (!response?.data?.[0]?.toTokenAmount) throw new Error("Invalid OKX response structure");

        const data = response.data[0];
        const amount_out = parseFloat(data.toTokenAmount) / Math.pow(10, des_output);

        // Parse gas fee dari estimateGasFee (dalam wei) dan konversi ke USD
        let FeeSwap = getFeeSwap(chainName);
        try {
          const gasWei = parseFloat(data.estimateGasFee || 0);
          if (gasWei > 0) {
            // Get native token price from gas data
            const allGasData = (typeof getFromLocalStorage === 'function')
              ? getFromLocalStorage("ALL_GAS_FEES")
              : null;

            if (allGasData) {
              const gasInfo = allGasData.find(g =>
                String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
              );

              if (gasInfo && gasInfo.nativeTokenPrice) {
                // Convert wei to native token units (divide by 1e18) then multiply by token price
                const gasUSD = (gasWei / 1e18) * gasInfo.nativeTokenPrice;
                if (Number.isFinite(gasUSD) && gasUSD > 0) {
                  FeeSwap = gasUSD;
                }
              }
            }
          }
        } catch(e) {
          // Fallback to default gas fee if calculation fails
        }

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'OKX'
        };
      }
    },
  };
  function createOdosStrategy(version){
    const endpoint = `https://api.odos.xyz/sor/quote/${version}`;
    return {
      buildRequest: ({ codeChain, SavedSettingData, amount_in_big, sc_input, sc_output }) => {
        const wallet = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        return {
          url: endpoint,
          method: 'POST',
          data: JSON.stringify({
            chainId: codeChain,
            compact: true,
            disableRFQs: true,
            userAddr: wallet,
            inputTokens: [{ amount: amount_in_big.toString(), tokenAddress: sc_input }],
            outputTokens: [{ proportion: 1, tokenAddress: sc_output }],
            slippageLimitPercent: 0.3
          })
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const rawOut = Array.isArray(response?.outAmounts) ? response.outAmounts[0] : response?.outAmounts;
        if (!rawOut) throw new Error("Invalid Odos response structure");
        const outNum = parseFloat(rawOut);
        if (!Number.isFinite(outNum) || outNum <= 0) throw new Error("Invalid Odos output amount");
        const gasEstimate = parseFloat(response?.gasEstimateValue || response?.gasFeeUsd || response?.gasEstimateUSD || 0);
        const FeeSwap = (Number.isFinite(gasEstimate) && gasEstimate > 0) ? gasEstimate : getFeeSwap(chainName);
        return {
          amount_out: outNum / Math.pow(10, des_output),
          FeeSwap,
          dexTitle: 'ODOS'
        };
      }
    };
  }
  dexStrategies.odos2 = createOdosStrategy('v2');
  dexStrategies.odos3 = createOdosStrategy('v3');
  dexStrategies.odos = dexStrategies.odos3;

  // =============================
  // DZAP Strategy - Multi-DEX Aggregator
  // =============================
  dexStrategies.dzap = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, des_input, des_output, chainName }) => {
      // Check for special DZAP chain ID (e.g., Solana uses different ID)
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const dzapChainId = chainConfig?.DZAP_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';

      // Use original addresses for Solana (base58 is case-sensitive), lowercase for EVM
      const srcToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const destToken = isSolana ? sc_output_in : sc_output.toLowerCase();

      const body = {
        fromChain: dzapChainId,
        data: [{
          amount: amount_in_big.toString(),
          destDecimals: Number(des_output),
          destToken: destToken,
          slippage: 0.3,
          srcDecimals: Number(des_input),
          srcToken: srcToken,
          toChain: dzapChainId
        }],
        gasless: false
      };
      return {
        url: 'https://api.dzap.io/v1/quotes',
        method: 'POST',
        data: JSON.stringify(body)
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // Parse DZAP response - return top 3 providers with single-DEX style calculation
      // Support both formats:
      // NEW: { quotes: [{ quoteRates: {...} }] }
      // OLD: { [key]: { quoteRates: {...} } }

      let quoteRates;

      // Try NEW format first (quotes array)
      if (response?.quotes && Array.isArray(response.quotes) && response.quotes.length > 0) {
        quoteRates = response.quotes[0]?.quoteRates;
      }
      // Fallback to OLD format (object with dynamic key)
      else {
        const responseKey = Object.keys(response || {})[0];
        const quoteData = response?.[responseKey];
        quoteRates = quoteData?.quoteRates;
      }

      if (!quoteRates || Object.keys(quoteRates).length === 0) {
        throw new Error("DZAP quote rates not found in response");
      }

      // Parse semua DEX dari quoteRates menjadi array
      const subResults = [];
      for (const [dexId, quoteInfo] of Object.entries(quoteRates)) {
        try {
          if (!quoteInfo || !quoteInfo.destAmount) continue;

          const amount_out = parseFloat(quoteInfo.destAmount) / Math.pow(10, des_output);
          const feeUsd = parseFloat(quoteInfo.fee?.gasFee?.[0]?.amountUSD || 0);
          const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0) ? feeUsd : getFeeSwap(chainName);
          const dexName = quoteInfo.providerDetails?.name || dexId;

          // Format sama seperti single DEX result
          subResults.push({
            amount_out: amount_out,
            FeeSwap: FeeSwap,
            dexTitle: dexName.toUpperCase()
          });
        } catch(e) {
          continue;
        }
      }

      if (subResults.length === 0) {
        throw new Error("No valid DZAP quotes found");
      }

      // Sort by amount_out (descending) dan ambil top 3
      subResults.sort((a, b) => b.amount_out - a.amount_out);
      const top3 = subResults.slice(0, 3);

      // Return format multi-DEX dengan top 3 providers
      return {
        amount_out: top3[0].amount_out,
        FeeSwap: top3[0].FeeSwap,
        dexTitle: 'DZAP',
        subResults: top3,
        isMultiDex: true
      };
    }
  };

  // =============================
  // LIFI Strategy - Multi-Route Aggregator (Top 3 Routes)
  // =============================
  dexStrategies.lifi = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
      const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';

      // Check for special LIFI chain ID (e.g., Solana uses different ID)
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';

      // Use original addresses for Solana (base58 is case-sensitive), lowercase for EVM
      const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();

      // For Solana, use Solana wallet address; for EVM use EVM wallet
      const defaultEvmAddr = '0x0000000000000000000000000000000000000000';
      const defaultSolAddr = 'So11111111111111111111111111111111111111112'; // Wrapped SOL as placeholder
      const userAddr = isSolana
        ? (SavedSettingData?.walletSolana || defaultSolAddr)
        : (SavedSettingData?.walletMeta || defaultEvmAddr);

      const body = {
        fromChainId: lifiChainId,
        toChainId: lifiChainId,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount: amount_in_big.toString(),
        fromAddress: userAddr,
        toAddress: userAddr,
        options: {
          slippage: 0.03,
          order: 'RECOMMENDED',
          allowSwitchChain: false
        }
      };

      return {
        url: 'https://li.quest/v1/advanced/routes',
        method: 'POST',
        data: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'x-lifi-api-key': apiKey
        }
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // Parse LIFI response - return top 3 routes with single-DEX style calculation
      const routes = response?.routes;

      if (!routes || !Array.isArray(routes) || routes.length === 0) {
        throw new Error("LIFI routes not found in response");
      }

      // Parse semua routes menjadi array
      const subResults = [];
      for (const route of routes) {
        try {
          if (!route || !route.toAmount) continue;

          const amount_out = parseFloat(route.toAmount) / Math.pow(10, des_output);
          const gasCostUsd = parseFloat(route.gasCostUSD || 0);
          const FeeSwap = (Number.isFinite(gasCostUsd) && gasCostUsd > 0) ? gasCostUsd : getFeeSwap(chainName);

          // Get provider name from first step's tool
          let providerName = 'LIFI';
          try {
            if (route.steps && route.steps.length > 0) {
              const firstStep = route.steps[0];
              providerName = firstStep.toolDetails?.name || firstStep.tool || 'LIFI';
            }
          } catch(_) {}

          // Format sama seperti single DEX result
          subResults.push({
            amount_out: amount_out,
            FeeSwap: FeeSwap,
            dexTitle: providerName.toUpperCase()
          });
        } catch(e) {
          continue;
        }
      }

      if (subResults.length === 0) {
        throw new Error("No valid LIFI routes found");
      }

      // Sort by amount_out (descending) dan ambil top 3
      subResults.sort((a, b) => b.amount_out - a.amount_out);
      const top3 = subResults.slice(0, 3);

      // Return format multi-DEX dengan top 3 routes
      return {
        amount_out: top3[0].amount_out,
        FeeSwap: top3[0].FeeSwap,
        dexTitle: 'LIFI',
        subResults: top3,
        isMultiDex: true
      };
    }
  };

  // =============================
  // JUPITER Ultra Strategy - Solana DEX Aggregator
  // =============================
  // Jupiter Ultra API Keys (rotasi untuk rate limiting)
  const apiKeysJupiter = [
    'dcab1007-f0ee-41b4-9bc4-fbf595524614',
    '5540a0e1-afa5-48a3-940b-38e18d0a6bfd'
  ];
  let jupiterKeyIndex = 0;
  function getRandomApiKeyJupiter() {
    const key = apiKeysJupiter[jupiterKeyIndex];
    jupiterKeyIndex = (jupiterKeyIndex + 1) % apiKeysJupiter.length;
    return key;
  }

  dexStrategies.jupiter = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
      // Jupiter Ultra API v1 Order endpoint
      // Use original addresses (base58 is case-sensitive for Solana)
      const params = new URLSearchParams({
        inputMint: sc_input_in,
        outputMint: sc_output_in,
        amount: amount_in_big.toString()
      });

      // Optional: Add taker wallet for transaction generation
      const walletSolana = SavedSettingData?.walletSolana;
      if (walletSolana) {
        params.append('taker', walletSolana);
      }

      const apiKey = getRandomApiKeyJupiter();
      return {
        url: `https://api.jup.ag/ultra/v1/order?${params.toString()}`,
        method: 'GET',
        headers: {
          'x-api-key': apiKey
        }
      };
    },
    parseResponse: (response, { des_output }) => {
      // Check for error response
      if (response?.errorCode || response?.errorMessage) {
        throw new Error(response.errorMessage || `Jupiter Error: ${response.errorCode}`);
      }

      // Parse Jupiter Ultra response
      if (!response?.outAmount) {
        throw new Error("Invalid Jupiter Ultra response structure");
      }

      const amount_out = parseFloat(response.outAmount) / Math.pow(10, des_output);

      // Parse fees from Ultra API response
      let FeeSwap = 0;
      try {
        // Jupiter Ultra returns fees in lamports, convert to USD
        const sigFeeLamports = parseFloat(response.signatureFeeLamports || 0);
        const prioFeeLamports = parseFloat(response.prioritizationFeeLamports || 0);
        const rentFeeLamports = parseFloat(response.rentFeeLamports || 0);
        const totalFeeLamports = sigFeeLamports + prioFeeLamports + rentFeeLamports;

        // Convert lamports to SOL (1 SOL = 1e9 lamports)
        const feeInSol = totalFeeLamports / 1e9;

        // Get SOL price from gas data
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;

        if (allGasData) {
          const solGasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === 'solana'
          );
          if (solGasInfo && solGasInfo.nativeTokenPrice) {
            FeeSwap = feeInSol * solGasInfo.nativeTokenPrice;
          }
        }

        // Final fallback
        if (!Number.isFinite(FeeSwap) || FeeSwap <= 0) {
          FeeSwap = 0.001; // Default minimal fee for Solana
        }
      } catch(e) {
        FeeSwap = 0.001;
      }

      // Return simple format like Kyber
      return {
        amount_out: amount_out,
        FeeSwap: FeeSwap,
        dexTitle: 'JUPITER'
      };
    }
  };

  // =============================
  // DFLOW Strategy - Solana DEX Aggregator
  // =============================
  dexStrategies.dflow = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big }) => {
      // DFlow Quote API endpoint
      // Use original addresses (base58 is case-sensitive for Solana)
      const params = new URLSearchParams({
        inputMint: sc_input_in,
        outputMint: sc_output_in,
        amount: amount_in_big.toString(),
        slippageBps: 'auto' // Auto slippage
      });

      return {
        url: `https://quote-api.dflow.net/quote?${params.toString()}`,
        method: 'GET'
      };
    },
    parseResponse: (response, { des_output }) => {
      // Check for error response
      if (response?.error || response?.errorMessage) {
        throw new Error(response.errorMessage || response.error || 'DFlow API Error');
      }

      // Parse DFlow response
      if (!response?.outAmount) {
        throw new Error("Invalid DFlow response structure");
      }

      const amount_out = parseFloat(response.outAmount) / Math.pow(10, des_output);

      // Parse fees - DFlow doesn't return explicit gas fee, estimate from Solana
      let FeeSwap = 0;
      try {
        // Get SOL price from gas data for fee estimation
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;

        if (allGasData) {
          const solGasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === 'solana'
          );
          if (solGasInfo && solGasInfo.nativeTokenPrice) {
            // Estimate compute units to SOL (~0.00001 SOL typical)
            const computeUnits = response.simulatedComputeUnits || 300000;
            const estimatedSolFee = (computeUnits / 1e6) * 0.00001 * 5000; // rough estimate
            FeeSwap = estimatedSolFee * solGasInfo.nativeTokenPrice;
          }
        }

        // Final fallback
        if (!Number.isFinite(FeeSwap) || FeeSwap <= 0) {
          FeeSwap = 0.001; // Default minimal fee for Solana
        }
      } catch(e) {
        FeeSwap = 0.001;
      }

      // Return simple format like Kyber
      return {
        amount_out: amount_out,
        FeeSwap: FeeSwap,
        dexTitle: 'DFLOW'
      };
    }
  };

  // =============================
  // KAMINO Strategy - Solana Multi-DEX Aggregator (like LIFI/DZAP)
  // =============================
  dexStrategies.kamino = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big }) => {
      // Kamino K-Swap API endpoint - aggregates 13+ Solana DEX routers
      const params = new URLSearchParams({
        tokenIn: sc_input_in,
        tokenOut: sc_output_in,
        amount: amount_in_big.toString(),
        swapType: 'exactIn',
        maxSlippageBps: '50', // 0.5% max slippage
        includeRfq: 'true',
        timeoutMs: '1200',
        atLeastOneNoMoreThanTimeoutMS: '2000'
      });

      // Add all router types (13 providers)
      const routers = [
        'jupiter', 'jupiterSelfHosted', 'jupiterEuropa',
        'metis', 'per', 'dflow', 'raydium', 'hashflow',
        'okx', 'clover', 'zeroEx', 'spur', 'lifi'
      ];
      routers.forEach(r => params.append('routerTypes[]', r));

      return {
        url: `https://api.kamino.finance/kswap/all-quotes?${params.toString()}`,
        method: 'GET'
      };
    },
    parseResponse: (response, { des_input, des_output }) => {
      // Check for error response
      if (response?.error || !response?.data || !Array.isArray(response.data)) {
        throw new Error(response?.error || 'Invalid Kamino response');
      }

      const quotes = response.data;
      if (quotes.length === 0) {
        throw new Error('No routes found from Kamino');
      }

      // Sort by amountOut descending (best rate first)
      quotes.sort((a, b) => {
        const amtA = parseFloat(a.amountsExactIn?.amountOut || 0);
        const amtB = parseFloat(b.amountsExactIn?.amountOut || 0);
        return amtB - amtA;
      });

      // Get SOL price for fee calculation
      let solPrice = 0;
      try {
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;
        if (allGasData) {
          const solGasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === 'solana'
          );
          if (solGasInfo && solGasInfo.nativeTokenPrice) {
            solPrice = solGasInfo.nativeTokenPrice;
          }
        }
      } catch(_) {}

      // Take top 3 quotes for display (like LIFI/DZAP)
      const top3 = quotes.slice(0, 3).map(quote => {
        const amountOut = parseFloat(quote.amountsExactIn?.amountOut || 0) / Math.pow(10, des_output);
        const amountOutGuaranteed = parseFloat(quote.amountsExactIn?.amountOutGuaranteed || 0) / Math.pow(10, des_output);

        // Calculate fee from slippage difference
        const slippageDiff = amountOut - amountOutGuaranteed;

        // Estimate gas fee (Kamino doesn't return explicit fee)
        // Use typical Solana transaction fee: ~0.000005 SOL
        let FeeSwap = 0.001; // default
        if (solPrice > 0) {
          FeeSwap = 0.000005 * solPrice; // ~5000 lamports
        }

        // Router name mapping for display
        const routerMap = {
          'jupiterSelfHosted': 'Jupiter',
          'jupiterEuropa': 'Jupiter',
          'okx': 'OKX',
          'dflow': 'DFlow',
          'per': 'Perp',
          'zeroEx': '0x',
          'raydium': 'Raydium',
          'hashflow': 'Hashflow',
          'metis': 'Metis',
          'clover': 'Clover',
          'spur': 'Spur',
          'lifi': 'LiFi'
        };

        const routerType = quote.routerType || 'Unknown';
        const displayName = routerMap[routerType] || String(routerType).toUpperCase();

        return {
          amount_out: amountOut,
          amountOut: amountOut,
          FeeSwap: FeeSwap,
          fee: FeeSwap,
          dexTitle: displayName,
          dexName: displayName,
          provider: routerType,
          dexId: routerType,
          priceImpactBps: quote.priceImpactBps || 0,
          guaranteedAmount: amountOutGuaranteed,
          responseTimeMs: quote.responseTimeGetQuoteMs || 0
        };
      });

      // Return multi-DEX format (like LIFI/DZAP)
      return {
        subResults: top3,
        isMultiDex: true
      };
    }
  };

  // =============================
  // RUBIC Strategy - Multi-Chain DEX Aggregator (like LIFI/DZAP)
  // =============================

  // 🚀 ANTI RATE-LIMITING SOLUTION
  // Simple throttling: track last request time and log warning if too frequent
  // General DEX_RESPONSE_CACHE (60s TTL) handles response caching automatically
  const RUBIC_LAST_REQUEST = { timestamp: 0 };
  const RUBIC_MIN_INTERVAL = 1000; // Warn if requests are < 1000ms apart (max 1 req/sec recommended)

  dexStrategies.rubic = {
    useProxy: true, // ✅ Enable CORS proxy to avoid 429/500 errors
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, des_input, chainName }) => {
      // 🚀 THROTTLING CHECK: Track request timing (silent, for potential future rate limiting)
      const now = Date.now();
      RUBIC_LAST_REQUEST.timestamp = now;
      // Rubic chain mapping: app chain names → Rubic API format
      // Rubic API supports both numeric IDs (56, 1, 137) and string names (BSC, ETH, POLYGON)
      const chainMap = {
        'bsc': 'BSC',
        'ethereum': 'ETH',
        'polygon': 'POLYGON',
        'arbitrum': 'ARBITRUM',
        'base': 'BASE',
        'optimism': 'OPTIMISM',
        'avalanche': 'AVAX',
        'gnosis': 'GNOSIS',
        'fantom': 'FANTOM',
        'avalanche-c': 'AVAX'
      };

      const chain = String(chainName || '').toLowerCase();
      const rubicChain = chainMap[chain] || String(chainName || '').toUpperCase();

      // Validate chain is supported
      if (!rubicChain || rubicChain === 'UNDEFINED') {
        throw new Error(`Unsupported chain for Rubic: ${chainName}`);
      }

      // Convert amount from wei/lamports to token units with decimals
      // IMPORTANT: Rubic expects amount as string in token units (e.g., "100" not "100000000000000000000")
      let amountInTokens;
      try {
        const amountNum = parseFloat(amount_in_big) / Math.pow(10, des_input);

        // Validate numeric value
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          throw new Error(`Invalid numeric amount: ${amountNum}`);
        }

        // Format to avoid scientific notation and excessive decimals
        // Use toFixed with appropriate precision, then remove trailing zeros
        const precision = Math.min(des_input, 18); // Max 18 decimal places
        amountInTokens = amountNum.toFixed(precision).replace(/\.?0+$/, '');

        // Ensure we have at least some value
        if (parseFloat(amountInTokens) <= 0) {
          throw new Error(`Amount too small: ${amountInTokens}`);
        }
      } catch (e) {
        throw new Error(`Amount conversion failed: ${e.message} (input: ${amount_in_big}, decimals: ${des_input})`);
      }

      // EVM chains require lowercase addresses
      const srcToken = String(sc_input_in || '').toLowerCase().trim();
      const dstToken = String(sc_output_in || '').toLowerCase().trim();

      // Validate token addresses
      if (!srcToken || srcToken === '0x' || srcToken.length < 10) {
        throw new Error(`Invalid source token address: ${sc_input_in}`);
      }
      if (!dstToken || dstToken === '0x' || dstToken.length < 10) {
        throw new Error(`Invalid destination token address: ${sc_output_in}`);
      }

      // Build request body - exact format that works with Rubic API
      const requestBody = {
        srcTokenAddress: srcToken,
        srcTokenBlockchain: rubicChain,
        srcTokenAmount: amountInTokens,
        dstTokenAddress: dstToken,
        dstTokenBlockchain: rubicChain,
        referrer: 'rubic.exchange'
      };

      // Rubic API requires POST with JSON body (NO params wrapper for /quoteAll)
      // Endpoint: /api/routes/quoteAll returns all routes (for multi-DEX display)
      // Note: /quoteBest uses "params" wrapper, but /quoteAll uses direct body

      // ✅ Apply CORS proxy to avoid 429/500 errors
      let apiUrl = 'https://api-v2.rubic.exchange/api/routes/quoteAll';

      // Get random proxy from CONFIG_PROXY (defined in config.js)
      try {
        const proxyPrefix = (window.CONFIG_PROXY && window.CONFIG_PROXY.PREFIX) || '';
        if (proxyPrefix && !apiUrl.startsWith('http://') && !apiUrl.startsWith(proxyPrefix)) {
          apiUrl = proxyPrefix + apiUrl;
        }
      } catch (e) {
        console.warn('[Rubic] Failed to apply proxy:', e.message);
      }

      return {
        url: apiUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data: JSON.stringify(requestBody) // ✅ Use 'data' with JSON.stringify, not 'body'
      };
    },
    parseResponse: (response, { des_input, des_output, chainName }) => {
      // Validate response structure
      if (!response) {
        throw new Error('Empty response from Rubic API');
      }

      // Check for API errors
      if (response.error || response.message) {
        const errorMsg = response.error?.message || response.message || 'Unknown error from Rubic';
        throw new Error(`Rubic API error: ${errorMsg}`);
      }

      // Validate routes array
      if (!Array.isArray(response.routes)) {
        throw new Error('Invalid Rubic response: routes not found');
      }

      const routes = response.routes;

      if (routes.length === 0) {
        // Check if there are failed routes
        const failedCount = Array.isArray(response.failed) ? response.failed.length : 0;
        if (failedCount > 0) {
          throw new Error(`No successful routes found (${failedCount} failed routes)`);
        }
        throw new Error('No routes available for this trade pair');
      }

      // Sort by destinationTokenAmount descending (best rate first)
      routes.sort((a, b) => {
        const amtA = parseFloat(a.estimate?.destinationTokenAmount || 0);
        const amtB = parseFloat(b.estimate?.destinationTokenAmount || 0);
        return amtB - amtA;
      });

      // Get native token price for fee calculation
      let nativePrice = 0;
      try {
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;
        if (allGasData) {
          const chain = String(chainName || '').toLowerCase();
          const gasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === chain
          );
          if (gasInfo && gasInfo.nativeTokenPrice) {
            nativePrice = gasInfo.nativeTokenPrice;
          }
        }
      } catch(_) {}

      // Take top 3 routes for display (like LIFI/DZAP/Kamino)
      const top3 = routes.slice(0, 3).map((route, idx) => {
        // Parse amount out (already in token units from API)
        const amountOut = parseFloat(route.estimate?.destinationTokenAmount || 0);
        const amountOutMin = parseFloat(route.estimate?.destinationTokenMinAmount || 0);

        // Calculate gas fee
        let FeeSwap = 0;
        try {
          const gasUsd = parseFloat(route.fees?.gasTokenFees?.gas?.totalUsdAmount || 0);
          const protocolUsd = parseFloat(route.fees?.gasTokenFees?.protocol?.fixedUsdAmount || 0);
          FeeSwap = gasUsd + protocolUsd;
        } catch(_) {
          // Fallback: estimate from gas limit
          const gasLimit = parseFloat(route.fees?.gasTokenFees?.gas?.gasLimit || 0);
          const gasPrice = parseFloat(route.fees?.gasTokenFees?.gas?.gasPrice || 0);
          if (gasLimit > 0 && gasPrice > 0 && nativePrice > 0) {
            const gasCost = (gasLimit * gasPrice) / 1e18; // Wei to native token
            FeeSwap = gasCost * nativePrice;
          }
        }

        // Provider name mapping for display (based on Rubic API supported providers)
        const providerMap = {
          // Major Aggregators
          'LIFI': 'LiFi',
          'RANGO': 'Rango',
          'ONE_INCH': '1inch',
          'OPEN_OCEAN': 'OpenOcean',
          'ODOS': 'ODOS',
          'XY_DEX': 'XY Finance',
          // DEX Protocols
          'UNISWAP_V2': 'UniswapV2',
          'UNI_SWAP_V3': 'UniswapV3',
          'SUSHI_SWAP': 'SushiSwap',
          'PANCAKE_SWAP': 'PancakeSwap',
          'QUICK_SWAP': 'QuickSwap',
          'ALGEBRA': 'Algebra',
          'SYNC_SWAP': 'SyncSwap',
          'MUTE_SWAP': 'MuteSwap',
          // Cross-Chain Bridges
          'SQUIDROUTER': 'SquidRouter',
          'SYMBIOSIS': 'Symbiosis',
          'CELER_BRIDGE': 'Celer',
          'DLN': 'DLN',
          'STARGATE_V2': 'Stargate',
          'ORBITER_BRIDGE': 'Orbiter',
          // Chain-Specific
          'AERODROME': 'Aerodrome',
          'FENIX_V2': 'Fenix',
          'FENIX_V3': 'FenixV3',
          'EDDY_FINANCE': 'Eddy',
          'IZUMI': 'iZUMi',
          // Others
          'DODO': 'DODO',
          'CURVE': 'Curve',
          'NATIVE_ROUTER': 'NativeRouter'
        };

        const providerType = route.providerType || 'Unknown';
        const displayName = providerMap[providerType] || String(providerType).replace(/_/g, ' ');

        return {
          amount_out: amountOut,
          amountOut: amountOut,
          FeeSwap: FeeSwap,
          fee: FeeSwap,
          dexTitle: displayName,
          dexName: displayName,
          provider: providerType,
          dexId: providerType.toLowerCase(),
          priceImpact: parseFloat(route.estimate?.priceImpact || 0),
          guaranteedAmount: amountOutMin,
          durationInMinutes: route.estimate?.durationInMinutes || 1
        };
      });

      // Return multi-DEX format (like LIFI/DZAP/Kamino)
      return {
        subResults: top3,
        isMultiDex: true
      };
    }
  };

  // Back-compat alias: support legacy 'kyberswap' key
  dexStrategies.kyberswap = dexStrategies.kyber;
  // ParaSwap aliases: v6.2 is recommended by Velora (v5 is deprecated)
  dexStrategies.paraswap = dexStrategies.paraswap6;  // Default to v6
  // Keep paraswap5 as-is (already defined above) - but note: v5 is deprecated by Velora
  // Alias untuk Matcha (0x)
  dexStrategies.matcha = dexStrategies['0x'];

  // -----------------------------
  // Helper: resolve fetch plan per DEX + arah
  // -----------------------------
  function actionKey(a){ return String(a||'').toLowerCase() === 'pairtotoken' ? 'pairtotoken' : 'tokentopair'; }
  function resolveFetchPlan(dexType, action, chainName){
    try {
      const key = String(dexType||'').toLowerCase();
      const cfg = (root.CONFIG_DEXS || {})[key] || {};
      const map = cfg.fetchdex || {};
      const ak = actionKey(action);
      let primary = map.primary && map.primary[ak] ? String(map.primary[ak]).toLowerCase() : null;

      // ========== MATCHA STRATEGY OVERRIDE ==========
      // For ALL chains, Matcha (0x) should use direct endpoint first
      // Config has primary='unidex-0x', but we want:
      // - Primary: '0x' (direct matcha.xyz/api/swap/price or /quote/solana)
      // - Alternative: 'unidex-0x' (fallback for EVM chains only)
      const isSolana = chainName && String(chainName).toLowerCase() === 'solana';
      const isMatcha = key === '0x' || key === 'matcha';

      if (isMatcha && primary === 'unidex-0x') {
        primary = '0x'; // Override: use direct Matcha endpoint
        console.log(`[${chainName?.toUpperCase() || 'CHAIN'}] Matcha: Using direct 0x endpoint (not unidex-0x)`);
      }

      // Gunakan alternative dari config DEX, atau fallback global dari CONFIG_APP.DEX_FALLBACK
      let alternative = map.alternative && map.alternative[ak] ? String(map.alternative[ak]).toLowerCase() : null;
      if (!alternative) {
        // Fallback global: 'dzap' | 'swoop' | 'none' (dari CONFIG_APP.DEX_FALLBACK)
        const globalFallback = (root.CONFIG_APP && root.CONFIG_APP.DEX_FALLBACK)
          ? String(root.CONFIG_APP.DEX_FALLBACK).toLowerCase()
          : 'dzap';
        alternative = globalFallback !== 'none' ? globalFallback : null;
      }

      // ========== MATCHA ALTERNATIVE OVERRIDE ==========
      // For Matcha on ALL chains:
      // - Solana: fallback to DZAP (Unidex doesn't support Solana)
      // - EVM chains: fallback to unidex-0x
      if (isMatcha) {
        alternative = isSolana ? 'dzap' : 'unidex-0x';
        console.log(`[${chainName?.toUpperCase() || 'CHAIN'}] Matcha alternative: ${alternative}`);
      }

      // ========== SOLANA CHAIN: FORCE DZAP AS ALTERNATIVE (for non-Matcha DEXs) ==========
      // For Solana chain, DZAP is the ONLY alternative for ALL DEX types
      // This overrides any configured alternative (swoop, etc.)
      if (isSolana && !isMatcha) {
        alternative = 'dzap';
      }

      return { primary, alternative };
    } catch(_){ return { primary: null, alternative: null }; }
  }

  // ========== REQUEST DEDUPLICATION & CACHING ==========
  // Cache untuk menyimpan response yang sudah berhasil (60 detik)
  const DEX_RESPONSE_CACHE = new Map();
  const DEX_CACHE_TTL = 60000; // 60 seconds

  // Cache untuk menyimpan ongoing requests (mencegah duplicate concurrent requests)
  const DEX_INFLIGHT_REQUESTS = new Map();

  /**
   * Quote swap output from a DEX aggregator.
   * Builds request by strategy, applies timeout, and returns parsed amounts.
   */
  function getPriceDEX(sc_input_in, des_input, sc_output_in, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, chainName, codeChain, action, tableBodyId) {
    return new Promise((resolve, reject) => {
      const sc_input = sc_input_in.toLowerCase();
      const sc_output = sc_output_in.toLowerCase();

      // ========== CACHE KEY GENERATION ==========
      // Generate unique cache key based on request parameters
      const cacheKey = `${dexType}|${chainName}|${sc_input}|${sc_output}|${amount_in}|${action}`.toLowerCase();

      // ========== CHECK RESPONSE CACHE ==========
      // Check if we have a recent cached response
      if (DEX_RESPONSE_CACHE.has(cacheKey)) {
        const cached = DEX_RESPONSE_CACHE.get(cacheKey);
        const now = Date.now();
        if (now - cached.timestamp < DEX_CACHE_TTL) {
          // Cache hit - return cached response immediately
          const ageSeconds = Math.round((now - cached.timestamp) / 1000);
          console.log(`[DEX CACHE HIT] ${dexType.toUpperCase()} (age: ${ageSeconds}s) - Request saved!`);
          resolve(cached.response);
          return;
        } else {
          // Cache expired - remove from cache
          DEX_RESPONSE_CACHE.delete(cacheKey);
        }
      }

      // ========== CHECK INFLIGHT REQUESTS ==========
      // Check if there's already an ongoing request for this exact same parameters
      if (DEX_INFLIGHT_REQUESTS.has(cacheKey)) {
        // Request deduplication - attach to existing request
        console.log(`[DEX DEDUP] ${dexType.toUpperCase()} - Duplicate request prevented!`);
        const existingRequest = DEX_INFLIGHT_REQUESTS.get(cacheKey);
        existingRequest.then(resolve).catch(reject);
        return;
      }

      const SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});
      const timeoutMilliseconds = Math.max(Math.round((SavedSettingData.speedScan || 4) * 1000));
      const amount_in_big = BigInt(Math.round(Math.pow(10, des_input) * amount_in));

      const runStrategy = (strategyName) => new Promise((res, rej) => {
        try {
          const sname = String(strategyName || '').toLowerCase();
          // DZAP dan SWOOP sekarang hanya digunakan sebagai fallback alternatif
          // Langsung arahkan ke getPriceAltDEX jika strategy adalah 'dzap' atau 'swoop'
          if (sname === 'swoop' || sname === 'dzap') {
            const force = sname; // paksa jenis fallback khusus
            getPriceAltDEX(sc_input, des_input, sc_output, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, chainName, codeChain, action, { force })
              .then(res)
              .catch(rej);
            return;
          }

          // Resolve dari registry jika ada STRATEGY override
          let sKey = sname;
          try {
            if (root.DEX && typeof root.DEX.get === 'function') {
              const entry = root.DEX.get(dexType);
              if (entry && entry.strategy) sKey = String(entry.strategy).toLowerCase();
            }
          } catch(_) {}

          const strategy = dexStrategies[sKey];
          if (!strategy) return rej(new Error(`Unsupported strategy: ${sKey}`));

          const requestParams = { chainName, sc_input, sc_output, amount_in_big, des_output, SavedSettingData, codeChain, action, des_input, sc_input_in, sc_output_in };
          const { url, method, data, headers } = strategy.buildRequest(requestParams);

          // Apply proxy if configured for this DEX
          const cfg = (typeof DEX !== 'undefined' && DEX.get) ? (DEX.get(dexType) || {}) : {};
          const strategyAllowsProxy = strategy?.useProxy !== false;
          const useProxy = !!cfg.proxy && strategyAllowsProxy;
          const proxyPrefix = (root.CONFIG_PROXY && root.CONFIG_PROXY.PREFIX) ? String(root.CONFIG_PROXY.PREFIX) : '';
          const finalUrl = (useProxy && proxyPrefix && typeof url === 'string' && !url.startsWith(proxyPrefix)) ? (proxyPrefix + url) : url;

          $.ajax({
            url: finalUrl, method, dataType: 'json', timeout: timeoutMilliseconds, headers, data,
            contentType: data ? 'application/json' : undefined,
            success: function (response) {
              try {
                const parsed = strategy.parseResponse(response, requestParams);
                const { amount_out, FeeSwap, dexTitle, subResults, isMultiDex } = parsed;
                res({
                  dexTitle, sc_input, des_input, sc_output, des_output, FeeSwap, amount_out, apiUrl: url, tableBodyId,
                  subResults: subResults || null, // Pass subResults untuk DZAP
                  isMultiDex: isMultiDex || false  // Pass flag isMultiDex
                });
              } catch (error) {
                rej({ statusCode: 500, pesanDEX: `Parse Error: ${error.message}`, DEX: sKey.toUpperCase() });
              }
            },
            error: function (xhr, textStatus) {
              let status = 0;
              try { status = Number(xhr && xhr.status) || 0; } catch(_) {}
              // Heuristik: jika body JSON menyimpan status upstream (mis. 429) walau XHR 200/parsererror
              try {
                const txt = xhr && xhr.responseText;
                if (txt && typeof txt === 'string' && txt.length) {
                  try {
                    const parsed = JSON.parse(txt);
                    const upstream = Number(parsed.status || parsed.statusCode || parsed.code);
                    if (Number.isFinite(upstream) && upstream >= 400) status = upstream;
                  } catch(_) {}
                }
              } catch(_) {}
              const isParser = String(textStatus||'').toLowerCase() === 'parsererror';
              let coreMsg;
              if (textStatus === 'timeout') coreMsg = 'Request Timeout';
              else if (status === 200) coreMsg = isParser ? 'Parser Error (200)' : 'XHR Error (200)';
              else if (status > 0) coreMsg = describeHttpStatus(status);
              else coreMsg = `Error: ${textStatus||'unknown'}`;

              const label = status > 0 ? (status === 200 ? '[XHR ERROR 200]' : `[HTTP ${status}]`) : '';
              // FIX: Swap token & pair address untuk arah PairtoToken (DEX→CEX)
              const isPairtoToken = String(action || '').toLowerCase() === 'pairtotoken';
              const tokenAddr = isPairtoToken ? sc_output_in : sc_input_in;
              const pairAddr = isPairtoToken ? sc_input_in : sc_output_in;
              const linkDEX = generateDexLink(dexType, chainName.toLowerCase(), codeChain, NameToken, tokenAddr, NamePair, pairAddr);
              rej({ statusCode: status, pesanDEX: `${String(sKey||'').toUpperCase()}: ${label} ${coreMsg}` , DEX: String(sKey||'').toUpperCase(), dexURL: linkDEX, textStatus });
            },
          });
        } catch (error) {
          rej({ statusCode: 500, pesanDEX: `Request Build Error: ${error.message}`, DEX: String(strategyName||'').toUpperCase() });
        }
      });

      const plan = resolveFetchPlan(dexType, action, chainName);
      const primary = plan.primary || String(dexType||'').toLowerCase();
      const alternative = plan.alternative || null;

      // ========== CREATE INFLIGHT REQUEST PROMISE ==========
      // Create promise chain and store in inflight cache to prevent duplicate requests
      const inflightPromise = runStrategy(primary)
        .then((result) => {
          // SUCCESS: Cache the response for future use
          DEX_RESPONSE_CACHE.set(cacheKey, {
            response: result,
            timestamp: Date.now()
          });
          return result;
        })
        .catch((e1) => {
          const code = Number(e1 && e1.statusCode);
          const primaryKey = String(primary || '').toLowerCase();
          // Treat ODOS variants + Hinkal proxy sebagai satu keluarga
          const isOdosFamily = ['odos','odos2','odos3','hinkal'].includes(primaryKey);
          const noResp = !Number.isFinite(code) || code === 0;
          const isNoRespFallback = noResp && (isOdosFamily || primaryKey === 'kyber' || primaryKey === '1inch');

          // ========== SOLANA CHAIN: ALWAYS FALLBACK ON TIMEOUT ==========
          // For Solana chain, ANY timeout/no-response should trigger fallback to DZAP
          // This ensures Matcha and other DEX timeouts will use DZAP as backup
          const isSolanaChain = chainName && String(chainName).toLowerCase() === 'solana';
          const isSolanaNoResp = isSolanaChain && noResp;

          // ========== MATCHA EVM CHAINS: ALWAYS FALLBACK ON ERROR ==========
          // For Matcha on EVM chains, ANY error should trigger fallback to unidex-0x
          // This ensures we try Unidex proxy if direct Matcha endpoint fails
          const isMatchaPrimary = primaryKey === '0x';
          const isMatchaEVMError = isMatchaPrimary && !isSolanaChain;

          const computedAlt = alternative;
          // Fallback hanya untuk:
          // 1. Rate limit (429)
          // 2. Server error (500+)
          // 3. No response (timeout/network error) for specific DEX families
          // 4. [SOLANA ONLY] ANY timeout/no-response (falls back to DZAP)
          // 5. [MATCHA EVM] ANY error when using direct Matcha (falls back to unidex-0x)
          const shouldFallback = computedAlt && (
            (Number.isFinite(code) && (code === 429 || code >= 500)) || // Rate limit atau server error
            isNoRespFallback || // Atau no response (timeout/network error) untuk ODOS/Kyber/1inch
            isSolanaNoResp || // [SOLANA] Atau timeout pada chain Solana (fallback ke DZAP)
            isMatchaEVMError // [MATCHA EVM] Atau error pada Matcha EVM chains (fallback ke unidex-0x)
          );
          if (!shouldFallback) throw e1;

          // Try alternative strategy
          return runStrategy(computedAlt)
            .then((result) => {
              // SUCCESS: Cache the fallback response
              DEX_RESPONSE_CACHE.set(cacheKey, {
                response: result,
                timestamp: Date.now()
              });
              return result;
            });
        })
        .finally(() => {
          // CLEANUP: Remove from inflight cache after completion (success or error)
          DEX_INFLIGHT_REQUESTS.delete(cacheKey);
        });

      // Store in inflight cache
      DEX_INFLIGHT_REQUESTS.set(cacheKey, inflightPromise);

      // Attach resolve/reject to the inflight promise
      inflightPromise.then(resolve).catch(reject);
    });
  }

  /**
   * Optional fallback quoting via external SWOOP service.
   */
  function getPriceAltDEX(sc_input, des_input, sc_output, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, nameChain, codeChain, action, options) {
    // Default fallback policy: SWOOP atau DZAP sesuai config DEX
    const force = options && options.force ? String(options.force).toLowerCase() : null; // 'swoop' | 'dzap' | null

    // untuk okx,0x,kyber,paraswap,odos gunakan fallback SWOOP
    function fallbackSWOOP(){
      return new Promise((resolve, reject) => {
        const dexLower = String(dexType || '').toLowerCase();
        const slugMap = {
          'odos': 'odos',
          'kyber': 'kyberswap',
          'paraswap': 'paraswap',
          '0x': '0x',
          'okx': 'okx'
        };
        const aggregatorSlug = slugMap[dexLower] || dexLower;

        const SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});
        const payload = {
          chainId: codeChain, aggregatorSlug: aggregatorSlug, sender: SavedSettingData.walletMeta,
          inToken: { chainId: codeChain, type: 'TOKEN', address: sc_input.toLowerCase(), decimals: parseFloat(des_input) },
          outToken: { chainId: codeChain, type: 'TOKEN', address: sc_output.toLowerCase(), decimals: parseFloat(des_output) },
          amountInWei: String(BigInt(Math.round(Number(amount_in) * Math.pow(10, des_input)))),
          slippageBps: '100', gasPriceGwei: Number(getFromLocalStorage('gasGWEI', 0)),
        };
        $.ajax({
          url: 'https://bzvwrjfhuefn.up.railway.app/swap', // Endpoint SWOOP
          type: 'POST', contentType: 'application/json', data: JSON.stringify(payload),
          success: function (response) {
            if (!response || !response.amountOutWei) return reject({ pesanDEX: 'SWOOP response invalid' });
            const amount_out = parseFloat(response.amountOutWei) / Math.pow(10, des_output);
            const FeeSwap = getFeeSwap(nameChain);
            resolve({ dexTitle: dexType, sc_input, des_input, sc_output, des_output, FeeSwap, dex: dexType, amount_out });
          },
          error: function (xhr, textStatus) {
            let status = 0; try { status = Number(xhr && xhr.status) || 0; } catch(_) {}
            try {
              const txt = xhr && xhr.responseText;
              if (txt && typeof txt === 'string' && txt.length) {
                try {
                  const parsed = JSON.parse(txt);
                  const upstream = Number(parsed.status || parsed.statusCode || parsed.code);
                  if (Number.isFinite(upstream) && upstream >= 400) status = upstream;
                } catch(_) {}
              }
            } catch(_) {}
            const isParser = String(textStatus||'').toLowerCase() === 'parsererror';
            let coreMsg;
            if (textStatus === 'timeout') coreMsg = 'Request Timeout';
            else if (status === 200) coreMsg = isParser ? 'Parser Error (200)' : 'XHR Error (200)';
            else if (status > 0) coreMsg = describeHttpStatus(status);
            else coreMsg = `Error: ${textStatus||'unknown'}`;
            const prefix = status > 0 ? (status === 200 ? '[XHR ERROR 200]' : `[HTTP ${status}]`) : '';
            const isDark = (typeof window !== 'undefined' && window.isDarkMode && window.isDarkMode()) || (typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode'));
            const errColor = isDark ? '#7e3636' : '#ffcccc';
            reject({ statusCode: status, pesanDEX: `SWOOP: ${prefix} ${coreMsg}`, color: errColor, DEX: dexType.toUpperCase(), textStatus });
          }
        });
      });
    }

    // untuk okx,zerox(0x),kyber,paraswap,odos gunakan fallback DZAP
    function fallbackDZAP(){
      return new Promise((resolve, reject) => {
        const SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});
        const fromAmount = String(BigInt(Math.round(Number(amount_in) * Math.pow(10, des_input))));
        const dexLower = String(dexType || '').toLowerCase();
        const exchangeMap = {
          '0x': 'zerox',         // Sesuai respons DZAP
          'matcha': 'zerox',      // Alias untuk 0x
          'kyber': 'kyberSwap',   // Sesuai respons DZAP
          'kyberswap': 'kyberSwap', // Alias untuk kyber
          '1inch': '1inch',
          'odos': 'odos',
          'odos2': 'odos',
          'odos3': 'odos',
          'okx': 'okx',
          'paraswap': 'paraSwap' // Sesuai respons DZAP
        };
        const displayMap = {
          '0x': '0X',
          'kyber': 'KYBER',
          'kyberswap': 'KYBER',
          '1inch': '1INCH',
          'odos': 'ODOS',
          'odos2': 'ODOS',
          'odos3': 'ODOS',
          'okx': 'OKX',
          'paraswap': 'PARASWAP',
          'fly': 'FLY'
        };
        const exchangeSlug = exchangeMap[dexLower] || dexLower;
        const displayTitle = displayMap[dexLower] || dexLower.toUpperCase();

        // Format request body baru sesuai dengan contoh yang diberikan
        const body = {
          fromChain: Number(codeChain),
          data: [{
            amount: fromAmount,
            destDecimals: Number(des_output),
            destToken: sc_output.toLowerCase(),
            slippage: 0.3, // Nilai slippage default
            srcDecimals: Number(des_input),
            srcToken: sc_input.toLowerCase(),
            toChain: Number(codeChain)
          }],
          integratorId: 'dzap', // Sesuai contoh
          gasless: false
        };

        $.ajax({
          url: 'https://api.dzap.io/v1/quotes', // Endpoint tetap sama, hanya body yang berubah
          method: 'POST',
          dataType: 'json',
          contentType: 'application/json',
          data: JSON.stringify(body),
          success: function(response){
            // Struktur respons Dzap bersarang dan memiliki key dinamis.
            const responseKey = Object.keys(response || {})[0];
            const quoteData = response?.[responseKey];
            const quoteRates = quoteData?.quoteRates;

            // Manual console log untuk respons dari provider DEX utama di Dzap
            // if (quoteRates && quoteRates[exchangeSlug]) {
            //   console.log(`[DZAP ALT RESPONSE for ${exchangeSlug.toUpperCase()}]`, quoteRates[exchangeSlug]);
            // } else {
            //   console.log(`[DZAP ALT RESPONSE] (Provider for ${exchangeSlug.toUpperCase()} not found, showing full response)`, response);
            // }

            if (!quoteRates || Object.keys(quoteRates).length === 0) {
              return reject({ pesanDEX: 'DZAP quote rates not found' });
            }

            // 1. Coba dapatkan quote dari provider yang sesuai dengan DEX utama (exchangeSlug).
            let targetQuote = quoteRates[exchangeSlug];

            // 2. Jika tidak ada, ambil quote pertama yang tersedia sebagai fallback.
            if (!targetQuote) {
              const firstProviderKey = Object.keys(quoteRates)[0];
              targetQuote = quoteRates[firstProviderKey];
            }

            if (!targetQuote || !targetQuote.destAmount) return reject({ pesanDEX: 'DZAP valid quote not found' });

            const amount_out = parseFloat(targetQuote.destAmount) / Math.pow(10, des_output);
            const feeUsd = parseFloat(targetQuote.fee?.gasFee?.[0]?.amountUSD || 0);
            const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0) ? feeUsd : getFeeSwap(nameChain);
            // Gunakan ID provider dari Dzap sebagai routeTool untuk ditampilkan di UI (VIA ...)
            const rawTool = targetQuote.providerDetails?.id || exchangeSlug || 'dzap';

            resolve({
              dexTitle: displayTitle,
              sc_input, des_input, sc_output, des_output,
              FeeSwap, dex: dexType, amount_out,
              routeTool: String(rawTool).toUpperCase()
            });
          },
          error: function(xhr, textStatus){
            let status = 0; try { status = Number(xhr && xhr.status) || 0; } catch(_) {}
            try {
              const txt = xhr && xhr.responseText;
              if (txt && typeof txt === 'string' && txt.length) {
                try {
                  const parsed = JSON.parse(txt);
                  const upstream = Number(parsed.status || parsed.statusCode || parsed.code);
                  if (Number.isFinite(upstream) && upstream >= 400) status = upstream;
                } catch(_) {}
              }
            } catch(_) {}
            const isParser = String(textStatus||'').toLowerCase() === 'parsererror';
            let coreMsg;
            if (textStatus === 'timeout') coreMsg = 'Request Timeout';
            else if (status === 200) coreMsg = isParser ? 'Parser Error (200)' : 'XHR Error (200)';
            else if (status > 0) coreMsg = describeHttpStatus(status);
            else coreMsg = `Error: ${textStatus||'unknown'}`;
            const prefix = status > 0 ? (status === 200 ? '[XHR ERROR 200]' : `[HTTP ${status}]`) : '';
            const isDark = (typeof window !== 'undefined' && window.isDarkMode && window.isDarkMode()) || (typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode'));
            const errColor = isDark ? '#7e3636' : '#ffcccc';
            reject({ statusCode: status, pesanDEX: `DZAP: ${prefix} ${coreMsg}`, color: errColor, DEX: dexType.toUpperCase(), textStatus });
          }
        });
      });
    }

    // FIX: Pilih fallback berdasarkan CONFIG_DEXS[dex].alternative per arah, baru CONFIG_APP.DEX_FALLBACK
    let configFallback = null;
    try {
      const dexLower = String(dexType || '').toLowerCase();
      const dexConfig = (root.CONFIG_DEXS || {})[dexLower];
      if (dexConfig && dexConfig.fetchdex && dexConfig.fetchdex.alternative) {
        const actionKey = String(action||'').toLowerCase() === 'pairtotoken' ? 'pairtotoken' : 'tokentopair';
        const altStrategy = dexConfig.fetchdex.alternative[actionKey];
        if (altStrategy) {
          configFallback = String(altStrategy).toLowerCase();
        }
      }
    } catch(_) {}

    // Fallback global jika tidak ada alternative per-DEX
    if (!configFallback) {
      configFallback = (root.CONFIG_APP && root.CONFIG_APP.DEX_FALLBACK)
        ? String(root.CONFIG_APP.DEX_FALLBACK).toLowerCase()
        : 'dzap';
    }

    const fallbackType = force || configFallback;

    // Jika 'none', reject langsung tanpa fallback
    if (fallbackType === 'none') {
      return Promise.reject({ pesanDEX: 'Fallback disabled', DEX: dexType.toUpperCase() });
    }

    if (fallbackType === 'dzap') {
      return fallbackDZAP();
    }
    // Default fallback adalah swoop
    return fallbackSWOOP();
  }

  if (typeof App.register === 'function') {
    App.register('Services', { DEX: { dexStrategies, getPriceDEX, getPriceAltDEX } });
  }

  // Lightweight DEX registry for link builders and policy
  (function initDexRegistry(){
    const REG = new Map();
    // Alias mapping untuk normalize nama DEX yang berbeda
    const ALIASES = {
      'kyberswap': 'kyber',
      'matcha': '0x',
      '1inch': '1inch',
      'odos2': 'odos',
      'odos3': 'odos',
      'hinkal': 'odos',
      'okxdex': 'okx'
    };
    function norm(n){
      const lower = String(n||'').toLowerCase();
      return ALIASES[lower] || lower;
    }
    const DexAPI = {
      register(name, def){
        const key = norm(name);
        if (!key) return;
        const entry = {
          builder: def?.builder,
          allowFallback: !!def?.allowFallback,
          strategy: def?.strategy || null,
          proxy: !!def?.proxy,
        };
        REG.set(key, entry);
        // keep CONFIG_DEXS in sync for existing callers
        root.CONFIG_DEXS = root.CONFIG_DEXS || {};
        root.CONFIG_DEXS[key] = root.CONFIG_DEXS[key] || {};
        if (typeof entry.builder === 'function') root.CONFIG_DEXS[key].builder = entry.builder;
        if ('allowFallback' in entry) root.CONFIG_DEXS[key].allowFallback = entry.allowFallback;
        if ('proxy' in entry) root.CONFIG_DEXS[key].proxy = entry.proxy;
      },
      get(name){ return REG.get(norm(name)) || null; },
      list(){ return Array.from(REG.keys()); },
      normalize(name){ return norm(name); }
    };

    // Seed from existing CONFIG_DEXS if present (builder, allowFallback, strategy)
    try {
      Object.keys(root.CONFIG_DEXS || {}).forEach(k => {
        const d = root.CONFIG_DEXS[k] || {};
        DexAPI.register(k, { builder: d.builder, allowFallback: !!d.allowFallback, strategy: d.STRATEGY || null, proxy: !!d.proxy });
      });
    } catch(_){}

    root.DEX = DexAPI;

    // Register FlyTrade dengan proxy enabled
    DexAPI.register('fly', {
      allowFallback: false,
      proxy: true,
      builder: function({ chainName, codeChain, tokenAddress, pairAddress }) {
        return `https://fly.trade/swap?network=${String(chainName||'').toLowerCase()}&from=${pairAddress}&to=${tokenAddress}`;
      }
    });
  })();
})(typeof window !== 'undefined' ? window : this);
