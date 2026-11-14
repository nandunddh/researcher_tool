"use client";
import { ComponentLibrary } from "./component-library";
import { instantiateComponent } from "./component-instance";
export function EditorLibrary(){return <ComponentLibrary onClose={()=>window.parent.postMessage({type:"scistudio-library-close"},window.location.origin)} onAdd={item=>window.parent.postMessage({type:"scistudio-library-add",component:instantiateComponent(item)},window.location.origin)}/>}
