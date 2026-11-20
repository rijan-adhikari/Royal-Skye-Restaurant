import React from "react";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rs-loading-shimmer rounded-lg ${className}`} />;
}

export default function LoadingScreen() {
  return (
    <div role="status" aria-label="Loading Royal Skye workspace" className="rs-loading-screen min-h-screen overflow-hidden px-4 py-5 text-[#e8f2ef] md:px-7 md:py-7">
      <style>{`
        .rs-loading-screen {
          position:relative;isolation:isolate;background:
            radial-gradient(ellipse at 76% 12%,rgba(101,230,194,.12),transparent 34%),
            radial-gradient(ellipse at 18% 85%,rgba(242,184,107,.07),transparent 30%),#070a0d;
        }
        .rs-loading-screen::before {
          content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.24;
          background-image:linear-gradient(rgba(101,230,194,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(101,230,194,.055) 1px,transparent 1px);
          background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent 92%);
        }
        .rs-loading-shimmer {position:relative;overflow:hidden;background:rgba(101,230,194,.075);border:1px solid rgba(101,230,194,.09);}
        .rs-loading-shimmer::after {content:"";position:absolute;inset:0;transform:translateX(-110%);background:linear-gradient(90deg,transparent,rgba(101,230,194,.16),transparent);animation:rs-loading-sweep 1.65s ease-in-out infinite;}
        .rs-loading-orbit {transform-origin:50% 50%;animation:rs-loading-spin 14s linear infinite;}
        .rs-loading-core {animation:rs-loading-pulse 2.2s ease-in-out infinite;}
        .rs-loading-progress {height:2px;width:38%;border-radius:99px;background:linear-gradient(90deg,transparent,#65e6c2,#f2b86b,transparent);box-shadow:0 0 16px rgba(101,230,194,.5);animation:rs-loading-progress 1.8s ease-in-out infinite;}
        @keyframes rs-loading-sweep {to{transform:translateX(110%)}}
        @keyframes rs-loading-spin {to{transform:rotate(360deg)}}
        @keyframes rs-loading-pulse {0%,100%{opacity:.55;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}
        @keyframes rs-loading-progress {0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}
        /* Astra light loading state: follow the active workspace theme. */
        html[data-theme="light"] .rs-loading-screen {
          color:#203a36!important;
          background:
            radial-gradient(ellipse at 76% 12%,rgba(35,174,145,.10),transparent 34%),
            radial-gradient(ellipse at 18% 85%,rgba(190,145,83,.08),transparent 30%),
            #f5f9f7!important;
        }
        html[data-theme="light"] .rs-loading-screen::before {
          opacity:.42;
          background-image:linear-gradient(rgba(22,139,120,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(22,139,120,.055) 1px,transparent 1px);
          mask-image:linear-gradient(to bottom,#000,transparent 92%);
        }
        html[data-theme="light"] .rs-loading-screen header {border-color:#dce9e5!important;}
        html[data-theme="light"] .rs-loading-screen header p:first-child {color:#173d36!important;}
        html[data-theme="light"] .rs-loading-screen header p:last-child,
        html[data-theme="light"] .rs-loading-screen .text-\\[\\#78928d\\] {color:#718780!important;}
        html[data-theme="light"] .rs-loading-screen .text-\\[\\#65e6c2\\] {color:#168b78!important;}
        html[data-theme="light"] .rs-loading-screen .text-\\[\\#f2b86b\\] {color:#a8793e!important;}
        html[data-theme="light"] .rs-loading-screen .rs-loading-shimmer {
          background:linear-gradient(110deg,#edf5f2 0%,#f8fcfa 48%,#edf5f2 100%)!important;
          border-color:#dce9e5!important;
        }
        html[data-theme="light"] .rs-loading-screen .rs-loading-shimmer::after {
          background:linear-gradient(90deg,transparent,rgba(35,174,145,.18),transparent);
        }
        html[data-theme="light"] .rs-loading-screen aside,
        html[data-theme="light"] .rs-loading-screen main > div,
        html[data-theme="light"] .rs-loading-screen main section > div {
          background:rgba(255,255,255,.88)!important;
          border-color:#dce9e5!important;
          box-shadow:0 8px 24px rgba(24,74,64,.045);
        }
        html[data-theme="light"] .rs-loading-screen .bg-\\[\\#142125\\] {background:#e5efeb!important;}
        html[data-theme="light"] .rs-loading-screen .rs-loading-progress {
          background:linear-gradient(90deg,transparent,#168b78,#d2a15e,transparent);
          box-shadow:0 0 14px rgba(22,139,120,.22);
        }
        html[data-theme="light"] .rs-loading-screen .border-\\[\\#65e6c2\\]\\/70 {
          border-color:#168b78!important;border-top-color:transparent!important;
        }
        @media(prefers-reduced-motion:reduce){.rs-loading-shimmer::after,.rs-loading-orbit,.rs-loading-core,.rs-loading-progress{animation:none!important}}
      `}</style>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1600px] flex-col">
        <header className="mb-7 flex items-center justify-between gap-4 border-b border-[#244442] pb-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-xl border border-[#65e6c2]/30 bg-[#fffaf4]"><img src="/images/logo.jpg" alt="Royal Skye" className="h-full w-full object-contain"/></div>
            <div><p className="text-xs font-black tracking-[.2em] text-[#e8f2ef]">ROYAL SKYE</p><p className="mt-1 text-[9px] tracking-[.2em] text-[#78928d]">OPERATIONS NETWORK</p></div>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-bold tracking-[.18em] text-[#65e6c2]"><span className="rs-loading-core h-2 w-2 rounded-full bg-[#65e6c2] shadow-[0_0_12px_#65e6c2]"/> SYSTEM INITIALIZING</div>
        </header>
        <div className="grid flex-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden rounded-2xl border border-[#244442] bg-[#0b1418]/90 p-5 lg:block">
            <SkeletonBlock className="mb-8 h-12 w-full"/>
            <div className="space-y-3">{Array.from({length:7},(_,i)=><SkeletonBlock key={i} className="h-10 w-full"/>)}</div>
            <div className="mt-14 space-y-3">{Array.from({length:3},(_,i)=><SkeletonBlock key={i} className="h-9 w-full"/>)}</div>
          </aside>
          <main className="min-w-0">
            <div className="mb-6 flex min-h-[76px] items-center justify-between rounded-2xl border border-[#244442] bg-[#0c171b]/90 px-5">
              <div className="space-y-2"><SkeletonBlock className="h-2.5 w-36"/><SkeletonBlock className="h-5 w-48"/></div><SkeletonBlock className="h-10 w-10 rounded-full"/>
            </div>
            <div className="mb-6 flex items-center justify-between gap-4"><div className="space-y-2"><SkeletonBlock className="h-7 w-52"/><SkeletonBlock className="h-3 w-72 max-w-[70vw]"/></div><SkeletonBlock className="h-10 w-28"/></div>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:8},(_,i)=><div key={i} className="rounded-2xl border border-[#244442] bg-[#0c171b]/90 p-5"><SkeletonBlock className="h-3 w-24"/><SkeletonBlock className="mt-5 h-8 w-32"/><SkeletonBlock className="mt-4 h-2.5 w-28"/></div>)}</section>
            <section className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><div className="rounded-2xl border border-[#244442] bg-[#0c171b]/90 p-5"><SkeletonBlock className="h-5 w-40"/><div className="mt-6 space-y-4">{Array.from({length:6},(_,i)=><SkeletonBlock key={i} className="h-10 w-full"/>)}</div></div><div className="rounded-2xl border border-[#244442] bg-[#0c171b]/90 p-5"><SkeletonBlock className="h-5 w-36"/><div className="mt-6 space-y-5">{Array.from({length:5},(_,i)=><SkeletonBlock key={i} className="h-12 w-full"/>)}</div></div></section>
          </main>
        </div>
        <div className="mt-7 overflow-hidden rounded-full bg-[#142125]"><div className="rs-loading-progress"/></div>
        <div className="mt-4 flex items-center justify-center gap-3 text-center text-[9px] font-bold tracking-[.24em] text-[#78928d]"><span className="rs-loading-orbit inline-block h-3 w-3 rounded-full border border-[#65e6c2]/70 border-t-transparent"/> PREPARING YOUR WORKSPACE <span className="text-[#f2b86b]">/</span> PLEASE WAIT</div>
      </div>
    </div>
  );
}
