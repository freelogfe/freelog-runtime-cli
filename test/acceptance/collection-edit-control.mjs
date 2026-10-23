/** C02 editing whitelist; old recovery/items/selection route contracts are not broadened. */
import {itemRouteAllowed} from './collection-items-control.mjs';
import {editPath} from './collection-edit-evidence.mjs';
export function editRouteAllowed(method,raw){if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||/[\p{Cc}\p{Cf}\\]/u.test(raw))return false;
  const u=new URL(raw,'https://api.devfreelog.com');if(u.origin!=='https://api.devfreelog.com'||u.hash)return false;
  if(method==='GET'){
    if(['/v2/resources/local_collection','/v2/resources/catalogue/local_collection/items/collectRules'].includes(u.pathname))return itemRouteAllowed(method,raw);
    if(u.pathname!==`${editPath}/items`)return false;
    const allowed={skip:v=>v==='0'||v==='100',limit:v=>v==='100',sortField:v=>v==='sortId',sortType:v=>v==='1',isLoadLatestVersionInfo:v=>v==='1',keywords:v=>v==='needle'};
    return [...u.searchParams].every(([k,v])=>Object.hasOwn(allowed,k)&&u.searchParams.getAll(k).length===1&&allowed[k](v));}
  if(method==='PUT')return !u.search&&[`${editPath}/items`,`${editPath}/manualSort`,`${editPath}/reorder`].includes(u.pathname);
  if(method==='DELETE')return u.pathname===`${editPath}/items`&&[...u.searchParams].length===1&&u.searchParams.getAll('removeCollectionItemIds').length===1&&u.searchParams.get('removeCollectionItemIds')==='item_b,item_d';
  return false;}
