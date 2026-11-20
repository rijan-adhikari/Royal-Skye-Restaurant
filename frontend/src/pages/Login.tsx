import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch {
      setError("Invalid username or password");
    }
  };

  return (
    <main className="rs-login relative min-h-screen overflow-hidden px-5 py-12 text-[#edf4f4]">
      <style>{`
        .rs-login {
          isolation: isolate;
          background:
            radial-gradient(ellipse at 23% 48%, rgba(35, 119, 106, .19), transparent 38%),
            radial-gradient(ellipse at 85% 12%, rgba(180, 124, 66, .10), transparent 34%),
            #070a0d;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        }
        .rs-login::before {
          position: absolute; inset: 0; z-index: -1; content: "";
          background-image: linear-gradient(rgba(134, 177, 174, .055) 1px, transparent 1px), linear-gradient(90deg, rgba(134, 177, 174, .055) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
          pointer-events: none;
        }
        .rs-login::after {
          position: absolute; inset: 0; z-index: -1; content: "";
          opacity: .22; pointer-events: none;
          background-image: radial-gradient(rgba(183, 220, 208, .55) .7px, transparent .7px);
          background-size: 34px 34px;
          mask-image: radial-gradient(ellipse at 30% 50%, #000, transparent 65%);
        }
        .rs-login-art { animation: rs-float 8s ease-in-out infinite; filter: drop-shadow(0 24px 60px rgba(46, 210, 174, .10)); }
        .rs-login-orbit { transform-origin: 50% 50%; animation: rs-orbit 24s linear infinite; }
        .rs-login-orbit-reverse { transform-origin: 50% 50%; animation: rs-orbit 32s linear infinite reverse; }
        .rs-login-scan { animation: rs-scan 5.5s ease-in-out infinite; }
        .rs-login-pulse { animation: rs-pulse 2.8s ease-in-out infinite; }
        .rs-login-card { background: linear-gradient(145deg, rgba(17, 28, 34, .94), rgba(9, 15, 20, .94)); border: 1px solid rgba(137, 185, 174, .20); box-shadow: 0 28px 90px rgba(0,0,0,.48), inset 0 1px rgba(255,255,255,.035), 0 0 50px rgba(69, 203, 169, .045); backdrop-filter: blur(18px); }
        .rs-login-input { background: rgba(4, 10, 14, .72); border: 1px solid rgba(148, 177, 177, .20); color: #edf4f4; outline: none; transition: border-color .2s, box-shadow .2s, background .2s; }
        .rs-login-input:focus { border-color: rgba(101, 230, 194, .72); box-shadow: 0 0 0 3px rgba(101, 230, 194, .10); background: rgba(4, 10, 14, .92); }
        .rs-login-input::placeholder { color: #62747a; }
        .rs-login-button { background: linear-gradient(100deg, #1d927d, #45c9a7); color: #06120f; box-shadow: 0 8px 26px rgba(54, 198, 163, .18); transition: transform .2s, filter .2s, box-shadow .2s; }
        .rs-login-button:hover { filter: brightness(1.09); transform: translateY(-1px); box-shadow: 0 12px 30px rgba(54, 198, 163, .25); }
        @keyframes rs-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes rs-orbit { to { transform: rotate(360deg); } }
        @keyframes rs-scan { 0%,100% { transform: translateY(-95px); opacity: 0; } 18%,78% { opacity: .7; } 50% { transform: translateY(95px); opacity: .25; } }
        @keyframes rs-pulse { 0%,100% { opacity: .45; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.08); } }
        @media (max-width: 760px) {
          .rs-login { padding: 1.5rem 1rem 2rem; }
          .rs-login-layout {
            min-height: auto;
            grid-template-columns: minmax(0, 1fr);
            max-width: 430px;
            gap: 0;
          }
          .rs-login-visual { display: none; }
          .rs-login-layout > section { width: 100%; min-width: 0; }
          .rs-login-card { padding: 1.35rem; border-radius: 18px; }
          .rs-login-credit { margin-top: 1.35rem; }
          .rs-login-credit > p:nth-child(2) { font-size: 1.1rem; }
          .rs-login-credit a { min-height: 38px; }
          .rs-login-bottom-label { display: none; }
        }
        @media (max-width: 360px) {
          .rs-login { padding-right: .75rem; padding-left: .75rem; }
          .rs-login-card { padding: 1.1rem; }
          .rs-login-credit a { font-size: .98rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rs-login-art, .rs-login-orbit, .rs-login-orbit-reverse, .rs-login-scan, .rs-login-pulse { animation: none !important; }
          .rs-login-button, .rs-login-input { transition: none !important; }
        }
      `}</style>

      <div className="pointer-events-none absolute left-[8%] top-[13%] h-64 w-64 rounded-full bg-[#2ac5a2]/[.055] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[8%] right-[8%] h-72 w-72 rounded-full bg-[#d49b5c]/[.045] blur-3xl" />

      <div className="rs-login-layout relative mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-[1120px] grid-cols-[minmax(0,1fr)_420px] items-center gap-10">
        <section className="rs-login-visual relative flex min-h-[590px] flex-col justify-center" aria-label="Royal Skye system visual">
          <div className="absolute left-0 top-5 flex items-center gap-2 text-[10px] font-semibold tracking-[.24em] text-[#8ba39f]">
            <span className="rs-login-pulse h-2 w-2 rounded-full bg-[#65e6c2] shadow-[0_0_12px_#65e6c2]" />
            ROYAL SKYE / OPERATIONS NETWORK
          </div>

          <div className="rs-login-art relative mx-auto aspect-square w-full max-w-[570px]" aria-hidden="true">
            <svg viewBox="0 0 620 620" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="rsCoreGlow"><stop stopColor="#65e6c2" stopOpacity=".22"/><stop offset=".58" stopColor="#65e6c2" stopOpacity=".055"/><stop offset="1" stopColor="#65e6c2" stopOpacity="0"/></radialGradient>
                <linearGradient id="rsWire" x1="130" y1="110" x2="480" y2="500"><stop stopColor="#65e6c2" stopOpacity=".82"/><stop offset="1" stopColor="#65e6c2" stopOpacity=".08"/></linearGradient>
                <linearGradient id="rsAmber" x1="120" y1="200" x2="500" y2="420"><stop stopColor="#f2b86b" stopOpacity=".05"/><stop offset=".5" stopColor="#f2b86b" stopOpacity=".75"/><stop offset="1" stopColor="#f2b86b" stopOpacity=".05"/></linearGradient>
                <clipPath id="rsSphereClip"><circle cx="310" cy="300" r="154"/></clipPath>
              </defs>
              <circle cx="310" cy="300" r="230" fill="url(#rsCoreGlow)"/>
              <g className="rs-login-orbit">
                <ellipse cx="310" cy="300" rx="244" ry="92" stroke="#65e6c2" strokeOpacity=".28" strokeDasharray="3 10" transform="rotate(-27 310 300)"/>
                <circle cx="78" cy="190" r="4" fill="#65e6c2"/><circle cx="78" cy="190" r="10" stroke="#65e6c2" strokeOpacity=".25"/>
              </g>
              <g className="rs-login-orbit-reverse">
                <ellipse cx="310" cy="300" rx="215" ry="128" stroke="#f2b86b" strokeOpacity=".34" strokeDasharray="2 9" transform="rotate(38 310 300)"/>
                <circle cx="496" cy="376" r="4" fill="#f2b86b"/><circle cx="496" cy="376" r="11" stroke="#f2b86b" strokeOpacity=".25"/>
              </g>
              <circle cx="310" cy="300" r="154" fill="#0a151a" fillOpacity=".55" stroke="url(#rsWire)" strokeWidth="1.5"/>
              <g clipPath="url(#rsSphereClip)" stroke="#65e6c2" strokeOpacity=".34" strokeWidth="1">
                <ellipse cx="310" cy="300" rx="150" ry="48"/><ellipse cx="310" cy="300" rx="150" ry="94"/><ellipse cx="310" cy="300" rx="150" ry="132"/>
                <ellipse cx="310" cy="300" rx="52" ry="154"/><ellipse cx="310" cy="300" rx="102" ry="154"/>
                <path d="M156 300H464M170 235H450M170 365H450M210 170L410 430M410 170L210 430"/>
                <path className="rs-login-scan" d="M150 260H470" stroke="#f2b86b" strokeOpacity=".8" strokeWidth="2"/>
              </g>
              <circle cx="310" cy="300" r="154" stroke="#65e6c2" strokeOpacity=".45"/>
              <circle cx="310" cy="300" r="170" stroke="#65e6c2" strokeOpacity=".12" strokeDasharray="1 8"/>
              <path d="M310 96V132M310 468V504M106 300H142M478 300H514" stroke="#f2b86b" strokeOpacity=".65"/>
              <circle cx="310" cy="300" r="5" fill="#65e6c2"/><circle cx="310" cy="300" r="18" stroke="#65e6c2" strokeOpacity=".3"/>
              <g fill="#a9c3bd" fontFamily="monospace" fontSize="9" letterSpacing="2">
                <text x="310" y="68" textAnchor="middle">RS / CORE SYSTEM</text>
                <text x="310" y="548" textAnchor="middle">LIVE OPERATIONS MATRIX</text>
                <text x="74" y="310">N 27°</text><text x="478" y="310">E 85°</text>
              </g>
              <g stroke="url(#rsAmber)" strokeWidth="1">
                <path d="M115 450L190 405L218 405"/><path d="M404 184L462 148L500 148"/>
                <path d="M402 420L455 450L500 450"/>
              </g>
              <g fill="#f2b86b"><circle cx="218" cy="405" r="2.5"/><circle cx="500" cy="148" r="2.5"/><circle cx="500" cy="450" r="2.5"/></g>
            </svg>
          </div>

          <div className="absolute bottom-6 left-0 right-0 flex items-end justify-between gap-6">
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-[.25em] text-[#65e6c2]">INTELLIGENT HOSPITALITY</p>
              <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-.045em] text-[#edf4f4]">Every detail.<br/><span className="text-[#65e6c2]">Under control.</span></h2>
            </div>
            <div className="hidden border-l border-[#65e6c2]/25 pl-4 text-right text-[9px] leading-5 tracking-[.16em] text-[#7e9692] xl:block">
              <p>SECURE ACCESS</p><p>REAL-TIME WORKSPACE</p><p className="text-[#f2b86b]">EST. / ROYAL SKYE</p>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="mb-5 flex items-center justify-between px-1 text-[9px] font-semibold tracking-[.2em] text-[#78908c]">
            <span>AUTHENTICATION GATEWAY</span>
            <span className="flex items-center gap-2"><span className="rs-login-pulse h-1.5 w-1.5 rounded-full bg-[#65e6c2]"/> SYSTEM READY</span>
          </div>
          <form onSubmit={handleSubmit} className="rs-login-card relative overflow-hidden rounded-[22px] p-8">
            <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#65e6c2]/[.07] blur-3xl"/>
            <div className="relative">
              <div className="mb-7 flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#d7b17b]/35 bg-[#fffaf4] p-0 shadow-[0_0_28px_rgba(101,230,194,.10)]"><img src="/images/logo.jpg" alt="Royal Skye restaurant logo" className="h-full w-full object-contain" /></div>
                <div>
                  <p className="text-[13px] font-bold tracking-[.19em] text-[#f2f5f2]">ROYAL SKYE</p>
                  <p className="mt-1 text-[9px] font-semibold tracking-[.2em] text-[#7f9691]">RESTAURANT & BAR CAFE</p>
                </div>
              </div>
              <p className="mb-2 text-[10px] font-semibold tracking-[.22em] text-[#65e6c2]">STAFF ACCESS / 01</p>
              <h1 className="text-[27px] font-semibold tracking-[-.04em] text-[#f0f5f2]">Welcome back.</h1>
              <p className="mb-7 mt-2 text-[12px] leading-5 text-[#91a39f]">Sign in to access your restaurant workspace.</p>

              <label htmlFor="rs-username" className="mb-2 block text-[10px] font-semibold tracking-[.12em] text-[#b8c8c2]">USERNAME</label>
              <input
                id="rs-username"
                name="username"
                autoComplete="username"
                className="rs-login-input mb-5 w-full rounded-xl px-4 py-3 text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                placeholder="Enter your username"
              />
              <label htmlFor="rs-password" className="mb-2 block text-[10px] font-semibold tracking-[.12em] text-[#b8c8c2]">PASSWORD</label>
              <input
                id="rs-password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="rs-login-input mb-5 w-full rounded-xl px-4 py-3 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              {error && <p role="alert" className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</p>}
              <button type="submit" className="rs-login-button w-full rounded-xl py-3 text-xs font-extrabold tracking-[.13em]">
                ACCESS WORKSPACE <span className="ml-2" aria-hidden="true">↗</span>
              </button>
              <div className="mt-6 flex items-center justify-between border-t border-white/[.08] pt-4 text-[9px] tracking-[.12em] text-[#6e8580]">
                <span>ENCRYPTED SESSION</span><span className="text-[#65e6c2]">● SECURE LOGIN</span>
              </div>
            </div>
          </form>
          <div className="rs-login-credit mt-7 text-center">
            <p className="text-xs font-extrabold tracking-[.2em] text-[#d5eee6]">DEVELOPED BY</p>
            <p className="mt-1 text-xl font-black tracking-[.1em] text-[#65e6c2]">RIJAN ADHIKARI</p>
            <p className="mt-2 text-[10px] tracking-[.12em] text-[#829b94]">VISIT THE DEVELOPER</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <a href="https://adhikari-rijan.onrender.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit Rijan Adhikari's website" className="rounded-full border border-[#65e6c2]/45 bg-[#65e6c2]/10 px-4 py-2 text-[10px] font-bold tracking-[.1em] text-[#65e6c2] transition hover:bg-[#65e6c2]/20 hover:text-white">WEBSITE ↗</a>
              <a href="https://github.com/rijan-adhikari" target="_blank" rel="noopener noreferrer" aria-label="Visit Rijan Adhikari's GitHub" className="rounded-full border border-white/15 bg-white/[.04] px-4 py-2 text-[10px] font-bold tracking-[.1em] text-[#d5eee6] transition hover:border-[#65e6c2]/50 hover:text-[#65e6c2]">GITHUB ↗</a>
            </div>
          </div>
        </section>
      </div>
      <div className="rs-login-bottom-label pointer-events-none absolute bottom-4 left-0 right-0 text-center text-[8px] font-medium tracking-[.24em] text-[#465c58]">ROYAL SKYE SYSTEMS <span className="mx-2 text-[#f2b86b]/70">/</span> AUTHORIZED PERSONNEL ONLY</div>
    </main>
  );
}
