import type { AtomicStore } from '../../core/cloudTournament.ts';
import { EventRoom } from '../../worker/event-do.ts';
import worker, { type Env } from '../../worker/index.ts';

/** Isolated test storage; failed transactions cannot persist partial data. */
export class MemoryStore implements AtomicStore {
  values=new Map<string,unknown>();
  private queue=Promise.resolve();
  async get<T>(key:string):Promise<T|undefined>{return structuredClone(this.values.get(key)) as T|undefined;}
  async put<T>(key:string,value:T):Promise<void>{this.values.set(key,structuredClone(value));}
  async transaction<T>(fn:(store:AtomicStore)=>Promise<T>):Promise<T>{
    let release!:()=>void;const previous=this.queue;this.queue=new Promise<void>(r=>{release=r;});await previous;
    const draft=new MemoryStore();draft.values=structuredClone(this.values);
    try{const result=await fn(draft);this.values=draft.values;return result;}finally{release();}
  }
}
export function cloudHarness() {
  const stores=new Map<string,MemoryStore>();const rooms=new Map<string,EventRoom>();
  const env={OPERATOR_KEY:'test-only-operator',ALLOWED_ORIGINS:'http://127.0.0.1',EVENT_ID:'test-event',EVENT_ROOM:{
    idFromName:(id:string)=>id,
    get:(id:string)=>({fetch:(request:Request)=>{
      let room=rooms.get(id);
      if(!room){const store=stores.get(id)||new MemoryStore();stores.set(id,store);room=new EventRoom({storage:store,blockConcurrencyWhile:(fn:()=>Promise<unknown>)=>fn(),getWebSockets:()=>[]} as never,{});rooms.set(id,room);}
      return room.fetch(request);
    }}),
  }} as unknown as Env;
  return {stores,env,restart:()=>rooms.clear(),fetch:(request:Request)=>worker.fetch(request,env)};
}
