import {TABLES} from "../../src/data.js";
export class MemoryDb {
  constructor(){this.tables=Object.fromEntries(TABLES.map(t=>[t,new Map()]));}
  transaction(names,mode){
    const tables=this.tables,parts=Array.isArray(names)?names:[names];
    const working=Object.fromEntries(parts.map(n=>[n,new Map([...tables[n]].map(([id,v])=>[id,structuredClone(v)]))]));
    let aborted=false;
    const tx={error:null,oncomplete:null,onabort:null,onerror:null,
      abort(){aborted=true;tx.error=new Error('transaction aborted');},
      objectStore(name){if(!(name in working))throw new Error(`Unregistered store ${name}`);return {
        get(id){return request(()=>structuredClone(working[name].get(id)));},
        getAll(){return request(()=>[...working[name].values()].map(v=>structuredClone(v)));},
        add(row){return request(()=>{if(working[name].has(row.id))throw new Error('Duplicate ID');working[name].set(row.id,structuredClone(row));return row.id;});},
        put(row){return request(()=>{working[name].set(row.id,structuredClone(row));return row.id;});},
        clear(){return request(()=>{working[name].clear();});}
      };}
    };
    const request=fn=>{const r={onsuccess:null,onerror:null,result:undefined,error:null};queueMicrotask(()=>{
      if(aborted)return;
      try{r.result=fn();r.onsuccess?.({target:r});}catch(e){r.error=e;tx.error=e;aborted=true;r.onerror?.({target:r});}
    });return r;};
    setImmediate(()=>{
      if(aborted){tx.onabort?.({target:tx});return;}
      if(mode==='readwrite')for(const n of parts)tables[n]=working[n];
      tx.oncomplete?.({target:tx});
    });
    return tx;
  }
}
