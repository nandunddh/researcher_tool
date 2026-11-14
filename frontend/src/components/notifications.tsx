"use client";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
export function Notifications(){return <ToastContainer position="bottom-right" autoClose={4500} closeOnClick pauseOnHover pauseOnFocusLoss theme="light" limit={3}/>}
