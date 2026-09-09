import Link from "next/link";

const faqs = [
  ["Who can join BYLLD X?", "Founders building serious ventures and investors looking for credible early-stage opportunities can create a role-specific account."],
  ["Can I change my role later?", "No. Your Founder or Investor role is permanent, keeping discovery relevant and preventing duplicate identities."],
  ["What can investors see before connecting?", "Only a founder's profile, active niches and a limited primary-idea teaser. Protected descriptions unlock after a connection is accepted."],
  ["Does BYLLD X handle investments?", "No. BYLLD X supports discovery and communication only. Investments, legal agreements, payments and equity transactions happen outside the platform."],
  ["How do Free limits work?", "Free members receive seven unique profile opens and seven connection requests each week. Premium removes those limits and unlocks sending in chat."],
];

const Logo = () => <span className="wordmark" aria-label="BYLLD X">BYLLD <b>X</b></span>;

export default function Home() {
  return (
    <main className="site-shell">
      <div className="ambient" aria-hidden="true"><span /><span /><span /></div>
      <header className="public-header glass">
        <Link href="#top" className="brand-link"><Logo /></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how">How It Works</a><a href="#founders">For Founder</a><a href="#investors">For Investor</a>
          <a href="#pricing">Pricing</a><Link href="/signin?next=/dashboard">Inbox</Link><a href="#about">About Us</a>
        </nav>
        <div className="header-actions"><Link href="/signin" className="text-link">Sign In</Link><Link href="/join" className="button button-small">Join BYLLD X</Link></div>
        <details className="mobile-nav"><summary aria-label="Open navigation"><span /><span /><span /></summary><nav><a href="#how">How It Works</a><a href="#founders">For Founder</a><a href="#investors">For Investor</a><a href="#pricing">Pricing</a><Link href="/signin">Sign In</Link><Link href="/join">Join BYLLD X</Link></nav></details>
      </header>

      <section className="hero section" id="top">
        <div className="hero-x" aria-hidden="true"><i /><i /></div>
        <div className="hero-copy reveal">
          <div className="eyebrow"><span /> Built in India. Backing what&apos;s next.</div>
          <h1>WHERE <em>AMBITION</em><br />MEETS <em>BACKING.</em></h1>
          <p>Discover founders with conviction. Meet investors with context. Build trusted connections and discuss opportunities in one focused network.</p>
          <div className="hero-actions"><Link className="button" href="/join?role=founder">Join as Founder <span>→</span></Link><Link className="button button-ghost" href="/join?role=investor">Join as Investor <span>→</span></Link></div>
          <div className="trust-row"><div><strong>140+</strong><small>Founders</small></div><div><strong>42+</strong><small>Investors</small></div><div><strong>₹2.6L+</strong><small>Capital intent</small></div></div>
        </div>

        <div className="hero-stage" aria-label="BYLLD X product preview">
          <article className="float-card founder-card glass">
            <div className="card-label">Founder profile <span>•••</span></div>
            <div className="person-row"><div className="avatar avatar-arjun">AM</div><div><strong>Arjun Mehta</strong><a>Serial Founder</a><small>Bengaluru, India</small></div></div>
            <div className="mini-stats"><span><b>2</b>Startups</span><span><b>1</b>Exit</span><span><b>6+</b>Years</span></div>
            <div className="chips"><i>AI</i><i>SaaS</i><i>Deep Tech</i></div>
          </article>
          <article className="float-card idea-card glass-blue">
            <div className="card-label">Primary idea <span>✦</span></div>
            <div className="idea-title"><div className="idea-mark">X</div><div><strong>AgriSense</strong><small>AI-powered crop intelligence for smallholder farmers.</small></div></div>
            <div className="chips"><i>Agriculture</i><i>AI</i><i>Sustainability</i></div>
            <div className="funding-panel"><small>Seeking investment</small><strong>₹5L–₹10L</strong><span>Pre-Seed · Pune, India</span></div>
          </article>
          <article className="float-card investor-card glass">
            <div className="card-label">Investor profile <span>•••</span></div>
            <div className="person-row"><div className="avatar avatar-neha">NK</div><div><strong>Neha Kapoor</strong><a>VC Investor</a><small>Mumbai, India</small></div></div>
            <div className="mini-stats"><span><b>120+</b>Investments</span><span><b>3</b>Exits</span><span><b>8+</b>Years</span></div>
            <div className="chips"><i>AI</i><i>Fintech</i><i>SaaS</i></div>
          </article>
          <div className="connection-card glass-blue"><span className="pulse">✦</span><div><strong>Connection in progress</strong><small>Arjun and Neha are exploring this opportunity.</small></div></div>
        </div>
      </section>

      <section className="logo-strip glass"><span>Trusted by India&apos;s ambitious builders</span><div><b>BLUME</b><b>100X</b><b>ORIOS</b><b>LetsVenture</b><b>angelprime</b></div></section>

      <section className="section content-section" id="how">
        <div className="section-heading centered"><span className="eyebrow">A focused path to the right conversation</span><h2>HOW BYLLD X <em>WORKS</em></h2><p>Designed to move from credible context to meaningful connection—without the noise of a public social network.</p></div>
        <div className="steps-grid">
          {[['01','Create your profile','Set your permanent role, experience, sectors and the details that make you relevant.'],['02','Discover the right people','Use curated recommendations, search and filters built around active interests.'],['03','Connect & discuss','Send a request, unlock protected context and continue in your focused inbox.']].map(([n,t,d])=><article className="step-card glass" key={n}><span>{n}</span><div className="step-icon">{n==='01'?'◎':n==='02'?'⌕':'↗'}</div><h3>{t}</h3><p>{d}</p></article>)}
        </div>
      </section>

      <section className="section split-section" id="founders">
        <div className="product-visual glass visual-founders"><div className="interface-bar"><b>My Ideas</b><span>2 of 3 active</span></div><article className="idea-list-card primary"><div><small>PRIMARY IDEA</small><h3>VedaGrid</h3><p>Predictive energy orchestration for commercial buildings.</p></div><strong>₹80L</strong></article><article className="idea-list-card"><div><small>ACTIVE</small><h3>LoopWorks</h3><p>Verified circular supply chains for consumer brands.</p></div><strong>₹35L</strong></article><div className="limit-meter"><span /><p><b>5 views</b> remaining this week</p></div></div>
        <div className="benefit-copy"><span className="eyebrow">For founders</span><h2>TURN YOUR <em>CONVICTION</em> INTO CONTEXT.</h2><p>Show more than a pitch. Build a trusted founder profile, publish controlled idea teasers and decide who earns access to the full opportunity.</p><ul className="check-list"><li>Publish up to three active ideas on Free</li><li>Control one Primary Idea at a time</li><li>Protect complete idea details until connected</li><li>Discover investors by thesis and range</li></ul><Link href="/join?role=founder" className="inline-link">Build your founder profile <span>→</span></Link></div>
      </section>

      <section className="section split-section reverse" id="investors">
        <div className="benefit-copy"><span className="eyebrow">For investors</span><h2>DISCOVER SIGNAL <em>BEFORE</em> THE INTRO.</h2><p>Search emerging founders by sector, location and active interests. Save promising profiles without consuming a view, then connect when the fit is real.</p><ul className="check-list"><li>Founder recommendations aligned to your thesis</li><li>Search names, industries, niches and keywords</li><li>View protected ideas only after connecting</li><li>Keep saved, pending and connected founders organized</li></ul><Link href="/join?role=investor" className="inline-link">Create your investor profile <span>→</span></Link></div>
        <div className="product-visual glass visual-discover"><div className="interface-bar"><b>Recommended founders</b><span>Best match⌄</span></div>{[['SM','Sara Menon','Climate fintech for emerging markets','Fintech · Climate'],['RV','Rohan Verma','Making industrial robotics accessible','Robotics · SaaS'],['AK','Aisha Khan','Next-gen diagnostics at the edge','Healthtech · AI']].map((p,i)=><article className="discover-row" key={p[1]}><div className={`avatar tone-${i}`}>{p[0]}</div><div><strong>{p[1]}</strong><p>{p[2]}</p><small>{p[3]}</small></div><button aria-label={`Save ${p[1]}`}>☆</button></article>)}</div>
      </section>

      <section className="section discovery-preview" id="product">
        <div className="section-heading"><span className="eyebrow">Discovery designed around relevance</span><h2>FIND THE PEOPLE WHO <em>MOVE IDEAS FORWARD.</em></h2></div>
        <div className="discovery-shell glass">
          <aside><b>Discover</b><button className="active">For you</button><button>All profiles</button><button>Saved</button><hr /><small>FILTER BY</small><button>Industry</button><button>Location</button><button>Investment range</button></aside>
          <div className="feed"><div className="feed-head"><div className="search-faux">⌕ Search names, niches or keywords</div><button>Best match⌄</button></div><div className="profile-grid">{[['PK','Priya Khanna','Founder · Clean energy','Battery intelligence for India’s next grid.'],['DM','Dev Malhotra','Founder · Enterprise AI','Secure AI copilots for regulated teams.'],['NS','Naina Shah','Founder · Consumer','Modern care infrastructure for working families.']].map((p,i)=><article className="profile-card" key={p[1]}><div className="profile-top"><div className={`avatar tone-${i}`}>{p[0]}</div><button aria-label={`Save ${p[1]}`}>☆</button></div><span className="role-badge">FOUNDER</span><h3>{p[1]}</h3><small>{p[2]}</small><p>{p[3]}</p><div className="chips"><i>AI</i><i>India</i><i>Pre-seed</i></div><Link href="/signin?next=/dashboard?view=discover">Open profile <span>→</span></Link></article>)}</div></div>
        </div>
      </section>

      <section className="section compare-section" id="pricing">
        <div className="section-heading centered"><span className="eyebrow">Simple monthly access. No auto-renewal.</span><h2>START FREE. GO <em>PREMIUM</em> WHEN IT COUNTS.</h2><p>Every plan keeps discovery credible. Premium removes weekly limits and unlocks active messaging.</p></div>
        <div className="role-pricing">
          <article className="pricing-card glass"><div><span>FOUNDER PREMIUM</span><h3><sup>₹</sup>240<small>/ month</small></h3><p>For founders actively raising and building relationships.</p></div><ul><li>Unlimited profile opens</li><li>Unlimited connection requests</li><li>Up to 5 active ideas & niches</li><li>Send messages to connections</li><li>Webhook-verified access</li></ul><Link href="/join?role=founder" className="button">Join as Founder</Link></article>
          <article className="pricing-card glass featured"><div className="premium-badge">✦ MOST FOCUSED</div><div><span>INVESTOR PREMIUM</span><h3><sup>₹</sup>310<small>/ month</small></h3><p>For investors building an active opportunity pipeline.</p></div><ul><li>Unlimited profile opens</li><li>Unlimited connection requests</li><li>Up to 5 active niches</li><li>Send messages to connections</li><li>Webhook-verified access</li></ul><Link href="/join?role=investor" className="button">Join as Investor</Link></article>
        </div>
        <div className="comparison glass"><div><b>FREE FOR BOTH ROLES</b><p>7 unique profile opens/week · 7 requests/week · read-only chat · 3 active niches</p></div><Link href="/subscription">Compare every feature →</Link></div>
      </section>

      <section className="section safety-section" id="safety"><div className="safety-mark">!</div><div><span className="eyebrow">Know the platform boundary</span><h2>DISCOVER WITH <em>CONTEXT.</em> DECIDE WITH CARE.</h2><p>BYLLD X is a discovery and communication platform—not an investment adviser, broker or guarantor. Investments, agreements, payments and equity transactions happen outside BYLLD X. Always perform independent legal and financial checks.</p><div className="safety-links"><Link href="/terms">Read complete Terms →</Link><Link href="/safety">Safety standards →</Link></div></div></section>

      <section className="section faq-section"><div className="section-heading"><span className="eyebrow">Clear answers, before you connect</span><h2>FREQUENTLY ASKED <em>QUESTIONS</em></h2></div><div className="faq-list">{faqs.map(([q,a],i)=><details className="glass" key={q} open={i===0}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>

      <section className="section about-section glass" id="about"><div><span className="eyebrow">About BYLLD X</span><h2>BACKING INDIA&apos;S NEXT <em>BOLD MOVE.</em></h2></div><div><p>BYLLD X exists to give serious founders and investors a more intentional place to discover one another. Less broadcasting. More relevant context, responsible access and conversations that can move ambition forward.</p><Link href="/join" className="button">Join the network <span>→</span></Link></div></section>

      <footer className="footer"><div className="footer-brand"><Logo /><p>Where ambition meets backing.</p></div><div><b>Platform</b><a href="#how">How it works</a><a href="#pricing">Pricing</a><Link href="/signin">Sign in</Link></div><div><b>Trust</b><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/safety">Safety</Link></div><div><b>Connect</b><a href="mailto:support.bylldx@gmail.com">support.bylldx@gmail.com</a><small style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Built by Saurabh Singh</small></div><div className="footer-bottom"><span>© 2026 BYLLD X. All rights reserved.</span><span>Made for builders in India · Built by Saurabh Singh</span></div></footer>
    </main>
  );
}
