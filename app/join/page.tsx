import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPanel from "../components/AuthPanel";
export const metadata:Metadata={title:"Join",robots:{index:false,follow:false}};
export default function Join(){return <Suspense fallback={<div className="auth-page"/>}><AuthPanel mode="join"/></Suspense>}
