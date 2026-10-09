/** Same-origin service binding: no public proxy, no credentials generated here. */
interface Env { EVENTOS_API?: { fetch(request: Request): Promise<Response> } }
export const onRequest: PagesFunction<Env> = async context => {
  const url=new URL(context.request.url);
  if(!['/api/private-drafts','/api/private-draft','/api/private-event','/api/private-rules','/api/private-events','/api/private-recruitment','/api/private-timer','/api/cloud-entry','/api/cloud-view'].includes(url.pathname))return new Response('Not found',{status:404});
  if(!context.env.EVENTOS_API)return Response.json({ok:false,reason:'クラウド接続が未設定です。管理者に確認してください。'},{status:503});
  // Worker performs existing operator authentication; never forward a key from a URL.
  const headers=new Headers({'content-type':'application/json','x-operator-key':context.request.headers.get('x-operator-key')||'','cf-access-jwt-assertion':context.request.headers.get('cf-access-jwt-assertion')||''});
  const query=['/api/cloud-entry','/api/cloud-view'].includes(url.pathname)?new URLSearchParams({code:url.searchParams.get('code')||''}):new URLSearchParams({event:url.searchParams.get('event')||''});
  return context.env.EVENTOS_API.fetch(new Request('https://eventos-api'+url.pathname+'?'+query,{method:context.request.method,headers,body:['GET','HEAD'].includes(context.request.method)?undefined:context.request.body,redirect:'manual'}));
};
