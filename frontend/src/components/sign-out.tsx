"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./icon";
import { ConfirmDialog } from "./confirm-dialog";
import { TwoStepDialog } from "./two-step";
import { ChangePasswordDialog } from "./change-password";
export function SignOut({profileMenu=false}:{profileMenu?:boolean}) {
 const [open,setOpen]=useState(false), menuId=useId(), container=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false)};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[open]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState(false),[twoStep,setTwoStep]=useState(false),[password,setPassword]=useState(false);
 async function logout(){if(busy)return;setBusy(true);setError("");try{await api("/api/auth/logout",{method:"POST"});window.location.assign("/login")}catch{setError("Sign out failed. Please try again.");setBusy(false)}}
 const requestLogout=()=>{setOpen(false);setError("");setConfirm(true)};
 return <div ref={container} className={profileMenu?"profile-dropdown":undefined} onKeyDown={event=>{if(event.key==="Escape"&&open){event.stopPropagation();setOpen(false);trigger.current?.focus()}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
 {profileMenu?<><button ref={trigger} type="button" className="profile-icon-button" aria-label="Account options" title="Account options" aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(!open)}><Icon name="user"/></button>{open&&<div id={menuId} className="profile-dropdown-panel"><a href="/billing" role="menuitem" style={{display:"flex",alignItems:"center",gap:8}}><Icon name="doc"/>Billing &amp; plan</a><button type="button" onClick={()=>{setOpen(false);setPassword(true)}}><Icon name="settings"/>Change password</button><button type="button" onClick={()=>{setOpen(false);setTwoStep(true)}}><Icon name="check"/>Two-step sign-in</button><button type="button" className="danger" disabled={busy} onClick={requestLogout}><Icon name="power"/>Sign out</button></div>}</>:<button type="button" className="danger" title="Sign out" aria-label="Sign out" style={{width:44,height:44,padding:0,display:"inline-flex",alignItems:"center",justifyContent:"center"}} disabled={busy} onClick={requestLogout}><Icon name="power"/></button>}

 {password&&<ChangePasswordDialog onClose={()=>setPassword(false)}/>}
 {twoStep&&<TwoStepDialog onClose={()=>setTwoStep(false)}/>}
 {confirm&&<ConfirmDialog title="Sign out?" description={error||"You’ll need to sign in again to open your workspace."} label="Sign out" busy={busy} onCancel={()=>setConfirm(false)} onConfirm={()=>void logout()}/>}
 </div>;
}
