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
 {profileMenu?<><button ref={trigger} type="button" className="profile-icon-button" aria-label="Account options" title="Account options" aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(!open)}><Icon name="user"/></button>{open&&<div id={menuId} className="profile-dropdown-panel" role="menu"><a className="profile-item" href="/account" role="menuitem"><span className="profile-item-icon"><Icon name="user" size={16}/></span>Account</a><a className="profile-item" href="/billing" role="menuitem"><span className="profile-item-icon"><Icon name="doc" size={16}/></span>Billing &amp; plan</a><button type="button" className="profile-item" role="menuitem" onClick={()=>{setOpen(false);setPassword(true)}}><span className="profile-item-icon"><Icon name="settings" size={16}/></span>Change password</button><button type="button" className="profile-item" role="menuitem" onClick={()=>{setOpen(false);setTwoStep(true)}}><span className="profile-item-icon"><Icon name="lock" size={16}/></span>Two-step sign-in</button><hr className="profile-divider"/><button type="button" className="profile-item profile-item-danger" role="menuitem" disabled={busy} onClick={requestLogout}><span className="profile-item-icon"><Icon name="power" size={16}/></span>Sign out</button></div>}</>:<button type="button" className="danger" title="Sign out" aria-label="Sign out" style={{width:44,height:44,padding:0,display:"inline-flex",alignItems:"center",justifyContent:"center"}} disabled={busy} onClick={requestLogout}><Icon name="power"/></button>}

 {password&&<ChangePasswordDialog onClose={()=>setPassword(false)}/>}
 {twoStep&&<TwoStepDialog onClose={()=>setTwoStep(false)}/>}
 {confirm&&<ConfirmDialog title="Sign out?" description={error||"You’ll need to sign in again to open your workspace."} label="Sign out" busy={busy} onCancel={()=>setConfirm(false)} onConfirm={()=>void logout()}/>}
 </div>;
}
