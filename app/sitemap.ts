import type {MetadataRoute} from "next";
export default function sitemap():MetadataRoute.Sitemap{const base=process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000";return ["","/terms","/privacy","/safety"].map((path)=>({url:`${base}${path}`,lastModified:new Date(),changeFrequency:path?"monthly":"weekly",priority:path?0.5:1}))}
