import type {MetadataRoute} from "next";
export default function robots():MetadataRoute.Robots{return {rules:[{userAgent:"*",allow:["/","/terms","/privacy","/safety"],disallow:["/dashboard","/signin","/join","/admin","/api"]}],sitemap:"/sitemap.xml"}}
