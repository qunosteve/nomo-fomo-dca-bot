// setup.ts (in project root)
// #!/usr/bin/env ts-node
// @ts-nocheck

import fs from "fs";
import path from "path";
const bip39 = require("bip39");
import { derivePath } from "ed25519-hd-key";
import { Keypair } from "@solana/web3.js";
import axios from "axios";

const inquirerModule = require("inquirer");
const inquirer = inquirerModule.default || inquirerModule;

const DEXSCREENER_SEARCH = "https://api.dexscreener.com/latest/dex/search";

async function mnemonicToEnvKey(mnemonic) {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const derived = derivePath("m/44'/501'/0'/0'", seed.toString("hex")).key;
  const kp = Keypair.fromSeed(derived);
  return JSON.stringify(Array.from(kp.secretKey));
}

async function lookupPairs(symbol) {
  const { data } = await axios.get(DEXSCREENER_SEARCH, { params: { query: symbol } });
  return data.pairs
    .filter(p => p.chainId === "solana")
    .map(p => ({ name: `${p.baseToken.symbol}/${p.quoteToken.symbol}`, value: { pairAddress: p.pairAddress, toTokenMint: p.baseToken.address } }));
}

async function main() {
  console.log("\n🛠️  Running bot setup…\n");

  const envPath = path.resolve(process.cwd(), ".env");
  let envLines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8').split(/\r?\n/) : [];
  const envIndex = {};
  envLines.forEach((line, idx) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m) envIndex[m[1]] = idx;
  });

  const getDefault = (key, fallback) => {
    if (envIndex[key] == null) return fallback;
    const line = envLines[envIndex[key]];
    const idx = line.indexOf('=');
    return idx >= 0 ? line.slice(idx + 1) : fallback;
  };

  const sections = ['PRIVATE_KEY', 'PAIR', 'LADDER', 'TICK', 'RPC'];
  let updateSections = sections;
  if (envIndex.PRIVATE_KEY != null) {
    const sel = await inquirer.prompt({
      name: 'updateSections', type: 'checkbox', message: 'Select which settings to update:',
      choices: [
        { name: 'Seed Phrase / Private Key', value: 'PRIVATE_KEY' },
        { name: 'Token & Pair', value: 'PAIR' },
        { name: 'Budget, Ladder & Profit', value: 'LADDER' },
        { name: 'Tick and Indicators', value: 'TICK' },
        { name: 'RPC & Console', value: 'RPC' }
      ]
    });
    updateSections = sel.updateSections;
  }

  let privateKey;
  if (updateSections.includes('PRIVATE_KEY')) {
    let mnemonic;
    do {
      const words = [];
      console.log('Enter your 12-word Solana seed phrase:');
      for (let i = 1; i <= 12; i++) {
        const ans = await inquirer.prompt({ name: `w${i}`, type: 'input', message: `Word ${i}:` });
        words.push(ans[`w${i}`].trim());
      }
      mnemonic = words.join(' ');
      if (!bip39.validateMnemonic(mnemonic)) console.log('❌ Invalid phrase');
    } while (!bip39.validateMnemonic(mnemonic));
    privateKey = await mnemonicToEnvKey(mnemonic);
  } else {
    privateKey = getDefault('PRIVATE_KEY','');
  }

  let pairConfig;
  if (updateSections.includes('PAIR')) {
    const { symbol } = await inquirer.prompt({
      name: 'symbol', type: 'input', message: 'Token symbol (e.g. BONK):',
      default: getDefault('TO_TOKEN_MINT','').slice(0,5) || ''
    });
    let choices;
    try { choices = await lookupPairs(symbol.toUpperCase()); } catch { choices = []; }
    if (choices.length) {
      const ans = await inquirer.prompt({
        name: 'pairConfig', type: 'list', message: 'Select trading pair:',
        choices, default: getDefault('PAIR_ADDRESS','')
      });
      pairConfig = ans.pairConfig;
    } else {
      console.log("⚠️ No auto pairs, enter manually:");
      const pa = await inquirer.prompt({ name: 'pairAddress', type: 'input', message: 'Pair address:', default: getDefault('PAIR_ADDRESS','') });
      const tm = await inquirer.prompt({ name: 'toTokenMint', type: 'input', message: 'Token mint:', default: getDefault('TO_TOKEN_MINT','') });
      pairConfig = { pairAddress: pa.pairAddress, toTokenMint: tm.toTokenMint };
    }
  } else {
    pairConfig = {
      pairAddress: getDefault('PAIR_ADDRESS',''),
      toTokenMint: getDefault('TO_TOKEN_MINT','')
    };
  }

  let initialBuySol, maxBuys, dcaVolMult, sellProfitPct;
  let buyDropPct = parseFloat(getDefault('BUY_DROP_PCT','10'));
  let dcaPctMult = parseFloat(getDefault('DCA_PCT_MULT','1'));
  if (updateSections.includes('LADDER')) {
    const bm = await inquirer.prompt({
      name:'budgetMode', type:'list', message:'Per-buy or total budget?',
      choices:[{name:'Per-buy',value:'perBuy'},{name:'Total budget',value:'budget'}],
      default: getDefault('INITIAL_BUY_SOL','') ? 'perBuy' : 'budget'
    });
    if (bm.budgetMode==='perBuy') {
      const ib = await inquirer.prompt({
        name:'initialBuySol', type:'input', message:'Initial buy SOL:',
        default:getDefault('INITIAL_BUY_SOL','0.01'),
        validate:v=>isNaN(parseFloat(v))?'Number?':true, filter:v=>parseFloat(v)
      });
      initialBuySol = ib.initialBuySol;
      const lc = await inquirer.prompt([
        {name:'maxBuys', type:'input', message:'Rungs:', default:getDefault('MAX_BUYS','5'), validate:v=>Number.isInteger(+v)?true:'Int?', filter:v=>parseInt(v)},
        {name:'dcaVolMult', type:'input', message:'Vol mult:', default:getDefault('DCA_VOL_MULT','2'), validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v)}
      ]);
      maxBuys = lc.maxBuys; dcaVolMult = lc.dcaVolMult;
    } else {
      const tb = await inquirer.prompt({
        name:'totalBudgetSol', type:'input', message:'Total budget SOL:',
        default:'', validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v)
      });
      const lc2 = await inquirer.prompt([
        {name:'maxBuys', type:'input', message:'Rungs:', default:getDefault('MAX_BUYS','5'), validate:v=>Number.isInteger(+v)?true:'Int?', filter:v=>parseInt(v)},
        {name:'dcaVolMult', type:'input', message:'Vol mult:', default:getDefault('DCA_VOL_MULT','2'), validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v)}
      ]);
      maxBuys = lc2.maxBuys; dcaVolMult = lc2.dcaVolMult;
      initialBuySol = tb.totalBudgetSol/(dcaVolMult===1?maxBuys:(Math.pow(dcaVolMult,maxBuys)-1)/(dcaVolMult-1));
      console.log(`\n🔢 Per-buy ≈ ${initialBuySol.toFixed(6)} SOL`);
    }

    let ok = false;
    do {
      const da = await inquirer.prompt([
        {name:'buyDropPct', type:'input', message:'Drop % per rung:', default:getDefault('BUY_DROP_PCT','10'), validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v)},
        {name:'dcaPctMult', type:'input', message:'Drop-% mult:', default:getDefault('DCA_PCT_MULT','1'), validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v)}
      ]);
      buyDropPct = da.buyDropPct; dcaPctMult = da.dcaPctMult;
      const df=Array.from({length:maxBuys}).reduce((f,_,i)=>f*(1-(buyDropPct*Math.pow(dcaPctMult,i))/100),1);
      console.log(`\n📐 Absorbs ~${((1-df)*100).toFixed(1)}% drop.`);
      const ca=await inquirer.prompt({name:'ok',type:'confirm',message:'Proceed?',default:true});
      ok=ca.ok;
    } while(!ok);

    const profitPrompt = await inquirer.prompt([
      { name:'sellProfitPct', type:'input', message:'Profit % sell:', default:getDefault('SELL_PROFIT_PCT','2.5'), validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v) }
    ]);
    sellProfitPct = profitPrompt.sellProfitPct;
  } else {
    initialBuySol = parseFloat(getDefault('INITIAL_BUY_SOL','0'));
    maxBuys = parseInt(getDefault('MAX_BUYS','0'));
    dcaVolMult = parseFloat(getDefault('DCA_VOL_MULT','1'));
    sellProfitPct = parseFloat(getDefault('SELL_PROFIT_PCT','2.5'));
  }

  let tickIntervalMs, bollingerPeriod, bollingerStdDev, bollingerNoBuy;
  if (updateSections.includes('TICK')) {
    const tickPrompts = await inquirer.prompt([
      { name:'tickIntervalMs', type:'input', message:'Tick ms:', default:getDefault('TICK_INTERVAL_MS','60000'), validate:v=>isNaN(parseInt(v))?'Int?':true, filter:v=>parseInt(v) },
      { name:'bollingerPeriod', type:'input', message:'Bollinger Bands period:', default:getDefault('BOLLINGER_PERIOD','20'), validate:v=>isNaN(parseInt(v))?'Int?':true, filter:v=>parseInt(v) },
      { name:'bollingerStdDev', type:'input', message:'Bollinger Bands stddev multiplier:', default:getDefault('BOLLINGER_STDDEV','1.5'), validate:v=>isNaN(parseFloat(v))?'Num?':true, filter:v=>parseFloat(v) },
      { name:'bollingerNoBuy', type:'confirm', message:'Enable Bollinger Bands no-buy zone?', default: (getDefault('BOLLINGER_NO_BUY', '1') === '1') }
    ]);
    tickIntervalMs = tickPrompts.tickIntervalMs;
    bollingerPeriod = tickPrompts.bollingerPeriod;
    bollingerStdDev = tickPrompts.bollingerStdDev;
    bollingerNoBuy = tickPrompts.bollingerNoBuy;
  } else {
    tickIntervalMs = parseInt(getDefault('TICK_INTERVAL_MS','60000'));
    bollingerPeriod = parseInt(getDefault('BOLLINGER_PERIOD','20'));
    bollingerStdDev = parseFloat(getDefault('BOLLINGER_STDDEV','1.5'));
    bollingerNoBuy = (getDefault('BOLLINGER_NO_BUY','1') === '1');
  }

  let rpc, consoleEvents;
  if (updateSections.includes('RPC')) {
    const mc = await inquirer.prompt([
      { name:'rpc', type:'input', message:'RPC endpoint:', default:getDefault('RPC_ENDPOINT','https://api.mainnet-beta.solana.com') },
      { name:'consoleEvents', type:'input', message:'Console filter:', default:getDefault('CONSOLE_EVENTS','ALL') }
    ]);
    rpc = mc.rpc; consoleEvents = mc.consoleEvents;
  } else {
    rpc = getDefault('RPC_ENDPOINT','');
    consoleEvents = getDefault('CONSOLE_EVENTS','ALL');
  }

  const newVars = {
    RPC_ENDPOINT: rpc,
    PRIVATE_KEY: privateKey,
    PAIR_ADDRESS: pairConfig.pairAddress,
    TO_TOKEN_MINT: pairConfig.toTokenMint,
    INITIAL_BUY_SOL: initialBuySol.toString(),
    MAX_BUYS: maxBuys.toString(),
    DCA_VOL_MULT: dcaVolMult.toString(),
    BUY_DROP_PCT: buyDropPct.toString(),
    DCA_PCT_MULT: dcaPctMult.toString(),
    SELL_PROFIT_PCT: sellProfitPct.toString(),
    TICK_INTERVAL_MS: tickIntervalMs.toString(),
    BOLLINGER_PERIOD: bollingerPeriod.toString(),
    BOLLINGER_STDDEV: bollingerStdDev.toString(),
    BOLLINGER_NO_BUY: bollingerNoBuy ? '1' : '0',
    CONSOLE_EVENTS: consoleEvents
  };

  const required = ['RPC_ENDPOINT','PRIVATE_KEY','PAIR_ADDRESS','TO_TOKEN_MINT'];
  const missing = required.filter(key => !newVars[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required settings: ${missing.join(', ')}`);
    console.error('Please re-run setup and complete all required configuration.');
    process.exit(1);
  }
  Object.entries(newVars).forEach(([k,v])=>{
    if(envIndex[k]!=null) envLines[envIndex[k]]=`${k}=${v}`;
    else envLines.push(`${k}=${v}`);
  });
  fs.writeFileSync(envPath, envLines.join('\n'));
  console.log("\n✅ Setup complete! .env updated.\n");
}

main().catch(err=>{console.error(err);process.exit(1);});
