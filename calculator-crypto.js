// ============================================
// KALKULATOR CRYPTO
// ============================================

(function() {
    'use strict';

    // Rate prices object
    var ratePrice = {
        usdt: 1,
        idr: 0,
        btc: 0,
        eth: 0,
        bnb: 0,
        random1: 0 // Custom token rate
    };

    // Fungsi untuk memformat IDR dengan pemisah ribuan
    function formatIDR(value) {
        return new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    // Fetch initial rates
    function fetchRates() {
        $.when(
            $.getJSON("https://api-gcp.binance.com/api/v3/ticker/price?symbols=[%22BTCUSDT%22,%22ETHUSDT%22,%22BNBUSDT%22,%22POLUSDT%22,%22AVAXUSDT%22,%22SOLUSDT%22]"),
            $.getJSON("https://cors-proxy-rosy.vercel.app/api/proxy?url=https://indodax.com/api/ticker/USDTIDR")
        ).done(function (binanceResponse, indodaxResponse) {
            binanceResponse[0].forEach((res) => {
                switch (res.symbol) {
                    case "BTCUSDT": ratePrice.btc = parseFloat(res.price); break;
                    case "ETHUSDT": ratePrice.eth = parseFloat(res.price); break;
                    case "BNBUSDT": ratePrice.bnb = parseFloat(res.price); break;
                    case "POLUSDT": ratePrice.pol = parseFloat(res.price); break;
                    case "AVAXUSDT": ratePrice.avax = parseFloat(res.price); break;
                    case "SOLUSDT": ratePrice.sol = parseFloat(res.price); break;
                }
            });
            ratePrice.idr = parseFloat(indodaxResponse[0].ticker.last);
            // Also store to localStorage for consistency
            localStorage.setItem('MULTI_USDTRate', ratePrice.idr);
            console.log('✅ IDR rate updated:', ratePrice.idr);
        }).fail(function (error) {
            console.log("-----------------------");
            console.log(error);
            // Fallback: load from localStorage if fetch fails
            const storedRate = parseFloat(localStorage.getItem('MULTI_USDTRate')) || 0;
            if (storedRate > 0) {
                ratePrice.idr = storedRate;
                console.log('ℹ️ Using stored IDR rate:', ratePrice.idr);
            }
        });
    }

    // Update price button handler
    $("#updatePriceBtn").on("click", function() {
        fetchRates();

        var symbol1 = $("#random1symbol").val().toUpperCase().trim();
        if (symbol1) {
            $.getJSON("https://api-gcp.binance.com/api/v3/ticker/price?symbol=" + symbol1 + "USDT")
                .done(function(response) {
                    ratePrice.random1 = parseFloat(response.price);
                    $("#random1price").prop("disabled", false).val(ratePrice.random1.toFixed(8));
                    if (typeof toast !== 'undefined' && toast.info) toast.info("Custom token " + symbol1 + " ditemukan dengan harga " + ratePrice.random1 + " USDT.");
                })
                .fail(function() {
                    if (typeof toast !== 'undefined' && toast.error) toast.error("Custom token tidak ditemukan.");
                    ratePrice.random1 = 0;
                    $("#random1price").prop("disabled", true).val('');
                });
        }

        if (typeof toast !== 'undefined' && toast.info) toast.info("Harga token telah diperbarui!");
    });

    // Check custom token price
    $("#cekTokensBtn").on("click", function () {
        var symbol1 = $("#random1symbol").val().toUpperCase().trim();
        if (!symbol1) {
            if (typeof toast !== 'undefined' && toast.error) toast.error("Masukkan simbol untuk custom token.");
            return;
        }

        $.getJSON("https://api-gcp.binance.com/api/v3/ticker/price?symbol=" + symbol1 + "USDT")
            .done(function (response) {
                ratePrice.random1 = parseFloat(response.price);
                $("#random1price").prop("disabled", false).val(ratePrice.random1.toFixed(8));
                if (typeof toast !== 'undefined' && toast.info) toast.info("Custom token ditemukan: " + symbol1 + " dengan harga " + ratePrice.random1 + " USDT");

                // Add event listener for changing custom token value
                $("#random1price").on("input", function () {
                    convertFromInput('random1');
                });
            })
            .fail(function () {
                if (typeof toast !== 'undefined' && toast.error) toast.error("Token tidak ditemukan.");
                ratePrice.random1 = 0;
                $("#random1price").prop("disabled", true).val('');
            });
    });

    // Convert input dynamically
    window.convertFromInput = function(base) {
        const baseValue = parseFloat($("#" + base + "price").val());
        if (isNaN(baseValue) || baseValue <= 0) return;

        var updatedPrices = {};
        switch (base) {
            case "usdt":
                updatedPrices = {
                    usdt: baseValue,
                    idr: baseValue * ratePrice.idr,
                    btc: baseValue / ratePrice.btc,
                    eth: baseValue / ratePrice.eth,
                    bnb: baseValue / ratePrice.bnb,
                    random1: baseValue / ratePrice.random1
                };
                break;
            case "idr":
                updatedPrices = {
                    usdt: baseValue / ratePrice.idr,
                    idr: baseValue,
                    btc: (baseValue / ratePrice.idr) / ratePrice.btc,
                    eth: (baseValue / ratePrice.idr) / ratePrice.eth,
                    bnb: (baseValue / ratePrice.idr) / ratePrice.bnb,
                    random1: (baseValue / ratePrice.idr) / ratePrice.random1
                };
                break;
            case "btc":
                updatedPrices = {
                    usdt: baseValue * ratePrice.btc,
                    idr: baseValue * ratePrice.btc * ratePrice.idr,
                    btc: baseValue,
                    eth: baseValue * ratePrice.btc / ratePrice.eth,
                    bnb: baseValue * ratePrice.btc / ratePrice.bnb,
                    random1: baseValue * ratePrice.btc / ratePrice.random1
                };
                break;
            case "eth":
                updatedPrices = {
                    usdt: baseValue * ratePrice.eth,
                    idr: baseValue * ratePrice.eth * ratePrice.idr,
                    btc: baseValue * ratePrice.eth / ratePrice.btc,
                    eth: baseValue,
                    bnb: baseValue * ratePrice.eth / ratePrice.bnb,
                    random1: baseValue * ratePrice.eth / ratePrice.random1
                };
                break;
            case "bnb":
                updatedPrices = {
                    usdt: baseValue * ratePrice.bnb,
                    idr: baseValue * ratePrice.bnb * ratePrice.idr,
                    btc: baseValue * ratePrice.bnb / ratePrice.btc,
                    eth: baseValue * ratePrice.bnb / ratePrice.eth,
                    bnb: baseValue,
                    random1: baseValue * ratePrice.bnb / ratePrice.random1
                };
                break;
            case "random1":
                if (ratePrice.random1 === 0) return;
                updatedPrices = {
                    usdt: baseValue * ratePrice.random1,
                    idr: baseValue * ratePrice.random1 * ratePrice.idr,
                    btc: (baseValue * ratePrice.random1) / ratePrice.btc,
                    eth: (baseValue * ratePrice.random1) / ratePrice.eth,
                    bnb: (baseValue * ratePrice.random1) / ratePrice.bnb,
                    random1: baseValue
                };
                break;
        }

        // Update input fields
        updatePrices(updatedPrices, base);
    };

    // Update input fields
    function updatePrices(prices, excludeBase) {
        $.each(prices, function (key, value) {
            if (key !== excludeBase) {
                // If IDR, format with thousand separator
                if (key === "idr") {
                    $("#" + key + "price").val(value ? formatIDR(value) : '');
                } else {
                    $("#" + key + "price").val(value ? value.toFixed(8) : '');
                }
            }
        });
    }

    // Open calculator modal handler
    $('#openCalculatorModal').on('click', function(event) {
        event.preventDefault();
        UIkit.modal('#calculator-modal').show();
    });

    // Load IDR rate from localStorage on initialization
    const storedIDRRate = parseFloat(localStorage.getItem('MULTI_USDTRate')) || 0;
    if (storedIDRRate > 0) {
        ratePrice.idr = storedIDRRate;
        console.log('✅ Loaded stored IDR rate on init:', ratePrice.idr);
    }

    // Fetch rates on initialization
    fetchRates();

})();
