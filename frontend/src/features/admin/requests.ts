import { api } from "../../lib/api";
export async function createAccount(data:FormData,kind:string){return api("/api/admin/licenses/create",{method:"POST",body:JSON.stringify({name:data.get("name"),email:data.get("email"),password:data.get("password"),account_type:kind,org_name:data.get("org_name")||"",tier:data.get("tier"),duration_days:data.get("tier")==="pro"?30:Number(data.get("duration_days")),daily_limit:Number(data.get("daily_limit")),seat_limit:kind==="org"?Number(data.get("seat_limit")):1,can_invite_users:kind==="org",scistudio_access:data.has("studio"),notes:data.get("notes")})})}
export async function updateAccount(key:string,operation:string,extra:Record<string,unknown>={},method="POST"){
 return api(`/api/admin/licenses/${operation}`,{method,body:method==="DELETE"?undefined:JSON.stringify({license_key:key,...extra})});
}
export function matchesAccount(a:{client_name:string;client_email:string;org_name:string;account_type:string;status:string;tier:string;scistudio_access:boolean},query:string,filter:string){
 return `${a.client_name} ${a.client_email} ${a.org_name}`.toLowerCase().includes(query.trim().toLowerCase())&&(filter==="all"||a.account_type===filter||a.status===filter||a.tier===filter||(filter==="studio"&&a.scistudio_access));
}
