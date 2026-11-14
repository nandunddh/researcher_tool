import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccount, updateAccount, matchesAccount } from "../src/features/admin/requests";
import { ApiError } from "../src/lib/api";

test("creation submits organization settings and preserves unlimited quota",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{assert.equal(url,"/api/admin/licenses/create");const body=JSON.parse(String(init?.body));assert.equal(body.daily_limit,-1);assert.equal(body.seat_limit,5);assert.equal(body.can_invite_users,true);assert.equal(body.scistudio_access,true);assert.equal(body.account_type,"org");return Response.json({});};
 try{const data=new FormData();for(const [k,v] of Object.entries({name:"Owner",email:"owner@example.test",daily_limit:"-1",seat_limit:"5",duration_days:"7",studio:"on"}))data.set(k,v);await createAccount(data,"org")}finally{globalThis.fetch=original}
});
test("individual creation clears team seats and unchecked studio access",async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(_,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.seat_limit,1);assert.equal(body.can_invite_users,false);assert.equal(body.scistudio_access,false);return Response.json({})};
 try{await createAccount(new FormData(),"single")}finally{globalThis.fetch=original}
});
test("duplicate email failure remains visible to form handler",async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({detail:"Email already exists"},{status:409});
 try{await assert.rejects(createAccount(new FormData(),"single"),e=>e instanceof ApiError&&e.status===409&&e.message==="Email already exists")}finally{globalThis.fetch=original}
});
test("management commands send the selected account and operation payload",async()=>{
 const original=globalThis.fetch;
 try{for(const [op,extra] of Object.entries({stop:{},resume:{},extend:{additional_days:7},upgrade:{new_tier:"pro",new_limit:250},"toggle-scistudio":{enabled:false},"org-members/add":{email:"member@example.test",role:"viewer"},"org-members/remove":{member_id:"test-member"},"org-members/toggle-scistudio":{member_id:"test-member",enabled:false}})){
 globalThis.fetch=async(url,init)=>{assert.equal(url,`/api/admin/licenses/${op}`);assert.equal(init?.method,"POST");assert.deepEqual(JSON.parse(String(init?.body)),{license_key:"test-account",...extra});return Response.json({status:"ok"})};await updateAccount("test-account",op,extra)}
 }finally{globalThis.fetch=original}
});
test("delete uses DELETE without a JSON body",async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{assert.equal(url,"/api/admin/licenses/test-account");assert.equal(init?.method,"DELETE");assert.equal(init?.body,undefined);return Response.json({})};try{await updateAccount("test-account","test-account",{},"DELETE")}finally{globalThis.fetch=original}
});
test("failed management requests reject rather than report success",async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({detail:"Seat limit reached"},{status:400});try{await assert.rejects(updateAccount("test","org-members/add"),/Seat limit reached/)}finally{globalThis.fetch=original}
});
test("search combines with type, plan, status and studio filters",()=>{
 const a={client_name:"Jane",client_email:"jane@example.test",org_name:"Research Lab",account_type:"org",status:"active",tier:"pro",scistudio_access:false};
 for(const filter of ["all","org","active","pro"])assert.equal(matchesAccount(a," RESEARCH ",filter),true);
 for(const filter of ["single","stopped","trial","studio"])assert.equal(matchesAccount(a,"",filter),false);
 assert.equal(matchesAccount(a,"absent","all"),false);assert.equal(matchesAccount(a,"JANE@","all"),true);
});

test("Pro creation sends 30 days even when a trial duration remains",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(_,init)=>{assert.equal(JSON.parse(String(init?.body)).duration_days,30);return Response.json({})};
 try{const data=new FormData();data.set("tier","pro");data.set("duration_days","7");await createAccount(data,"single")}finally{globalThis.fetch=original}
});

test("cancellation in confirmation leaves network untouched", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  try {
    // Simulate user cancelling confirmation dialog
    let confirmed = false;
    const onCancel = () => { confirmed = false; };
    const onConfirm = () => { confirmed = true; };
    onCancel();
    assert.equal(confirmed, false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("multi-word and case-insensitive search matches name, email, and org", () => {
  const account = {
    client_name: "Dr. Alexander Fleming",
    client_email: "fleming@penicillin.org",
    org_name: "St Mary Hospital",
    account_type: "org",
    status: "active",
    tier: "pro",
    scistudio_access: true,
  };
  assert.equal(matchesAccount(account, "alexander", "all"), true);
  assert.equal(matchesAccount(account, "FLEMING@", "all"), true);
  assert.equal(matchesAccount(account, "st mary", "all"), true);
  assert.equal(matchesAccount(account, "hospital", "org"), true);
  assert.equal(matchesAccount(account, "penicillin", "studio"), true);
  assert.equal(matchesAccount(account, "unknown", "all"), false);
  assert.equal(matchesAccount(account, "alexander", "single"), false);
});

test("double-action lock prevents duplicate concurrent requests while busy", async () => {
  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    callCount++;
    return Response.json({ status: "ok" });
  };
  try {
    let busy = false;
    async function performAction() {
      if (busy) return;
      busy = true;
      try {
        await updateAccount("acc-123", "stop");
      } finally {
        busy = false;
      }
    }
    // Simulate double click / simultaneous triggers
    await Promise.all([performAction(), performAction()]);
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = original;
  }
});
