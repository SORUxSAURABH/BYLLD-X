import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPanel from "../components/AuthPanel";
export const metadata:Metadata={title:"Sign In",robots:{index:false,follow:false}};
export default function SignIn(){return <Suspense fallback={<div className="auth-page"/>}><AuthPanel mode="signin"/></Suspense>}
