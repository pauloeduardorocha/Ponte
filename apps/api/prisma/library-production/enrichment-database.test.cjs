const test = require('node:test');
const assert = require('node:assert/strict');
const {changes} = require('./enrichment-database.cjs');
function fixture() {
  const current=Array.from({length:384},(_,i)=>({id:String(i),registrationNumber:String(i).padStart(5,'0'),title:`Book ${i}`,author:null,isbn:null,publisher:null,edition:null,year:null,language:'und',pages:null,cover:null,subtitle:null,keywords:[]}));
  const plan={sourceHash:'research-v1',books:current.map(b=>({registrationNumber:b.registrationNumber,original:{title:b.title},research:{},selection:{fields:{isbn:'9780310286707',publisher:'Found publisher',language:'en'}}}))};
  return {plan,current};
}
test('preserves curated fields and prevents ISBN collisions',()=>{
  const {plan,current}=fixture();
  current[0].publisher='Curated publisher';
  current[0].language='pt';
  const rows=changes(plan,current,new Map());
  assert.equal(rows[0].after.publisher,'Curated publisher');
  assert.equal(rows[0].after.language,'pt');
  assert.equal(rows[0].after.isbn,'9780310286707');
  assert.equal(rows[1].after.isbn,null);
  assert.equal(rows[1].selection.isbnCollision,'9780310286707');
  assert.equal(current[0].isbn,null);
});
test('same research is idempotent; different research is refused',()=>{
  const {plan,current}=fixture();
  assert.equal(changes(plan,current,new Map(current.map(b=>[b.id,plan.sourceHash]))).length,0);
  assert.throws(()=>changes(plan,current,new Map([[current[0].id,'other']])));
});
test('changed source title aborts the import',()=>{
  const {plan,current}=fixture();
  current[50].title='New title';
  assert.throws(()=>changes(plan,current,new Map()),/Title changed/);
});
