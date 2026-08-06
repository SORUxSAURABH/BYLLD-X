"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

type Role = "founder" | "investor";
type View = "overview" | "discover" | "ideas" | "network" | "inbox" | "subscription" | "profile";

const founders = [
  ["SM", "Sara Menon", "Climate systems founder", "Mumbai, India", "A carbon-aware treasury layer for fast-growing Indian businesses.", "₹60L–₹1.2Cr"],
  ["RV", "Rohan Verma", "Industrial robotics founder", "Pune, India", "Adaptive cobots that make advanced automation accessible to MSMEs.", "₹1Cr–₹2Cr"],
  ["AK", "Aisha Khan", "Healthtech founder", "Hyderabad, India", "Reliable diagnostics at the edge for clinics beyond major cities.", "₹80L–₹1.5Cr"],
  ["NM", "Nikhil Mehra", "Enterprise AI founder", "Bengaluru, India", "Secure, auditable copilots for regulated operations teams.", "₹2Cr–₹3Cr"],
  ["PD", "Pooja Desai", "Consumer care founder", "Ahmedabad, India", "A modern care network designed for India’s working families.", "₹50L–₹90L"],
  ["JT", "Jayant Taneja", "Agritech founder", "Jaipur, India", "Crop intelligence that works for small and marginal farms.", "₹40L–₹75L"],
];
const investors = [
  ["NK", "Neha Kapoor", "Venture Capital · Seed", "Mumbai, India", "Invests in ambitious AI, fintech and climate founders across India.", "₹25L–₹2Cr"],
  ["AS", "Ananya Shah", "Angel Investor · Operator", "Bengaluru, India", "Backing technical founders building resilient B2B products.", "₹10L–₹75L"],
  ["VK", "Vikram Khurana", "Micro VC · Pre-seed", "Delhi, India", "First institutional cheque for deeptech and enterprise software.", "₹50L–₹1.5Cr"],
  ["RM", "Rhea Malhotra", "Family Office · Growth", "Chennai, India", "Patient capital for health, climate and essential infrastructure.", "₹1Cr–₹5Cr"],
  ["SB", "Siddharth Bose", "Angel Syndicate", "Kolkata, India", "Founder-led syndicate for the next generation of consumer brands.", "₹20L–₹1Cr"],
  ["TP", "Tara Patel", "Venture Partner", "Ahmedabad, India", "Early-stage partnerships at the intersection of software and industry.", "₹30L–₹2Cr"],
];

const glyphs: Record<View, string> = { overview: "◫", discover: "⌕", ideas: "◇", network: "◎", inbox: "□", subscription: "✦", profile: "○" };

function Avatar({ initials, tone = 0 }: { initials: string; tone?: number }) { return <div className={`avatar tone-${tone % 3}`}>{initials}</div>; }

export default function DashboardApp() {
  const params = useSearchParams();
  const role = (params.get("role") === "investor" ? "investor" : "founder") as Role;
  const view = (["overview","discover","ideas","network","inbox","subscription","profile"].includes(params.get("view") || "") ? params.get("view") : "overview") as View;
  const [saved, setSaved] = useState<string[]>(["Neha Kapoor"]);
  const [toast, setToast] = useState("");
  const base = `/dashboard?role=${role}`;
  const nav: [View,string][] = [
    ["overview","Dashboard"], ["discover", role === "founder" ? "Discover Investors" : "Recommended Founders"],
    ...(role === "founder" ? [["ideas","My Ideas"] as [View,string]] : []),
    ["network","Network"], ["inbox","My Inbox"], ["subscription","Subscription"], ["profile","Profile"]
  ];
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2500); };

  return <div className="app-body">
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link href={base} className="wordmark">BYLLD <b>X</b></Link>
        <nav className="app-nav" aria-label={`${role} navigation`}>{nav.map(([id,label]) => <Link className={view===id?"active":""} href={`${base}&view=${id}`} key={id}><span className="nav-glyph">{glyphs[id]}</span>{label}</Link>)}</nav>
        <div className="app-sidebar-bottom"><div className="profile-chip"><Avatar initials={role === "founder" ? "AM" : "NK"}/><div><strong>{role === "founder" ? "Arjun Mehta" : "Neha Kapoor"}</strong><small>{role === "founder" ? "Founder · Free" : "Investor · Premium"}</small></div></div></div>
      </aside>
      <main className="app-main">
        <header className="app-topbar"><h1>{nav.find(([id])=>id===view)?.[1]}</h1><div className="app-topbar-actions"><Link href={`/dashboard?role=${role === "founder" ? "investor" : "founder"}&view=${view}`} className="preview-role">Preview as {role === "founder" ? "Investor" : "Founder"}</Link><button className="icon-button" aria-label="Search" onClick={()=>notify("Search opens from Discover")}>⌕</button><button className="icon-button" aria-label="Notifications" onClick={()=>notify("2 unread notifications")}>♢</button></div></header>
        <div className="app-content">
          {view === "overview" && <Overview role={role} base={base}/>} 
          {view === "discover" && <Discover role={role} saved={saved} setSaved={setSaved} notify={notify}/>} 
          {view === "ideas" && <Ideas notify={notify}/>} 
          {view === "network" && <Network role={role} notify={notify}/>} 
          {view === "inbox" && <Inbox role={role}/>} 
          {view === "subscription" && <Subscription role={role} notify={notify}/>} 
          {view === "profile" && <Profile role={role} notify={notify}/>} 
        </div>
      </main>
    </div>
    {toast && <div role="status" style={{position:"fixed",right:22,bottom:24,zIndex:90,background:"#061b4e",color:"white",padding:"13px 18px",borderRadius:11,fontSize:11,boxShadow:"0 15px 40px rgba(0,30,90,.25)"}}>{toast}</div>}
  </div>;
}

function Overview({role,base}:{role:Role;base:string}) {
  const founder = role === "founder";
  return <>
    <div className="app-welcome"><div><span className="eyebrow">Thursday, 6 August</span><h2>Good morning, {founder?"Arjun":"Neha"}.</h2><p>{founder?"Your profile is visible. Publish your first idea to start connecting.":"Three new founders match your active investment interests."}</p></div><Link className="button button-small" href={`${base}&view=${founder?"ideas":"discover"}`}>{founder?"Publish an idea":"Explore founders"} →</Link></div>
    <div className="stat-grid">
      <article className="stat-card glass"><span>Profile completeness</span><strong>{founder?"78%":"100%"}</strong><small>{founder?"2 essentials left":"Ready for recommendations"}</small><div className="progress-bar"><span style={{width:founder?"78%":"100%"}}/></div></article>
      <article className="stat-card glass"><span>Weekly views left</span><strong>{founder?"5":"∞"}</strong><small>{founder?"Resets Monday":"Unlimited with Premium"}</small></article>
      <article className="stat-card glass"><span>Requests left</span><strong>{founder?"7":"∞"}</strong><small>{founder?"Resets Monday":"Unlimited with Premium"}</small></article>
      <article className="stat-card glass"><span>Subscription</span><strong>{founder?"Free":"Premium"}</strong><small>{founder?"Upgrade when ready":"Active until 31 Aug"}</small></article>
    </div>
    <h3 className="app-section-title">Your network at a glance</h3>
    <div className="app-grid"><section className="panel glass"><div className="panel-head"><h3>Connection requests</h3><Link href={`${base}&view=network`}>VIEW ALL →</Link></div><div className="action-list">{(founder?[["NK","Neha Kapoor","VC Investor · Mumbai"],["AS","Ananya Shah","Angel Investor · Bengaluru"]]:[["SM","Sara Menon","Climate founder · Mumbai"],["RV","Rohan Verma","Robotics founder · Pune"]]).map((p,i)=><div className="action-row" key={p[1]}><Avatar initials={p[0]} tone={i}/><div><strong>{p[1]}</strong><small>{p[2]}</small></div><div className="row-actions"><button>Review</button><button className="primary">Accept</button></div></div>)}</div></section><aside className="usage-card"><span className="status-badge gold">✦ PREMIUM</span><h3>{founder?"Move without weekly limits":"Your access is active"}</h3><p>{founder?"Unlock unlimited discovery, requests, five active ideas and the ability to send messages.":"You can open profiles, send requests and message every connection without limits."}</p><Link className="button" href={`${base}&view=subscription`}>{founder?"See Premium":"Manage access"}</Link></aside></div>
    <div className="stat-grid" style={{marginTop:12}}><article className="stat-card glass"><span>Pending requests</span><strong>2</strong><small>Awaiting your review</small></article><article className="stat-card glass"><span>Active connections</span><strong>{founder?"4":"18"}</strong><small>Mutual, unlocked profiles</small></article><article className="stat-card glass"><span>Saved profiles</span><strong>{founder?"6":"24"}</strong><small>Organized for later</small></article><article className="stat-card glass"><span>{founder?"Active ideas":"Protected ideas"}</span><strong>{founder?"2 / 3":"11"}</strong><small>{founder?"One primary idea":"Unlocked by connections"}</small></article></div>
  </>;
}

function Discover({role,saved,setSaved,notify}:{role:Role;saved:string[];setSaved:(v:string[])=>void;notify:(s:string)=>void}) {
  const list = role === "founder" ? investors : founders;
  return <><div className="app-welcome"><div><span className="eyebrow">General discovery</span><h2>{role === "founder" ? "Discover investors" : "Recommended founders"}</h2><p>Search by name, industry, niche, keyword, location or investment range.</p></div></div><div className="app-discover-toolbar"><input className="app-search" aria-label="Search profiles" placeholder="⌕  Search names, niches or keywords"/><button className="filter-button">Filters 2</button><button className="filter-button">Best match⌄</button></div><div className="app-profile-grid">{list.map((p,i)=>{const isSaved=saved.includes(p[1]);return <article className="app-profile-card glass" key={p[1]}><div className="person-row"><Avatar initials={p[0]} tone={i}/><div><strong>{p[1]}</strong><a>{p[2]}</a><small>{p[3]}</small></div></div><div className="chips"><i>{i%2?"SaaS":"AI"}</i><i>{i%3?"India":"Climate"}</i><i>Pre-seed</i></div><p>{p[4]}</p><div className="fund-range"><small>{role === "founder"?"Investment range":"Funding requested"}</small><strong>{p[5]}</strong></div><div className="card-actions"><button onClick={()=>{setSaved(isSaved?saved.filter(x=>x!==p[1]):[...saved,p[1]]);notify(isSaved?"Removed from Saved":"Saved without consuming a view");}}>{isSaved?"★ Saved":"☆ Save"}</button><button className="primary" onClick={()=>notify("Profile opened · this is your first view this week")}>Open profile</button></div></article>})}</div></>;
}

function Ideas({notify}:{notify:(s:string)=>void}) { return <><div className="app-welcome"><div><span className="eyebrow">Founder workspace</span><h2>My Ideas</h2><p>Two active ideas. One Free active slot remains.</p></div><button className="button button-small" onClick={()=>notify("Idea editor ready for your first draft")}>New idea +</button></div><div className="tabs"><button className="active">Active · 2</button><button>Inactive · 1</button></div><div className="idea-management"><article className="management-card glass primary"><header><span className="status-badge">PRIMARY IDEA</span><button className="icon-button">•••</button></header><h3>VedaGrid</h3><p>Predictive energy orchestration for commercial buildings. Full problem, solution and supporting detail stays protected until connection.</p><div className="chips"><i>Climate</i><i>Energy</i><i>AI</i></div><footer><strong>₹80L requested</strong><button onClick={()=>notify("Opening secure idea editor")}>Edit idea</button></footer></article><article className="management-card glass"><header><span className="status-badge">ACTIVE</span><button className="icon-button">•••</button></header><h3>LoopWorks</h3><p>Verified circular supply chains for consumer brands. Teaser visible; protected business context remains private.</p><div className="chips"><i>Climate</i><i>Commerce</i><i>SaaS</i></div><footer><strong>₹35L requested</strong><button onClick={()=>notify("Primary idea changed to LoopWorks")}>Make primary</button></footer></article><article className="management-card glass"><header><span className="status-badge">INACTIVE</span><button className="icon-button">•••</button></header><h3>FieldNote</h3><p>Structured operational memory for distributed field teams.</p><div className="chips"><i>Enterprise</i><i>Mobile</i></div><footer><strong>Saved draft</strong><button onClick={()=>notify("Activated idea. Free plan now has 3 active ideas.")}>Activate</button></footer></article></div></>}

function Network({role,notify}:{role:Role;notify:(s:string)=>void}) { return <><div className="app-welcome"><div><span className="eyebrow">Relationship management</span><h2>Your Network</h2><p>Connections, received requests, sent requests and saved profiles remain separate.</p></div></div><div className="tabs"><button className="active">Connected · {role==="founder"?4:18}</button><button>Received · 2</button><button>Sent · 3</button><button>Expired</button><button>Rejected</button><button>Saved</button></div><section className="panel glass"><div className="action-list">{(role === "founder" ? investors.slice(0,4) : founders.slice(0,4)).map((p,i)=><div className="action-row" key={p[1]}><Avatar initials={p[0]} tone={i}/><div><strong>{p[1]}</strong><small>{p[2]} · Connected {i+2} weeks ago</small></div><div className="row-actions"><button onClick={()=>notify("Opening read-only profile preview")}>Profile</button><button className="primary" onClick={()=>notify("Opening existing conversation")}>Message</button></div></div>)}</div></section></>}

function Inbox({role}:{role:Role}) { const premium=role==="investor"; return <><div className="app-welcome"><div><span className="eyebrow">My Inbox</span><h2>Focused conversations</h2><p>Only mutual connections receive a conversation.</p></div></div><div className="tabs"><button className="active">Messages · 2</button><button>Notifications · 5</button></div><section className="inbox-layout glass"><aside className="conversation-list">{(role==="founder"?investors:founders).slice(0,4).map((p,i)=><div className={`conversation ${i===0?"active":""}`} key={p[1]}><Avatar initials={p[0]} tone={i}/><div><strong>{p[1]}</strong><small>{i===0?"I reviewed the overview…":"Connection accepted"}</small></div></div>)}</aside><div className="chat"><header className="chat-head"><Avatar initials={role==="founder"?"NK":"SM"}/><div><strong>{role==="founder"?"Neha Kapoor":"Sara Menon"}</strong><span className="online">● Online now</span></div></header><div className="messages"><div className="message">Thanks for connecting. I reviewed the public overview and would love to understand the current pilot.<small>10:24 AM</small></div><div className="message mine">Great to meet you. The pilot has been live across three sites for six weeks.<small>10:31 AM</small></div><div className="message">That is useful context. Could we set up a short call next Tuesday?<small>11:02 AM</small></div></div>{premium?<div className="chat-lock" style={{background:"#e9f6ef",borderColor:"#bce1ca"}}><p><b>Premium sending enabled.</b> Reply, share links or contact details securely.</p><button className="filter-button">Write a message…</button></div>:<div className="chat-lock"><p><b>Read-only on Free.</b> Upgrade to Premium to send messages. Your conversation stays visible.</p><Link href={`/dashboard?role=${role}&view=subscription`}>UPGRADE →</Link></div>}</div></section></>}

function Subscription({role,notify}:{role:Role;notify:(s:string)=>void}) { const price=role==="founder"?240:310; return <><div className="app-welcome"><div><span className="eyebrow">Manual monthly access</span><h2>Premium for {role==="founder"?"Founders":"Investors"}</h2><p>No auto-renewal. No free trial. No hidden payment flow.</p></div></div><div className="role-pricing" style={{gridTemplateColumns:"minmax(0,650px)"}}><article className="pricing-card glass featured"><div className="premium-badge">✦ PREMIUM</div><div><span>{role.toUpperCase()} ACCESS</span><h3><sup>₹</sup>{price}<small>/ one month</small></h3><p>Benefits remain active for one purchased month. Repurchase manually when you need more time.</p></div><ul><li>Unlimited profile opens</li><li>Unlimited connection requests</li><li>Five active niches {role==="founder"?"and ideas":""}</li><li>Send messages to connections</li><li>Downloadable test receipt</li></ul><button className="button" onClick={()=>notify("Mock checkout opened · no real payment will be charged")}>Try mock checkout →</button></article></div><p style={{fontSize:10,color:"var(--muted)",marginTop:18,maxWidth:650,lineHeight:1.6}}>Test mode only: a real Indian payment provider has not been selected. UPI, cards, net banking and wallets will be enabled through a provider adapter after merchant credentials are configured. No real charge is attempted in this preview.</p></>}

function Profile({role,notify}:{role:Role;notify:(s:string)=>void}) { return <><div className="app-welcome"><div><span className="eyebrow">Private BYLLD X profile</span><h2>Edit your discovery profile</h2><p>This page is designed to remain internal and excluded from search engines.</p></div><button className="button button-small" onClick={()=>notify("Profile changes saved")}>Save changes</button></div><section className="panel glass" style={{maxWidth:760}}><div className="person-row"><Avatar initials={role==="founder"?"AM":"NK"}/><div><strong>{role==="founder"?"Arjun Mehta":"Neha Kapoor"}</strong><a>{role==="founder"?"Founder":"Investor"} · permanent role</a><small>Photo upload uses private storage in production</small></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}><label className="field"><span>Professional headline</span><input defaultValue={role==="founder"?"Building intelligent energy infrastructure":"Seed investor in AI and climate"}/></label><label className="field"><span>Location</span><input defaultValue={role==="founder"?"Bengaluru, India":"Mumbai, India"}/></label><label className="field" style={{gridColumn:"1/-1"}}><span>Bio</span><input defaultValue="Operator, builder and long-term believer in ambitious Indian technology."/></label></div><h3 className="app-section-title">Active industries & niches</h3><div className="chips"><i>AI ×</i><i>Climate ×</i><i>SaaS ×</i><i>+ Other</i></div></section></>}
