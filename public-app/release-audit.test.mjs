import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,sha256,verifyRecord,compareRecords,makeBundle,authenticateBundle,diffLines,markdownReport,CONTRACT} from './release-audit.mjs';
async function record(id='1',body='Documented release notes. Unicode: 😀 漢字.\nFixed issue A.\n'){const snapshot={id:11,name:'Demo',body,prerelease:false,published_at:'2026-11-18T00:00:00Z',tag:'v1',url:'https://github.com/example/demo/releases/tag/v1'};const hash=await sha256(canonical(snapshot));return {id,owner:'0x1111111111111111111111111111111111111111',repository:'example/demo',tag:'v1',claim:'This release fixes issue A.',source_url:'https://api.github.com/repos/example/demo/releases/tags/v1',status:'assessed',snapshot,snapshot_sha256:hash,assessment:{verdict:'supported',reason:'Notes explicitly state the fix.',passage_ids:[1],quotes:[Array.from(body).slice(0,400).join('')],snapshot_sha256:hash}};}
test('Python-compatible sorted JSON preserves spaces and Unicode',()=>assert.equal(canonical({z:'😀\n',a:false}),'{"a": false, "z": "😀\\n"}'));
test('valid snapshot and original citations verify',async()=>assert.equal((await verifyRecord(await record())).ok,true));
for(const [label,mutate] of [
 ['altered notes',r=>r.snapshot.body+='tamper'],
 ['altered snapshot hash',r=>r.snapshot_sha256='0'.repeat(64)],
 ['changed snapshot identity',r=>r.snapshot.tag='wrong'],
 ['source URL spoof',r=>r.source_url='https://evil.example/'],
 ['unknown snapshot field',r=>r.snapshot.extra='injected'],
 ['wrong quote',r=>r.assessment.quotes=['invented evidence']],
 ['wrong passage ID',r=>r.assessment.passage_ids=[0]],
 ['duplicate passage IDs',r=>{r.assessment.passage_ids=[1,1];r.assessment.quotes.push(r.assessment.quotes[0]);}],
 ['missing definitive evidence',r=>{r.assessment.passage_ids=[];r.assessment.quotes=[];}],
 ['assessment hash mismatch',r=>r.assessment.snapshot_sha256='0'.repeat(64)],
 ['invalid verdict',r=>r.assessment.verdict='safe'],
 ['nonfinal record',r=>r.status='captured'],
 ['malformed release metadata',r=>r.snapshot.id=Number.MAX_SAFE_INTEGER+1]
])test('reject '+label,async()=>{const r=await record();mutate(r);assert.equal((await verifyRecord(r)).ok,false);});
test('Unicode passages use Python code points, not UTF-16 units',async()=>{const r=await record('1','😀'.repeat(399)+'AB');r.assessment.passage_ids=[2];r.assessment.quotes=['B'];assert.equal((await verifyRecord(r)).ok,true);});
test('insufficient evidence can contain no citations',async()=>{const r=await record();r.assessment.verdict='insufficient_evidence';r.assessment.passage_ids=[];r.assessment.quotes=[];assert.equal((await verifyRecord(r)).ok,true);});
test('bundle local consistency is authenticated by a fresh chain read',async()=>{const r=await record(),b=await makeBundle(r);let calls=0;assert.equal((await authenticateBundle(b,async()=>{calls++;return r;})).authenticated,true);assert.equal(calls,1);});
test('forged claim with intact snapshot rejected against final contract record',async()=>{const r=await record(),b=await makeBundle(r);b.record=structuredClone(r);b.record.claim='Different, locally plausible claim.';await assert.rejects(()=>authenticateBundle(b,async()=>r),/does not match/);});
test('forged verification label cannot bypass computed checks',async()=>{const b=await makeBundle(await record());b.verification.ok=true;b.record.snapshot.body+='tamper';await assert.rejects(()=>authenticateBundle(b,async()=>b.record),/failed local/);});
test('different network or contract is rejected before RPC',async()=>{const b=await makeBundle(await record());b.contract=CONTRACT.toLowerCase();await assert.rejects(()=>authenticateBundle(b,async()=>{throw Error('must not read');}),/mismatch/);});
test('RPC failure never becomes authenticated evidence',async()=>{const b=await makeBundle(await record());await assert.rejects(()=>authenticateBundle(b,async()=>{throw Error('offline');}),/offline/);});
test('comparison labels same claim and deterministic note changes',async()=>{const a=await record('1'),b=await record('2','Documented release notes.\nFixed issue B.\n');const c=await compareRecords(a,b);assert.equal(c.sameClaim,true);assert.equal(c.sameSnapshot,false);assert.ok(c.notes.added.includes('Fixed issue B.'));});
test('different claims carry explicit warning',async()=>{const a=await record('1'),b=await record('2');b.claim='This release fixes issue B.';assert.match((await compareRecords(a,b)).interpretation,/Different claims/);});
test('same ID cannot masquerade as two records',async()=>{const r=await record();await assert.rejects(()=>compareRecords(r,r),/different record/);});
test('comparison refuses malformed evidence',async()=>{const a=await record('1'),b=await record('2');b.assessment.quotes=['fake'];await assert.rejects(()=>compareRecords(a,b),/must pass/);});
test('cross-repository comparison rejected',async()=>{const a=await record('1'),b=await record('2');b.repository='other/demo';b.source_url='https://api.github.com/repos/other/demo/releases/tags/v1';b.snapshot.url='https://github.com/other/demo/releases/tag/v1';b.snapshot_sha256=await sha256(canonical(b.snapshot));b.assessment.snapshot_sha256=b.snapshot_sha256;await assert.rejects(()=>compareRecords(a,b),/same repository/);});
test('line diff accounts for duplicate lines and CRLF',()=>assert.deepEqual(diffLines('a\r\na\r\nb','a\nb'),{removed:['a'],added:[]}));
test('report includes exact evidence scope and quotes',async()=>{const r=await record(),v=await verifyRecord(r);const text=markdownReport(r,v);assert.ok(text.includes(v.actualHash));assert.ok(text.includes(r.assessment.quotes[0]));assert.match(text,/not a code audit/);});
