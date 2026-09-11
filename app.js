'use strict';

// Source: https://www.standardreserve.xyz/whitepaper/, v0.1, read 2026-09-11.
// Only visible prose/equations count as disclosure. SVG coordinates, redaction
// widths, and decorative chart arrays in the source are NOT protocol values.
const RULES = Object.freeze({
  branchesPerCharter: 10, initialBranches: 1, foundingCharters: 1000,
  licensesPerCharterPerDay: 3, initialLicensesPerDay: 100, auctionHours: 24,
  licenseOpenFactor: 2, charterOpenFactor: 3, initialDailyCharters: 0,
  licenseBurn: 1, resolutionBurn: 0.5, resolutionRedistribution: 0.5,
  vaultShare: 0.70, liquidityShare: 0.15, teamShare: 0.15,
  buybackVaultFraction: 0.10, buybackPoolFraction: 0.002,
  hardCap: 1000000000, genesisLiquidity: 100000000, issuanceBudget: 900000000
});

// Defaults are scenario observations, not unknown protocol parameters.
const TOY = Object.freeze({
  low: {branches:1,total:1000,licenses:0,retire:0,exampleIssue:10000,balance:0,buyEth:4,sellEth:6,previousFlow:-2,olderFlow:-1,feeEth:1,charterEth:0},
  mid: {branches:4,total:1000,licenses:0,retire:1,exampleIssue:100000,balance:2000,buyEth:18,sellEth:12,previousFlow:4,olderFlow:2,feeEth:10,charterEth:2},
  high: {branches:7,total:1000,licenses:0,retire:2,exampleIssue:500000,balance:10000,buyEth:80,sellEth:30,previousFlow:10,olderFlow:15,feeEth:50,charterEth:10}
});

const SCENARIO_FIELDS = [
  {title:'Charter & branches',section:'§§6–8',open:true,fields:[
    ['branches','Your existing branches','',1,10,1,'One charter · 1–10 branches'],
    ['total','Total existing branches','',1,null,1,'Includes your branches'],
    ['licenses','New licenses to buy','',0,3,1,'Added before the interval'],
    ['retire','Branches to retire','',0,10,1,'Retired after the interval']
  ],note:'New charters start with one branch. Retiring the last branch burns the charter.'},
  {title:'Issuance & balance',section:'§§3, 5, 9',open:true,fields:[
    ['exampleIssue','Example total issuance','STD',0,9e8,'any','Toy interval volume; not a published rate',true],
    ['balance','Opening accrued balance','STD',0,null,'any','Ledger balance before this interval',true],
    ['issuedToDate','Cumulative issuance before interval','STD',0,9e8,'any','Toy history · 900M issuance budget',true]
  ],note:'One snapshot: buy licenses → accrue with fixed branch counts → retire. License payment is a separate STANDARD input; it is not deducted from the accrued ledger balance.'},
  {title:'ETH flows & fees',section:'§§4, 11',fields:[
    ['buyEth','Current epoch: buys','ETH',0,null,'any','Gross ETH entering the pool'],
    ['sellEth','Current epoch: sells','ETH',0,null,'any','Gross ETH leaving the pool'],
    ['previousFlow','Previous epoch net flow','ETH',null,null,'any','Completed epoch n − 1'],
    ['olderFlow','Earlier epoch net flow','ETH',null,null,'any','Completed epoch n − 2'],
    ['feeEth','Trading fees collected','ETH',0,null,'any','Example ETH amount, not a fee rate'],
    ['charterEth','Charter auction proceeds','ETH',0,null,'any','Example total ETH proceeds']
  ]},
  {title:'License auction snapshot',section:'§§7–8',fields:[
    ['boughtToday','Already bought by your charter','',0,3,1,'Before this purchase'],
    ['soldToday','Already sold system-wide','',0,100,1,'Initial daily supply: 100'],
    ['auctionHour','Hours since auction opened','h',0,24,'any','Purchases close at 24h'],
    ['licenseLast','Previous license closing sale','STD',0,null,'any','Scenario observation; optional',true]
  ],note:'A blank closing sale is unknown. Select “No” below only if the previous day had no sales.',select:['licenseHadSales','License sales yesterday?',[['yes','Yes — use closing sale'],['no','No — use the floor']]]},
  {title:'Buyback limits',section:'§11',fields:[
    ['vaultEth','Contraction vault balance','ETH',0,null,'any','Before the hourly tick'],
    ['poolEth','Pool reserve depth','ETH',0,null,'any','ETH-denominated pool reserves']
  ],note:'Independent tick snapshot. The fee split above is not automatically added to this balance. No STANDARD/ETH conversion.'}
];

// Every distinct undisclosed input used by the loop has a blank field. Related
// unknown policy/curve parameters are reference inputs only: a redacted formula
// cannot be reconstructed from a suggestive chart or an approximate sentence.
const UNKNOWN_GROUPS = [
  {title:'Issuance parameters',section:'§5',open:true,fields:[
    ['baseRate','Base issuance per day','STD',0,null,'any'],
    ['multiplier','Policy multiplier m','×',0,null,'any'],
    ['epochDays','Epoch length d','days',0,null,'any']
  ],note:'In Sandbox, issuance uses only base × d × m. The toy volume above is not used.'},
  {title:'License & charter prices',section:'§§7–8',open:true,fields:[
    ['licenseFloor','License floor price','STD',0,null,'any',null,true],
    ['charterFloor','Charter reserve floor','ETH',0,null,'any'],
    ['dailyCharters','Enabled daily charter count','',0,null,1]
  ],note:'The license floor formula is hidden. “About two days of yield” is not treated as an exact formula. Charter auctions initially have a count of zero; an enabled count is your input.'},
  {title:'Exit fee & pressure',section:'§9',open:true,fields:[
    ['exitFee','Committed exit fee','%',0,100,'any',null,true],
    ['pressureGuard','Pressure denominator minimum','STD',0,null,'any',null,true],
    ['feeFloor','Fee curve floor','%',0,100,'any'],
    ['feeCeiling','Fee curve ceiling','%',0,100,'any'],
    ['feeSaturation','Pressure at fee saturation','%',0,100,'any',null,true]
  ],note:'The fee equation is redacted. Enter the committed fee directly; no curve is inferred. Floor, ceiling and saturation are reference values only.'},
  {title:'Other unpublished policy values',section:'§§5, 14',fields:[
    ['multiplierFloor','Multiplier floor','×',0,null,'any'],
    ['multiplierCeiling','Multiplier ceiling','×',0,null,'any'],
    ['launchMultiplier','Initial multiplier','×',0,null,'any'],
    ['rateCut','Rate cut rule / step',null],
    ['rateRaise','Rate raise rule / condition',null],
    ['daysToFull','Sustained inflow to full issuance','days',0,null,'any'],
    ['daysToCeiling','Sustained inflow to ceiling','days',0,null,'any'],
    ['daysToFloor','Sustained outflow: ceiling to floor','days',0,null,'any'],
    ['dilutionCut','Dilution reduction','%',0,100,'any'],
    ['tradingFeeRate','Trading fee rate','%',0,100,'any'],
    ['otherParameters','Other redacted launch settings',null]
  ],note:'Reference inputs only. The multiplier transition and trading-fee calculation are not specified sufficiently to calculate. Values published elsewhere in the paper remain fixed rules, even where the launch table is redacted.'}
];
const SANDBOX_SCENARIO = {title:'Exit & charter observations',section:'TOY',fields:[
  ['withdrawn7d','System-wide withdrawals, trailing 7d','STD',0,null,'any','Scenario observation; optional',true],
  ['bankHeld','Total still held at the bank','STD',0,null,'any','Scenario observation; optional',true],
  ['charterLast','Previous charter closing sale','ETH',0,null,'any','Scenario observation; optional'],
  ['chartersSold','Charters sold today','',0,null,1,'Scenario observation; optional']
],select:['charterHadSales','Charter sales yesterday?',[['yes','Yes — use closing sale'],['no','No — use the floor']]]};

const UNKNOWN_IDS = UNKNOWN_GROUPS.flatMap(g=>g.fields.map(f=>f[0]));
const ALL_FIELDS = [...SCENARIO_FIELDS,...UNKNOWN_GROUPS,SANDBOX_SCENARIO].flatMap(g=>g.fields);
const OPTIONAL_IDS = new Set(['licenseLast','vaultEth','poolEth',...UNKNOWN_IDS,...SANDBOX_SCENARIO.fields.map(f=>f[0])]);
const nf = new Intl.NumberFormat('en-US',{maximumFractionDigits:6});
function fmt(value) { return value === null || !Number.isFinite(value) ? '—' : value !== 0 && Math.abs(value)<0.000001 ? value.toExponential(3) : nf.format(value); }
function esc(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function has(...values) {return values.every(v=>typeof v==='number' && Number.isFinite(v));}
function auctionPrice(floor,last,hadSales,hour,factor) {
  if(!has(floor,hour) || floor<=0 || (hadSales && (!has(last)||last<=0))) return null;
  const start=factor*(hadSales?last:floor);
  // The paper describes a falling auction. Do not invent a clamp for an
  // inconsistent scenario in which its stated open is below its floor.
  if(start<floor) return null;
  return start*Math.pow(floor/start,hour/RULES.auctionHours);
}

function calculate(s) {
  const sandbox=s.mode==='sandbox';
  const n=s.total+s.licenses, b=s.branches+s.licenses;
  const licenseLimit=Math.min(10-s.branches,3-s.boughtToday,100-s.soldToday);
  const rawIssue=sandbox?(has(s.baseRate,s.epochDays,s.multiplier)?s.baseRate*s.epochDays*s.multiplier:null):s.exampleIssue;
  const budgetLeft=RULES.issuanceBudget-s.issuedToDate;
  const issued=budgetLeft===0?0:rawIssue===null?null:Math.min(rawIssue,budgetLeft);
  const share=b/n;
  const accrual=issued===null?null:issued*share;
  const closingBalance=accrual===null?null:s.balance+accrual;
  const released=s.retire===0?0:closingBalance===null?null:closingBalance*s.retire/b;
  const rate=sandbox||s.mode==='simple'?s.exitFee:null;
  const fee=released===0?0:has(released,rate)?released*rate/100:null;
  const wallet=has(released,fee)?released-fee:null;
  const licensePrice=sandbox?auctionPrice(s.licenseFloor,s.licenseLast,s.licenseHadSales!=='no',s.auctionHour,2):null;
  const licenseBurn=s.licenses===0?0:licensePrice===null?null:s.licenses*licensePrice;
  const net=s.buyEth-s.sellEth,signal=s.previousFlow+s.olderFlow;
  const eth=s.feeEth+s.charterEth;
  const tick=has(s.vaultEth,s.poolEth)?Math.min(0.10*s.vaultEth,0.002*s.poolEth):null;
  const pressure=sandbox&&has(s.withdrawn7d,s.bankHeld,s.pressureGuard)&&Math.max(s.bankHeld+s.withdrawn7d,s.pressureGuard)>0?s.withdrawn7d/Math.max(s.bankHeld+s.withdrawn7d,s.pressureGuard):null;
  const charterPrice=sandbox?auctionPrice(s.charterFloor,s.charterLast,s.charterHadSales!=='no',s.auctionHour,3):null;
  return {b,n,licenseLimit,rawIssue,budgetLeft,issued,share,accrual,closingBalance,released,fee,wallet,rate,
    feeBurn:fee===null?null:fee*0.5,redistributed:fee===null?null:fee*0.5,
    retained:closingBalance===null?null:closingBalance-released,remainingBranches:b-s.retire,
    remainingShare:n-s.retire>0?(b-s.retire)/(n-s.retire):null,
    licensePrice,licenseBurn,net,signal,regime:net>0?'Expansion':'Contraction',
    eth,vault:eth*0.7,pol:eth*0.15,team:eth*0.15,polHalf:eth*0.15*0.5,tick,
    remainingVault:tick===null?null:s.vaultEth-tick,pressure,charterPrice};
}

function validate(s) {
  const errors=[];
  for(const f of ALL_FIELDS) {
    const [id,label,unit,min,max,step]=f;
    if(id==='exampleIssue' && s.mode==='sandbox') continue;
    if((UNKNOWN_IDS.includes(id)||SANDBOX_SCENARIO.fields.some(x=>x[0]===id)) && s.mode!=='sandbox' && !(s.mode==='simple'&&id==='exitFee')) continue;
    if(unit===null) continue;
    const value=s[id];
    if(value===null && OPTIONAL_IDS.has(id)) continue;
    const range=min!==null&&max!==null?` from ${fmt(min)} to ${fmt(max)}`:min!==null?` of at least ${fmt(min)}`:'';
    if(value===null || !Number.isFinite(value) || (min!==null&&value<min) || (max!==null&&value>max) || (step===1&&!Number.isSafeInteger(value))) errors.push({id,text:`${label}: enter ${step===1?'a safely representable whole number':'a finite number'}${range}.`});
  }
  if(has(s.total,s.branches)&&s.total<s.branches) errors.push({id:'total',text:'Total branches must include all of your branches.'});
  if(has(s.soldToday,s.boughtToday)&&s.soldToday<s.boughtToday) errors.push({id:'soldToday',text:'System-wide licenses sold must include your charter’s purchases.'});
  if(has(s.licenses,s.branches,s.boughtToday,s.soldToday)) {
    const limit=Math.min(10-s.branches,3-s.boughtToday,100-s.soldToday);
    if(s.licenses>limit) errors.push({id:'licenses',text:`You can add at most ${fmt(limit)} licenses in this snapshot.`});
    if(s.licenses>0&&s.auctionHour>=24) errors.push({id:'auctionHour',text:'The auction is closed at 24 hours. No new licenses can be purchased.'});
  }
  if(has(s.retire,s.branches,s.licenses)&&s.retire>s.branches+s.licenses) errors.push({id:'retire',text:'You cannot retire more branches than your charter holds after the purchase.'});
  if(s.mode==='sandbox') {
    for(const id of ['epochDays','licenseFloor','charterFloor']) if(s[id]===0) errors.push({id,text:`${ALL_FIELDS.find(f=>f[0]===id)[1]} must be greater than zero.`});
    for(const [prefix,factor] of [['license',2],['charter',3]]) {
      if(s[prefix+'HadSales']!=='no'&&has(s[prefix+'Floor'],s[prefix+'Last'])&&factor*s[prefix+'Last']<s[prefix+'Floor']) errors.push({id:prefix+'Last',text:`${prefix==='license'?'License':'Charter'} open is below its floor. The paper does not specify how to resolve this scenario.`});
    }
    if(has(s.feeFloor,s.feeCeiling)&&s.feeFloor>s.feeCeiling) errors.push({id:'feeCeiling',text:'Your fee ceiling must be at least your fee floor.'});
    if(has(s.multiplierFloor,s.multiplierCeiling)&&s.multiplierFloor>s.multiplierCeiling) errors.push({id:'multiplierCeiling',text:'Your multiplier ceiling must be at least your multiplier floor.'});
    if(has(s.dailyCharters,s.chartersSold)&&s.chartersSold>s.dailyCharters) errors.push({id:'chartersSold',text:'Charters sold cannot exceed your entered daily count.'});
  }
  return errors;
}

function fieldHTML(f,unknown=false) {
  const [id,label,unit,min,max,step,hint,wide]=f;
  const note=unknown?'not published — your input':hint;
  return `<div class="field${wide?' wide':''}${unknown?' unpublished':''}"><label for="${id}">${label}</label><div class="input-wrap"><input id="${id}" name="${id}" ${unit===null?'type="text" maxlength="240"':`type="number" ${min===null?'':`min="${min}"`} ${max===null?'':`max="${max}"`} step="${step}" inputmode="${min===null||min<0?'text':'decimal'}"`} aria-describedby="${id}-hint" autocomplete="off" placeholder="${unknown?'Enter value':OPTIONAL_IDS.has(id)?'Optional':''}">${unit?`<span class="unit">${unit}</span>`:''}</div><small id="${id}-hint">${note||'Scenario input'}</small></div>`;
}
function groupHTML(g,unknown=false) {
  return `<details class="input-group" ${g.open?'open':''}><summary>${g.title}<small>${g.section}</small></summary><div class="fields">${g.fields.map(f=>fieldHTML(f,unknown)).join('')}${g.select?`<div class="field wide"><label for="${g.select[0]}">${g.select[1]}</label><select id="${g.select[0]}">${g.select[2].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></div>`:''}</div>${g.note?`<p class="group-note">${g.note}</p>`:''}</details>`;
}
function row(label,value,unit,formula,detail='') {
  return `<div class="result-row"><span>${label}</span><span class="result-number${value===null?' pending':''}">${typeof value==='string'?esc(value):fmt(value)}${unit&&value!==null?' '+unit:''}</span><p class="formula">${esc(formula)}</p>${detail?`<span class="detail">${esc(detail)}</span>`:''}</div>`;
}
function block(title,source,body) {return `<article class="result-block"><div class="result-title"><h3>${title}</h3><span class="tag">${source}</span></div>${body}</article>`;}

function render(s,r) {
  const issueFormula=s.mode==='sandbox'?'I = min(base × d × m, budget remaining)':'I = min(toy volume, budget remaining)';
  const missing='not published — your input';
  const pendingFee=r.rate===null&&s.retire>0?(s.mode==='sandbox'?'Enter a committed exit fee in Sandbox.':'Switch to Sandbox to enter a committed exit fee.') : '';
  const slots=Array.from({length:10},(_,i)=>`<span class="branch-slot ${i<s.branches?'active':i<r.b?'added':''}"></span>`).join('');
  let html=`<article class="share-panel"><div class="share-top"><div><p>Your share of issuance</p><div class="share-value">${fmt(r.share*100)}<span>%</span></div><p class="formula">${fmt(r.b)} branches ÷ ${fmt(r.n)} total × 100</p></div><div class="share-context">After planned licenses.<br>Before retirement.<br>${s.licenses>0&&r.licensePrice===null?'Payment unresolved.':'Fixed counts for this interval.'}</div></div><div class="branch-strip" aria-label="${r.b} of 10 branch slots occupied">${slots}</div><div class="share-foot"><span>${r.b} / 10 branches in your charter</span><span>§§5, 7</span></div></article>`;
  html+=`<div class="summary-grid"><div class="summary-cell"><span class="metric-label">Accrued this interval</span><strong class="metric-value${r.accrual===null?' pending':''}">${fmt(r.accrual)}</strong><span class="metric-unit">STANDARD · ledger credit</span><p class="formula">credit = I × ${r.b} / ${r.n}</p>${r.accrual===null?`<p class="caption">Base, d and m: ${missing}.</p>`:''}</div><div class="summary-cell"><span class="metric-label">New tokens from accrual</span><strong class="metric-value">0</strong><span class="metric-unit">STANDARD · before withdrawal</span><p class="formula">ledger credit → 0 minted</p><p class="caption">Tokens mint only on withdrawal.</p></div></div>`;
  html+=block('Issuance & license burn','§§3, 5, 7–8',
    row('Total interval issuance',r.issued,'STD',issueFormula,r.rawIssue!==null&&r.rawIssue>r.budgetLeft?'Limited by the remaining issuance budget.':s.mode==='disclosed'?'Example volume, not a live emission rate.':'Manual inputs; no multiplier transition is simulated.')+
    row('Remaining issuance budget',r.budgetLeft,'STD',`900,000,000 − ${fmt(s.issuedToDate)}`,r.budgetLeft===0?'Base issuance stops permanently when this budget is exhausted.':'')+
    row('Maximum additional licenses',r.licenseLimit,'',`min(10 − ${s.branches}, 3 − ${s.boughtToday}, 100 − ${s.soldToday})`,'Initial daily limits. Unsold licenses do not roll over.')+
    row('License price at this hour',r.licensePrice,'STD','start = 2 × (last sale, or floor if no sales); P(t) = start × (floor / start)^(t / 24)',s.auctionHour===24?'Endpoint quote only; the auction has closed.':r.licensePrice===null?'License floor: not published — your input. A previous close is also needed unless there were no sales.':'One price snapshot; all selected licenses are priced at the same instant.')+
    row('STANDARD burned on licenses',r.licenseBurn,'STD',`burn = ${s.licenses} × license price × 100%`));
  html+=block('Retire & withdraw','§9',
    row('Accrued balance before retirement',r.closingBalance,'STD',`balance = ${fmt(s.balance)} + interval credit`)+
    row('Gross balance released',r.released,'STD',`released = balance × ${s.retire} / ${r.b}`)+
    row('Committed resolution fee',r.fee,'STD','fee amount = released × entered fee / 100',pendingFee)+
    row('Minted to your wallet',r.wallet,'STD','wallet = released − fee amount','Net wallet tokens only. The model does not infer gross mint accounting for fee allocations.')+
    row('Fee burned',r.feeBurn,'STD','fee burn = fee amount × 50%')+
    row('Fee to remaining bankers',r.redistributed,'STD','redistribution = fee amount × 50%','Aggregate allocation only; the paper does not specify an individual redistribution formula.')+
    row('Ledger balance retained',r.retained,'STD','retained = balance − released')+
    row('Branches after retirement',r.remainingBranches,'',`${r.b} − ${s.retire}`,r.remainingBranches===0?'Charter burns. Re-entry requires a new charter at auction.':'Charter remains open.')+
    row('Share after retirement',r.remainingShare===null?null:r.remainingShare*100,'%',`share = (${r.b} − ${s.retire}) / (${r.n} − ${s.retire}) × 100`,r.remainingShare===null?'No branches remain; a division by zero is not evaluated.':''));
  html+=block('ETH routing',r.regime,
    row('Current net flow',r.net,'ETH',`Fₙ = ${fmt(s.buyEth)} − ${fmt(s.sellEth)}`,r.net>0?'Fₙ > 0 → expansion vault: reserves.':'Fₙ ≤ 0 → contraction vault: buyback and burn.')+
    '<div class="splitbar" aria-label="70 percent vault, 15 percent liquidity, 15 percent team"><span></span><span></span><span></span></div>'+
    row('Protocol ETH to split',r.eth,'ETH',`E = ${fmt(s.feeEth)} trading fees + ${fmt(s.charterEth)} charter proceeds`)+
    row(r.regime+' vault · 70%',r.vault,'ETH','vault = E × 70%')+
    row('Permanent liquidity · 15%',r.pol,'ETH','POL = E × 15%')+
    row('Team · 15%',r.team,'ETH','team = E × 15%')+
    row('Liquidity swap / ETH pairing legs',`${fmt(r.polHalf)} / ${fmt(r.polHalf)}`,'ETH','each leg = E × 15% ÷ 2','Half the POL allocation is swapped to STANDARD; half is paired as ETH. Token output is not calculated.')+
    row('Issuance policy signal',r.signal,'ETH',`signalₙ = ${fmt(s.previousFlow)} + ${fmt(s.olderFlow)}`,'Uses the two completed epochs. Next multiplier: not published — your input; the transition equation is redacted.')+
    row('Hourly contraction spend limit',r.tick,'ETH','spend = min(0.10 × vault ETH, 0.002 × pool reserve ETH)',r.regime==='Expansion'?'Contraction-vault limit shown independently; current fees route to expansion.':'Native ETH limit only. STANDARD acquired/burned requires a price and is not calculated.')+
    row('Vault ETH after that tick',r.remainingVault,'ETH','remaining = vault ETH − spend'));
  if(s.mode==='sandbox') {
    const charterAvailable=has(s.dailyCharters,s.chartersSold)?Math.max(0,s.dailyCharters-s.chartersSold):null;
    html+=block('Pressure & charter auction','§§8–9',
      row('Exit pressure',r.pressure===null?null:r.pressure*100,'%','pressure = W / max(D + W, entered minimum) × 100','W: trailing 7-day withdrawals. D: total held at the bank. This result does not determine the redacted fee curve.')+
      row('Charter price at this hour',r.charterPrice,'ETH','start = 3 × (last sale, or floor if no sales); P(t) = start × (floor / start)^(t / 24)',s.auctionHour===24?'Endpoint quote only; the auction has closed.':'A price quote does not enable the auction or imply a charter sale.')+
      row('Charters still available today',s.auctionHour>=24?0:charterAvailable,'','available = entered daily count − sold; 0 after 24h','Initial daily count is 0. An enabled count is manual. Unsold charters are not minted.'));
  }
  html+='<p class="block-note">Display rounded to 6 decimals; very small values use scientific notation. This is a snapshot calculator, not a transaction simulator.</p>';
  return html;
}

function simpleSnapshot(name,licenses=0,retire=0,direction='in',exitFee=null) {
  const toy=TOY[name];
  if(!toy) throw new Error('Unknown toy preset.');
  const incoming=Math.max(toy.buyEth,toy.sellEth),outgoing=Math.min(toy.buyEth,toy.sellEth);
  return {...Object.fromEntries(ALL_FIELDS.map(f=>[f[0],null])),...toy,mode:'simple',licenses,retire,exitFee,
    buyEth:direction==='in'?incoming:outgoing,sellEth:direction==='in'?outgoing:incoming,
    issuedToDate:0,boughtToday:0,soldToday:0,auctionHour:12,licenseHadSales:'yes',charterHadSales:'yes'};
}

function renderInfographic(s,r) {
  const display = value => s.mode !== 'simple' ? fmt(value) : !has(value) ? '—' : value !== 0 && Math.abs(value) < 0.01 ? value.toExponential(2) : new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
  const branchTiles=Array.from({length:10},(_,i)=>`<span class="charter-tile ${i<s.branches?'existing':i<r.b?'new':''}" aria-hidden="true">${i<r.b?i+1:'·'}</span>`).join('');
  const afterTiles=Array.from({length:10},(_,i)=>`<span class="after-tile ${i<r.remainingBranches?'kept':i<r.b?'retired':''}" aria-hidden="true">${i<r.remainingBranches?'':i<r.b?'×':''}</span>`).join('');
  const amount=(n)=>n===null?'Unknown':display(n);
  const exitNote=s.retire===0?'No branches retired. Nothing is minted.':r.wallet===null?'The exit fee is unpublished. Net wallet tokens stay unknown until you enter a test fee.':`Your entered fee is ${display(r.rate)}%. It is a test input.`;
  return `<figure class="loop-graphic" aria-label="Live diagram of the toy charter, ledger, withdrawal and separate ETH flow">
    <figcaption><span class="eyebrow">FOLLOW THE EXAMPLE</span><span class="tag">§§5, 7, 9, 11</span></figcaption>
    <div class="graphic-charter"><div><h3>Your charter</h3><p><strong>${s.branches}</strong> existing + <strong>${s.licenses}</strong> planned = <strong>${r.b}</strong> branches</p><div class="charter-tiles" aria-label="${r.b} of 10 branch slots">${branchTiles}</div><p class="tile-key"><span class="key-existing"></span>Existing <span class="key-new"></span>New <span class="key-empty"></span>Empty</p></div><div class="graphic-share"><span>Your share this interval</span><strong>${display(r.share*100)}%</strong><p class="formula">${r.b} ÷ ${display(r.n)} × 100</p><small>Before adding: ${display(s.branches/s.total*100)}%<br>share = existing ÷ total × 100</small></div></div>
    <div class="license-sink"><span aria-hidden="true">↳</span><div><strong>License payment → burn</strong><p>${s.licenses===0?'No licenses selected.':r.licenseBurn===null?'Planned branches only; the payment amount is unknown.':`${display(r.licenseBurn)} STANDARD burned.`}</p><span class="formula">burn = licenses × price × 100%</span></div></div>
    <div class="flow-connector"><span aria-hidden="true">↓</span> Equal share of the example issuance</div>
    <div class="ledger-node"><div><h3>Accrued inside the bank</h3><strong class="diagram-number">${amount(r.accrual)} <small>STANDARD</small></strong><p class="formula">credit = ${amount(r.issued)} × ${r.b} / ${display(r.n)}</p></div><div class="mint-stamp"><strong>0</strong><span>tokens minted<br>from accrual</span></div></div>
    <div class="flow-connector"><span aria-hidden="true">↓</span> Retire ${s.retire} of ${r.b} branches</div>
    <div class="withdrawal-node"><div><h3>Balance released for withdrawal</h3><strong class="diagram-number">${amount(r.released)} <small>STANDARD</small></strong><p class="formula">(${display(s.balance)} opening + ${amount(r.accrual)} credit) × ${s.retire} / ${r.b}</p></div><p class="exit-note">${exitNote}</p></div>
    <div class="destination-label">Released balance splits into</div>
    <div class="withdrawal-destinations">
      <div class="destination wallet"><span class="destination-type">YOUR WALLET</span><strong>${amount(r.wallet)}</strong><span>STANDARD minted to you</span><p class="formula">released − fee</p></div>
      <div class="destination burn"><span class="destination-type">BURNED</span><strong>${amount(r.feeBurn)}</strong><span>STANDARD from the fee</span><p class="formula">fee × 50%</p></div>
      <div class="destination stayers"><span class="destination-type">REMAINING BANKERS</span><strong>${amount(r.redistributed)}</strong><span>STANDARD allocated</span><p class="formula">fee × 50%</p></div>
    </div><p class="fee-formula formula">fee = released × ${r.rate===null?'entered fee':display(r.rate)} / 100</p>
    <div class="after-retirement"><div><strong>${r.remainingBranches} branches left</strong><p class="formula">${r.b} − ${s.retire}; retained balance = ${amount(r.closingBalance)} − ${amount(r.released)} = ${amount(r.retained)} STD</p><p>${r.remainingBranches===0?'The charter burns. Re-entry needs a new charter.':'Only the remaining branches earn in later intervals.'}</p></div><div class="after-tiles" aria-label="${r.remainingBranches} branches remain, ${s.retire} retired">${afterTiles}</div></div>
    <div class="eth-diagram"><div class="eth-heading"><div><span class="eyebrow">SEPARATE ETH FLOW</span><h3>${r.regime==='Expansion'?'More ETH comes in':'ETH goes out or net flow is zero'}</h3><p class="formula">net = ${display(s.buyEth)} buys − ${display(s.sellEth)} sells = ${display(r.net)} ETH</p></div><span class="regime-label">${r.regime}</span></div><p class="eth-source">${display(r.eth)} ETH to split <span class="formula">= ${display(s.feeEth)} trading fees + ${display(s.charterEth)} charter proceeds</span></p><div class="eth-distribution" role="img" aria-label="ETH allocation: 70 percent vault, 15 percent liquidity, 15 percent team"><span>70%</span><span>15%</span><span>15%</span></div><div class="eth-destinations"><div><strong>${r.regime==='Expansion'?'Reserves':'Buyback & burn'}</strong><span>${display(r.vault)} ETH</span><p class="formula">total × 70%</p></div><div><strong>Liquidity</strong><span>${display(r.pol)} ETH</span><p class="formula">total × 15%</p></div><div><strong>Team</strong><span>${display(r.team)} ETH</span><p class="formula">total × 15%</p></div></div><p class="graphic-note">${r.regime==='Expansion'?'The active vault accumulates reserves.':'The active vault buys STANDARD and burns it. Token quantity needs a price and is not calculated.'} Changing this flow does not calculate a new issuance rate.</p></div>
  <p class="graphic-note">Toy snapshot. Display rounded; calculations use unrounded values.</p></figure>`;
}

function boot() {
  let mode='simple',simpleName='mid',simpleLicenses=0,simpleRetire=0,simpleDirection='in',advancedPreset='mid';
  const form=document.getElementById('scenario');
  document.getElementById('input-groups').innerHTML=SCENARIO_FIELDS.map(g=>groupHTML(g)).join('');
  document.getElementById('sandbox-fields').innerHTML='<p class="sandbox-label">Unpublished parameters<br><small>Blank means unknown. Zero is an explicit input.</small></p>'+UNKNOWN_GROUPS.map(g=>groupHTML(g,true)).join('')+groupHTML(SANDBOX_SCENARIO);
  function read() {
    if(mode==='simple') {
      const input=document.getElementById('simple-fee');
      return simpleSnapshot(simpleName,simpleLicenses,simpleRetire,simpleDirection,input.validity.badInput?NaN:input.value.trim()===''?null:Number(input.value));
    }
    const s={mode};
    for(const f of ALL_FIELDS) {
      const el=document.getElementById(f[0]);
      s[f[0]]=f[2]===null?el.value:el.validity.badInput?NaN:el.value.trim()===''?null:Number(el.value);
    }
    s.licenseHadSales=document.getElementById('licenseHadSales').value;
    s.charterHadSales=document.getElementById('charterHadSales').value;
    return s;
  }
  function update() {
    const s=read(),errors=validate(s);
    const simple=mode==='simple';
    document.getElementById('simple-fee').setAttribute('aria-invalid',String(simple&&errors.some(e=>e.id==='exitFee')));
    document.getElementById('scenario-status').textContent=simple?`TOY ${simpleName[0].toUpperCase()+simpleName.slice(1)}`:advancedPreset?`TOY ${advancedPreset[0].toUpperCase()+advancedPreset.slice(1)}`:'CUSTOM / TOY';
    document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===(simple?simpleName:advancedPreset))));
    if(simple) {
      const limit=Math.min(3,10-s.branches);
      document.getElementById('simple-licenses').textContent=`${simpleLicenses} new`;
      document.getElementById('simple-retire').textContent=`${simpleRetire} retired`;
      document.getElementById('simple-license-limit').textContent=`Up to ${limit} new branches here: daily limit 3, charter limit 10.`;
      for(const [action,disabled] of [['remove-license',simpleLicenses===0],['add-license',simpleLicenses>=limit],['restore-branch',simpleRetire===0],['retire-branch',simpleRetire>=s.branches+simpleLicenses]]) document.querySelector(`[data-simple-action="${action}"]`).disabled=disabled;
      document.querySelectorAll('[data-simple-flow]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.simpleFlow===simpleDirection)));
      document.getElementById('simple-assumptions').innerHTML=`<dl class="assumptions"><dt>Existing branches: yours / total</dt><dd>${s.branches} / ${fmt(s.total)}</dd><dt>Issuance in the example interval</dt><dd>${fmt(s.exampleIssue)} STANDARD</dd><dt>Your opening ledger balance</dt><dd>${fmt(s.balance)} STANDARD</dd><dt>Current buys / sells</dt><dd>${fmt(s.buyEth)} / ${fmt(s.sellEth)} ETH</dd><dt>Trading fees / charter proceeds</dt><dd>${fmt(s.feeEth)} / ${fmt(s.charterEth)} ETH</dd><dt>Prior issuance / licenses sold today</dt><dd>0 / 0</dd></dl>`;
    }
    for(const f of ALL_FIELDS) document.getElementById(f[0]).setAttribute('aria-invalid',String(errors.some(e=>e.id===f[0])));
    const r=errors.length?null:calculate(s);
    document.getElementById('calculation').innerHTML=errors.length?`<div class="error" role="status"><p>Check your scenario</p><ul>${errors.map(e=>`<li>${esc(e.text)}</li>`).join('')}</ul><p>Calculation paused until these inputs are valid.</p></div>`:simple?renderInfographic(s,r):`<details class="diagram-details"><summary>See the loop as a diagram</summary>${renderInfographic(s,r)}</details>`+render(s,r);
  }
  function preset(name) {
    if(mode==='simple') {
      simpleName=name;simpleLicenses=0;simpleRetire=0;simpleDirection=TOY[name].buyEth>TOY[name].sellEth?'in':'out';
      document.getElementById('simple-fee').value='';update();return;
    }
    advancedPreset=name;
    for(const f of ALL_FIELDS) document.getElementById(f[0]).value='';
    const values={...TOY[name],issuedToDate:0,boughtToday:0,soldToday:0,auctionHour:12};
    for(const [k,v] of Object.entries(values)) document.getElementById(k).value=v;
    document.getElementById('licenseHadSales').value='yes';
    document.getElementById('charterHadSales').value='yes';
    document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===name)));
    document.getElementById('scenario-status').textContent='TOY '+name[0].toUpperCase()+name.slice(1);
    update();
  }
  function setMode(value) {
    mode=value;
    document.getElementById('simple-controls').hidden=mode!=='simple';
    form.hidden=mode==='simple';
    document.getElementById('text-loop').hidden=mode==='simple';
    document.getElementById('sandbox-fields').hidden=mode!=='sandbox';
    document.getElementById('simple-mode').setAttribute('aria-pressed',String(mode==='simple'));
    document.getElementById('disclosed-mode').setAttribute('aria-pressed',String(mode==='disclosed'));
    document.getElementById('sandbox-mode').setAttribute('aria-pressed',String(mode==='sandbox'));
    document.getElementById('mode-note').textContent=mode==='simple'?'Start with an example. Change what your charter does.':mode==='sandbox'?'Unpublished parameters are manual. Blank inputs keep dependent results unresolved.':'Published rules. Issuance volume is a toy example.';
    document.getElementById('input-caption').textContent=mode==='simple'?'Try adding a branch, then retiring one. No setup needed.':'One charter. One fixed-branch interval. All scenario values are examples.';
    document.getElementById('exampleIssue').disabled=mode==='sandbox';
    document.getElementById('exampleIssue-hint').textContent=mode==='sandbox'?'Not used in Sandbox; enter base, d and m below.':'Toy interval volume; not a published rate';
    update();
  }
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('input',()=>{advancedPreset=null;update();});
  form.addEventListener('change',update);
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
  document.getElementById('reset').addEventListener('click',()=>preset('mid'));
  document.getElementById('simple-mode').addEventListener('click',()=>setMode('simple'));
  document.getElementById('disclosed-mode').addEventListener('click',()=>setMode('disclosed'));
  document.getElementById('sandbox-mode').addEventListener('click',()=>setMode('sandbox'));
  document.getElementById('simple-fee').addEventListener('input',update);
  document.querySelector('.mobile-jump').addEventListener('click',event=>{
    event.preventDefault();document.getElementById('results').scrollIntoView({block:'start'});
  });
  document.querySelectorAll('[data-simple-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.simpleAction;
    const max=Math.min(3,10-TOY[simpleName].branches);
    if(action==='add-license') simpleLicenses=Math.min(max,simpleLicenses+1);
    if(action==='remove-license') simpleLicenses=Math.max(0,simpleLicenses-1);
    if(action==='retire-branch') simpleRetire++;
    if(action==='restore-branch') simpleRetire--;
    simpleRetire=Math.max(0,Math.min(simpleRetire,TOY[simpleName].branches+simpleLicenses));
    update();
  }));
  document.querySelectorAll('[data-simple-flow]').forEach(button=>button.addEventListener('click',()=>{simpleDirection=button.dataset.simpleFlow;update();}));
  document.getElementById('edit-example').addEventListener('click',()=>{
    const snapshot=read();
    for(const f of ALL_FIELDS) document.getElementById(f[0]).value=snapshot[f[0]]??'';
    document.getElementById('licenseHadSales').value=snapshot.licenseHadSales;
    document.getElementById('charterHadSales').value=snapshot.charterHadSales;
    advancedPreset=null;setMode('disclosed');
  });
  // Initialize the detailed model too, while opening the novice view by default.
  mode='disclosed';preset('mid');setMode('simple');
  // Optional local browser interface. No connector or network is involved.
  if(document.modelContext?.registerTool) {
    const lifecycle=new AbortController();
    const registrations=[{
      name:'read_loop_calculation',title:'Read loop calculation',
      description:'Read the current local toy inputs, unresolved parameters and calculation. Does not change the page.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:true},
      execute(input){
        if(!input||typeof input!=='object'||Object.keys(input).length) throw new Error('Expected an empty object.');
        const state=read(),errors=validate(state);
        return {mode,errors,unpublished:UNKNOWN_IDS.filter(id=>state[id]===null||state[id]===''),result:errors.length?null:calculate(state)};
      }
    },{
      name:'set_toy_preset',title:'Set toy preset',
      description:'Replace the selected mode’s local scenario with a TOY preset and clear its unpublished inputs. Other modes may retain their inputs. No transaction occurs.',
      inputSchema:{type:'object',properties:{preset:{type:'string',enum:['low','mid','high']}},required:['preset'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){
        if(!input||typeof input!=='object'||Object.keys(input).length!==1||!Object.hasOwn(TOY,input.preset)) throw new Error('Expected preset low, mid or high.');
        preset(input.preset);
        return {mode,preset:input.preset,result:calculate(read())};
      }
    }];
    for(const tool of registrations) {
      try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); } catch { /* Ordinary browsers need no registry. */ }
    }
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
}
if(typeof document!=='undefined') boot();
if(typeof module!=='undefined') module.exports={RULES,TOY,UNKNOWN_IDS,ALL_FIELDS,calculate,validate,auctionPrice,render,simpleSnapshot,renderInfographic};
