export const CONTRACT='0x92542C9aFb218B42C3a6bFcd3affFbA6Bd85F164';
export const CHAIN=4221;
const fields=['body','id','name','prerelease','published_at','tag','url'];
export function canonical(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(', ')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+': '+canonical(value[k])).join(', ')+'}';
 throw Error('Unsupported value in evidence');
}
export async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyRecord(r){
 const issues=[];
 if(!r||typeof r!=='object')return {ok:false,issues:['Record is not an object']};
 if(!/^[1-9][0-9]{0,18}$/.test(r.id||''))issues.push('Invalid record ID');
 if(!/^0x[0-9a-f]{40}$/i.test(r.owner||''))issues.push('Invalid creator address');
 const parts=String(r.repository||'').split('/');
 const identifiers=[...parts,r.tag];
 if(parts.length!==2||identifiers.some(v=>typeof v!=='string'||! /^[a-zA-Z0-9_.-]{1,100}$/.test(v)||v==='.'||v==='..'))issues.push('Invalid release identity');
 if(typeof r.claim!=='string'||Array.from(r.claim).length<10||Array.from(r.claim).length>1000)issues.push('Invalid committed claim');
 const source='https://api.github.com/repos/'+r.repository+'/releases/tags/'+r.tag;
 if(r.source_url!==source)issues.push('Official source URL mismatch');
 if(r.status!=='assessed')issues.push('Record has no final assessment');
 const s=r.snapshot;
 if(!s||typeof s!=='object')return {ok:false,issues:[...issues,'Snapshot missing']};
 if(Object.keys(s).sort().join('|')!==fields.join('|'))issues.push('Unexpected snapshot schema');
 if(!Number.isSafeInteger(s.id)||s.id<=0||typeof s.prerelease!=='boolean'||typeof s.name!=='string'||!s.name||typeof s.published_at!=='string'||!Number.isFinite(Date.parse(s.published_at)))issues.push('Malformed published release metadata');
 if(s.tag!==r.tag||String(s.url).toLowerCase()!==('https://github.com/'+r.repository+'/releases/tag/'+r.tag).toLowerCase())issues.push('Snapshot identity mismatch');
 const points=typeof s.body==='string'?Array.from(s.body):[];
 if(points.length<20||points.length>16000)issues.push('Snapshot notes outside contract bounds');
 let actualHash=null;try{actualHash=await sha256(canonical(s));}catch{issues.push('Snapshot cannot be canonicalized');}
 if(!/^[0-9a-f]{64}$/.test(r.snapshot_sha256||'')||actualHash!==r.snapshot_sha256)issues.push('Snapshot SHA-256 mismatch');
 const a=r.assessment;
 if(!a||typeof a!=='object')issues.push('Assessment missing');
 else{
  if(!['supported','contradicted','insufficient_evidence'].includes(a.verdict))issues.push('Invalid consensus verdict');
  if(typeof a.reason!=='string'||!a.reason||Array.from(a.reason).length>1600)issues.push('Invalid consensus explanation');
  if(a.snapshot_sha256!==r.snapshot_sha256)issues.push('Assessment bound to a different snapshot');
  const ids=a.passage_ids,quotes=a.quotes;
  if(!Array.isArray(ids)||ids.length>5||ids.some((id,i)=>!Number.isInteger(id)||id<1||id>Math.ceil(points.length/400)||(i&&id<=ids[i-1])))issues.push('Invalid or unordered citation IDs');
  else{
   if(a.verdict!=='insufficient_evidence'&&!ids.length)issues.push('Definitive verdict has no evidence');
   if(!Array.isArray(quotes)||quotes.length!==ids.length||quotes.some((q,i)=>q!==points.slice((ids[i]-1)*400,ids[i]*400).join('')))issues.push('Citation text differs from original passage');
  }
 }
 return {ok:issues.length===0,issues,actualHash,recordId:r.id};
}
export function diffLines(before,after){
 const lines=t=>t.replace(/\r\n/g,'\n').split('\n');
 const subtract=(a,b)=>{const counts=new Map();for(const x of b)counts.set(x,(counts.get(x)||0)+1);return a.filter(x=>{const n=counts.get(x)||0;if(n){counts.set(x,n-1);return false;}return true;});};
 return {removed:subtract(lines(before),lines(after)),added:subtract(lines(after),lines(before))};
}
export async function compareRecords(a,b){
 const av=await verifyRecord(a),bv=await verifyRecord(b);
 if(!av.ok||!bv.ok)throw Error('Both records must pass snapshot and citation verification');
 if(a.id===b.id)throw Error('Choose two different record IDs');
 if(a.repository!==b.repository)throw Error('Comparison requires the same repository');
 const sameClaim=a.claim===b.claim;
 return {beforeId:a.id,afterId:b.id,repository:a.repository,sameClaim,
  verdicts:[a.assessment.verdict,b.assessment.verdict],
  interpretation:sameClaim?'Same committed claim; verdicts describe only each frozen release.':'Different claims: verdicts must not be interpreted as a change in support for one claim.',
  sameSnapshot:av.actualHash===bv.actualHash,
  notes:diffLines(a.snapshot.body,b.snapshot.body)};
}
export async function makeBundle(record){
 const verification=await verifyRecord(record);if(!verification.ok)throw Error('Cannot export unverified evidence: '+verification.issues.join('; '));
 return {format:'releaseguard-evidence/1',chainId:CHAIN,contract:CONTRACT,record,verification,
  trust:'Local hash/citation consistency is not a chain proof. Re-read this ID from the pinned deployed contract to authenticate the bundle. Notes support is not a code audit.'};
}
export async function authenticateBundle(bundle,read){
 if(!bundle||bundle.format!=='releaseguard-evidence/1'||bundle.chainId!==CHAIN||bundle.contract!==CONTRACT)throw Error('Bundle network, contract or format mismatch');
 const supplied=await verifyRecord(bundle.record);if(!supplied.ok)throw Error('Imported evidence failed local verification: '+supplied.issues.join('; '));
 const fresh=await read(bundle.record.id);const verified=await verifyRecord(fresh);
 if(!verified.ok||canonical(fresh)!==canonical(bundle.record))throw Error('Bundle does not match the final record read from the deployed contract');
 return {record:fresh,verification:verified,authenticated:true};
}
export function markdownReport(record,result){
 if(!result.ok)throw Error('Cannot report unverified evidence');
 return ['# ReleaseGuard evidence report',`Record: ${record.id}`,`Repository: ${record.repository}`,`Tag: ${record.tag}`,`Claim: ${record.claim}`,`Verdict: ${record.assessment.verdict}`,`Reason: ${record.assessment.reason}`,`Snapshot SHA-256: ${result.actualHash}`,`Source: ${record.source_url}`,...record.assessment.quotes.map((q,i)=>`\n## Passage ${record.assessment.passage_ids[i]}\n\n${q}`),'\nScope: frozen release notes only; not a code audit or functionality guarantee.'].join('\n\n');
}
