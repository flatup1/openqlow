export type AccessSettings={issuer?:string;audience?:string;emails?:string};
type Claims={iss?:string;aud?:unknown;exp?:number;nbf?:number;email?:string};
type Jwk=JsonWebKey & {kid?:string};
const decode=(part:string)=>new Uint8Array(Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
/** Verify Access proof, including signature, before trusting an email header. */
export async function accessIdentity(token:string,settings:AccessSettings,getKeys:typeof fetch=fetch,now=Date.now()):Promise<string|null>{
  try {
    const issuer=settings.issuer?.replace(/\/$/,'')||'';
    if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!settings.audience||!settings.emails||token.length>16000)return null;
    const parts=token.split('.');if(parts.length!==3)return null;
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))) as {alg?:string;kid?:string};
    const claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Claims;
    const email=claims.email?.trim().toLowerCase();
    if(header.alg!=='RS256'||!header.kid||claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(settings.audience)||!Number.isFinite(claims.exp)||claims.exp!*1000<=now||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>now)||!email||!settings.emails.split(',').map(s=>s.trim().toLowerCase()).includes(email))return null;
    const response=await getKeys(issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return null;
    const body=await response.json() as {keys?:Jwk[]};const jwk=body.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
    const identity=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(issuer+'|'+email));
    return Array.from(new Uint8Array(identity),byte=>byte.toString(16).padStart(2,'0')).join('');
  } catch {return null;}
}
