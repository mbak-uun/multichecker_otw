// Centralized API keys and secrets
// - CEX API keys
// - OKX DEX key pool
// - Telegram bot credentials

const CEX_SECRETS = {
    GATE: {
        ApiKey: "1dbe3d4c92a42de270692e65952574d0",
        ApiSecret: "9436bfec02a8ed462bda4bd1a516ba82b4f322dd09e120a2bf7ea6b5f0930ef8",
    },
    BINANCE: {
        ApiKey: "PoMTZjrgq2rUNQHpqvoOW0Ajq1iKytG3OZueMyvYwJmMaH175kuVi2QyB98Zocnb",
        ApiSecret: "bBq5FCpuCghA0hJuil7gCObTqDzYaLaVdsZVsdfSzv4MZ2rDBK6cpN590eXAwfod",
    },
    MEXC: {
        ApiKey: "mx0vgl6hr4AgqcFAd8", // Ganti dengan ApiKey asli
        ApiSecret: "61426ded5d804f97a828eb35ff3c26f6", // Ganti dengan ApiSecret asli
    },
    INDODAX: {
        ApiKey: "HRKOX8GL-KD9ANNF5-T7OKENAH-LHL5PBYQ-NW8GQICL", // Ganti dengan ApiKey asli
        ApiSecret: "2ff67f7546f9b1af3344f4012fbb5561969de9440f1d1432c89473d1fe007deb3f3d0bac7400622b", // Ganti dengan ApiSecret asli
    },
    BYBIT: {
        ApiKey: "H2e7P3xu7zzjmRllrl",
        ApiSecret: "4xBB4NchMTxPBT68Ej86Y2UtC1sFfrcBZG1d",
    },
    BITGET: {
        ApiKey: "bg_7648ff0f3f7083aad770524c41c656c1",
        ApiSecret: "4xBB4NchMTxPBT68Ej86Y2UtC1sFfrcBZG1d",
        Passphrase: "Macpro2025",
    },
    LBANK: {
        ApiKey: "7f84a1cf-3654-4487-b758-41b997df9e04",
        ApiSecret: "FD8F99AE6C9CE4C68FFC5D28AB089FE1",
    }
};

// Telegram bot credentials (moved from config.js)
const CONFIG_TELEGRAM = {
    BOT_TOKEN: "7853809693:AAHl8e_hjRyLgbKQw3zoUSR_aqCbGDg6nHo",
    CHAT_ID: "-1002079288809"
};

// Ensure globals are available for code paths that expect window.*
try {
    if (typeof window !== 'undefined') {
        window.CONFIG_TELEGRAM = window.CONFIG_TELEGRAM || CONFIG_TELEGRAM;
        window.CEX_SECRETS = window.CEX_SECRETS || CEX_SECRETS;
    }
} catch (_) { }

const apiKeysOKXDEX = [
    {
        ApiKeyOKX: "28bc65f0-8cd1-4ecb-9b53-14d84a75814b",
        secretKeyOKX: "E8C92510E44400D8A709FBF140AABEC1",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "04f923ec-98f2-4e60-bed3-b8f2d419c773",
        secretKeyOKX: "3D7D0BD3D985C8147F70592DF6BE3C48",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "cf214e57-8af2-42bf-8afa-3b7880c5a152",
        secretKeyOKX: "26AA1E415682BD8BBDF44A9B1CFF4759",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a77871bd-7855-484c-a675-e429bad3490e",
        secretKeyOKX: "830C9BB8D963F293857DB0CCA5459089",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "87db4731-fbe3-416f-8bb4-a4f5e5cb64f7",
        secretKeyOKX: "B773838680FF09F2069AEE28337BBCD0",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "aec98aef-e2b6-4fb2-b63b-89e358ba1fe1",
        secretKeyOKX: "DB683C83FF6FB460227ACB57503F9233",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "6636873a-e8ab-4063-a602-7fbeb8d85835",
        secretKeyOKX: "B83EF91AFB861BA3E208F2680FAEDDC3",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "989d75b7-49ff-40a1-9c8a-ba94a5e76793",
        secretKeyOKX: "C30FCABB0B95BE4529D5BA1097954D34",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "43c169db-db8c-4aeb-9c25-a2761fdcae49",
        secretKeyOKX: "7F812C175823BBD9BD5461B0E3A106F5",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "904cefba-08ce-48e9-9e8b-33411bf44a0f",
        secretKeyOKX: "91F2761A0B77B1DEED87A54E75BE1CCE",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "bfbd60b5-9aee-461d-9c17-3b401f9671d1",
        secretKeyOKX: "D621020540042C41D984E2FB78BED5E4",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "86f40277-661c-4290-929b-29a25b851a87",
        secretKeyOKX: "9274F990B5BEDAB5EB0C035188880081",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "32503ada-3d34-411a-b50b-b3e0f36f3b47",
        secretKeyOKX: "196658185E65F93963323870B521A6F6",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "80932e81-45b1-497e-bc14-81bdb6ed38d5",
        secretKeyOKX: "4CA9689FA4DE86F4E4CBF2B777CBAA91",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a81d5a32-569a-401c-b207-3f0dd8f949c7",
        secretKeyOKX: "307D988DA44D37C911AA8A171B0975DB",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "ca59e403-4bcb-410a-88bb-3e931a2829d5",
        secretKeyOKX: "AC7C6D593C29F3378BF93E7EDF74CB6D",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "97439591-ea8e-4d78-86bb-bdac8e43e835",
        secretKeyOKX: "54970C78369CE892E2D1B8B296B4E572",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "f7a23981-af15-47f4-8775-8200f9fdfe5d",
        secretKeyOKX: "4F61764255CEDE6D5E151714B3E1E93B",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "4f708f99-2e06-4c81-88cb-3c8323fa42c5",
        secretKeyOKX: "A5B7DCA10A874922F54DC2204D6A0435",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "61061ef4-6d0a-412a-92a9-bdc29c6161a7",
        secretKeyOKX: "4DDF73FD7C38EB50CD09BF84CDB418ED",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "b63f3f68-2008-4df5-9d2e-ae888435332b",
        secretKeyOKX: "1427387D7B1A67018AA26D364700527B",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "ecc51700-e7a2-4c93-9c8d-dbc43bda74c1",
        secretKeyOKX: "6A897CF4D6B56AF6B4E39942C8811871",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "dd3f982e-0e20-4ecd-8a03-12d7b0f54586",
        secretKeyOKX: "9F69EEB1A17CCCE9862B797428D56C00",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a6fd566b-90ed-42c1-8575-1e15c05e395c",
        secretKeyOKX: "77FA24FA1DBFFBA5C9C83367D0EAE676",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a499fca1-14cd-41c3-a5bc-0eb37581eff9",
        secretKeyOKX: "B8101413760E26278FFAF6F0A2BCEA73",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "c3c7e029-64b7-4704-8fdc-6d1861ad876a",
        secretKeyOKX: "B13A8CFA344038FAACB44A3E92C9C057",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "1974cbac-2a05-4892-88e0-eb262d5d2798",
        secretKeyOKX: "6A24A249F758047057A993D9A460DA7F",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "41826044-b7bb-4465-a903-3da61e336747",
        secretKeyOKX: "F42BD9E95F01BCD248C94EE2EECDE19A",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "08af14cb-2f97-472c-90cd-fefd2103f253",
        secretKeyOKX: "FFC78575E3961D11BF134C8DE9CBE7F8",
        PassphraseOKX: "Regi!#007"
    },

    {
        ApiKeyOKX: "adad55d1-bf90-43ac-ac03-0a43dc7ccee2",
        secretKeyOKX: "528AFB3ECC88653A9070F05CC3839611",
        PassphraseOKX: "Cek_Horeg_911",
    },
    {
        ApiKeyOKX: "6866441f-6510-4175-b032-342ad6798817",
        secretKeyOKX: "E6E4285106CB101B39FECC385B64CAB1",
        PassphraseOKX: "Arekpinter123.",
    },
    {
        ApiKeyOKX: "45e4e1f1-1229-456f-ad23-8e1341e76683",
        secretKeyOKX: "1BD8AC02C9461A6D1BEBDFE31B3BFF9F",
        PassphraseOKX: "Regi!#007",
    },
];

const apiKeysLIFI = [
    "e057a54c-1459-44ab-ac50-faa645763c43.a87045f9-d438-4f5a-8707-57f2b7c239b3",
    "8ed53cb9-d883-4f85-9429-116c0193e8f4.3341cd43-bbd1-40e2-ac1b-1969af85a2c6",
    "632e463a-7cf2-4c51-b962-ef78a6608419.98102f8e-7b7c-4a4a-aa3d-d37424b1b4df",
    "057a2f7f-cba7-4db0-b325-ba402737550e.e8851b8d-492a-491d-bf75-80a755f890eb",
    "bcb65083-bbfd-4a0d-89e3-f07abd43a65c.92d118b0-1544-4cf7-8fcb-53a326497bdd",
    "eeee2d0d-dc45-4342-922f-501d26580116.b6bfc1b2-98ca-4ceb-a558-e82de853523b",
    "d251802b-39e2-4134-94e9-447449fc5371.a4d8e5e6-5c94-4124-9466-5d84831544e2",
    "be4bfb73-abcf-47e3-b3b2-edf2241b887b.6a740544-f414-4402-aff8-9ca9a9e3516e",
    "3579f473-a800-46b2-8d03-dbe3988961b8.33739a98-dadc-4b76-b8e7-cb7fd79a12d3",
    "14ddac76-3343-4009-91d4-af6c1d355cac.12384c4a-2844-46e9-add8-7408c0c4d687",
    "6a460b8c-1fcd-42e6-9e04-0f5c6610428d.31f97303-23f1-476b-ad5d-d138926fa4f6",
    "5b976d7c-7b3d-4cea-ba67-b76e34bda0d1.c725a0da-caa2-4eb4-9062-fc722705f79b",
    "3e4c820e-9b71-48fd-80b0-f363ea3c8bc0.20cd7488-25fc-4f82-b063-38bbc26dd878",
    "0877c8c3-66b9-41d5-8082-b33767a32f87.3d522860-428b-4aa3-aa38-f430635a5475",
    "55ce89b2-1b62-426e-bbcf-a34feb9d9a01.f14ad8fb-8286-44a8-8e6f-02cb79f9f801",
    "463c3300-ab2c-4c90-bbfe-c77de13c5b70.eab3e0a8-5199-4a83-91da-e44aae7184f8",
    "a6f75d89-282c-4865-a588-1987d3a00da8.c22a17e7-1aa5-41b8-8d83-efd24a0a684a",
    "12d54546-961e-4706-bf7c-3d868a26c5bf.862448ac-1cbe-411c-9803-5e77d4f38a54",
    "876c98f2-6c5f-451c-9305-2f834e855daf.8bb1259a-bd7b-461a-960c-ecd254b48f50",
    "ce36f6d6-303c-4514-946f-8693000ef077.58a4926e-8e5f-4c20-925e-811470a5064c"
];

// Helper function to get random LIFI API key
function getRandomApiKeyLIFI() {
    const idx = Math.floor(Math.random() * apiKeysLIFI.length);
    return apiKeysLIFI[idx];
}

// =============================
// Rango API Keys (Multi-Chain DEX Aggregator)
// =============================
// Using Rango's official test API key for development
// Source: https://docs.rango.exchange/api-integration/api-key-and-rate-limits
// Note: This test key has low rate limits - request production key for live usage
const apiKeysRango = [
    'c6381a79-2817-4602-83bf-6a641a409e32'  // ✅ Official Rango test API key
];

let rangoKeyIndex = 0;
function getRandomApiKeyRango() {
    const key = apiKeysRango[rangoKeyIndex];
    rangoKeyIndex = (rangoKeyIndex + 1) % apiKeysRango.length;
    return key;
}

// =============================
// DEX API Keys (Centralized)
// =============================
// All DEX API keys stored in one place for better security and management

// 0x (Matcha) API Keys Pool - Multiple keys for rate limit distribution
// Endpoint: https://api.0x.org/swap/allowance-handler/quote
// Headers: 0x-api-key, 0x-version: v2
// Get from: https://dashboard.0x.org
const apiKeys0x = [
   // 'a7203b5d-dc4a-459d-ba9a-236473601562',
   // 'a1144141-30ee-4206-98db-086ab00aaff5',
   // '70bbfa21-a4f8-4ed8-a4a8-538c164c16d5',
   // '2fa77029-f48f-4269-b30b-497723115760',
   // '6a80e383-82c4-4fd7-8acc-2bf810bc5800',
   // '8fe4605b-3a0f-4a7c-b637-3129fed3a51e',
   // '42f5c5b1-fa3e-4e81-bfe3-e012b416fbd4',
   // 'd0a86782-e596-4826-8635-11fbd35ad137',
   // '9b1a614a-bba5-44cd-8cf9-9ed6d94193ce',
  //  '580b8ba4-fcfd-4303-91fa-256f8d66434f',
    'b52adb8e-aa3b-45ab-8341-dc27e006f945',
'fb46960e-2bc2-4b64-a9a0-c02278a7ace6',
'b51ebca4-6cb5-4eb3-8d8a-23052b770eca',
'1acb6d53-00bc-496d-8d1e-31004b0cfdbb',
'eb5c5b8b-0952-4012-add3-956702b5261e',
'5c0037cf-d674-44d5-8890-2b049954b14f',
'167fa150-9295-4f2b-a7f4-fc48d40a5ee3',
'e112a25f-c671-47db-9ab2-630871bb4437',
'429513b3-a305-4caf-a712-4b2d694176cc',
'fbce1ee3-18f2-4550-8e28-28ad4cdfbee9',
'a57447d9-46e4-452b-b593-5399179c43c0',
'e15090b8-8438-42e5-ac3f-59b855cc2912'
];

// Helper function to get random 0x API key
let zeroxKeyIndex = 0;
function getRandomApiKey0x() {
    const key = apiKeys0x[zeroxKeyIndex];
    zeroxKeyIndex = (zeroxKeyIndex + 1) % apiKeys0x.length;
    return key;
}

const DEX_API_KEYS = {
    // 0x (Matcha) API Key - Handled by get0xApiKey() with rotation
    // Use get0xApiKey() to get rotating keys from pool
};

// =============================
// Swing Project IDs
// =============================
// IMPORTANT: Custom project IDs must be configured at https://platform.swing.xyz/
// Each project must enable the chains you want to use (BSC, Ethereum, Polygon, etc.)
// Error "bsc is not a valid chain or is disabled by this project" means the project
// hasn't enabled that chain in the Swing dashboard settings.
//
// Using only 'galaxy-exchange' (demo project) - pre-configured for all chains
const SWING_PROJECT_IDS = [
    'galaxy-exchange'  // ✅ Public demo project - all chains enabled

    // ❌ Custom project IDs disabled - not configured for all chains:
    // 'swing-62370183-4923-4b32-8806-c8729d4d6a2d',  // percobaan1 - BSC disabled
    // 'swing-11f7b12d-4624-4805-8a6c-7ce40a111ec7',  // percobaan1a - BSC disabled
    // 'swing-381b973d-adce-4c6b-8005-4347bab98543',  // percobaan1b - BSC disabled
    // 'swing-a2646b38-c907-443b-9440-2830683e2cf6',  // percobaan2 - BSC disabled
    // 'swing-b7e3b703-224b-4cc9-897d-7a963602fc33',  // percobaan2a - BSC disabled
    // 'swing-067ad581-1328-42df-bd35-29e1c3b888ed'   // percobaan2b - BSC disabled
];

// Helper function to get random Swing project ID
function getRandomSwingProjectId() {
    const idx = Math.floor(Math.random() * SWING_PROJECT_IDS.length);
    return SWING_PROJECT_IDS[idx];
}

// Helper function to get 0x API key (with rotation)
function get0xApiKey() {
    return getRandomApiKey0x();  // ✅ Call rotation function dynamically
}

try {
    if (typeof window !== 'undefined') {
        window.apiKeysLIFI = window.apiKeysLIFI || apiKeysLIFI;
        window.getRandomApiKeyLIFI = window.getRandomApiKeyLIFI || getRandomApiKeyLIFI;
        window.apiKeysRango = window.apiKeysRango || apiKeysRango;
        window.getRandomApiKeyRango = window.getRandomApiKeyRango || getRandomApiKeyRango;
        window.apiKeys0x = window.apiKeys0x || apiKeys0x;
        window.getRandomApiKey0x = window.getRandomApiKey0x || getRandomApiKey0x;
        window.DEX_API_KEYS = window.DEX_API_KEYS || DEX_API_KEYS;
        window.get0xApiKey = window.get0xApiKey || get0xApiKey;
        window.SWING_PROJECT_IDS = window.SWING_PROJECT_IDS || SWING_PROJECT_IDS;
        window.getRandomSwingProjectId = window.getRandomSwingProjectId || getRandomSwingProjectId;
    }
} catch (_) { }
