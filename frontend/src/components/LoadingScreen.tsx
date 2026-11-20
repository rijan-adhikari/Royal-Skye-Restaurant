import React from "react";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-[#eee9e3] rounded-xl ${className}`} />;
}

export default function LoadingScreen() {
  return (
    <div role="status" aria-label="Loading Royal Skye workspace" className="min-h-screen bg-[#f5f3f0] p-4 text-[#302722] md:p-7">
      <div className="mx-auto grid max-w-[1600px] gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden min-h-[88vh] rounded-[26px] bg-[#211d1b] p-5 lg:block">
          <div className="mb-10 flex items-center gap-3"><SkeletonBlock className="h-12 w-12 rounded-xl !bg-white/10"/><div className="flex-1 space-y-2"><SkeletonBlock className="h-3 w-28 !bg-white/10"/><SkeletonBlock className="h-2 w-20 !bg-white/10"/></div></div>
          <SkeletonBlock className="mb-7 h-14 w-full !bg-white/[.07]"/>
          <div className="space-y-3">{Array.from({length:6},(_,i)=><SkeletonBlock key={i} className="h-10 w-full !bg-white/[.07]"/>)}</div>
          <div className="mt-16 space-y-3">{Array.from({length:3},(_,i)=><SkeletonBlock key={i} className="h-10 w-full !bg-white/[.07]"/>)}</div>
        </aside>
        <main className="min-w-0">
          <header className="mb-6 flex h-[76px] items-center justify-between rounded-2xl border border-[#e8e1da] bg-white/80 px-5">
            <div className="space-y-2"><SkeletonBlock className="h-2.5 w-36"/><SkeletonBlock className="h-5 w-48"/></div><SkeletonBlock className="h-10 w-10 rounded-full"/>
          </header>
          <div className="mb-6 flex items-center justify-between"><div className="space-y-2"><SkeletonBlock className="h-7 w-52"/><SkeletonBlock className="h-3 w-72 max-w-[70vw]"/></div><SkeletonBlock className="h-10 w-28"/></div>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:8},(_,i)=><div key={i} className="rounded-2xl border border-[#e8e1da] bg-white p-5"><SkeletonBlock className="h-3 w-24"/><SkeletonBlock className="mt-5 h-8 w-32"/><SkeletonBlock className="mt-4 h-2.5 w-28"/></div>)}</section>
          <section className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><div className="rounded-2xl border border-[#e8e1da] bg-white p-5"><SkeletonBlock className="h-5 w-40"/><div className="mt-6 space-y-4">{Array.from({length:6},(_,i)=><SkeletonBlock key={i} className="h-10 w-full"/>)}</div></div><div className="rounded-2xl border border-[#e8e1da] bg-white p-5"><SkeletonBlock className="h-5 w-36"/><div className="mt-6 space-y-5">{Array.from({length:5},(_,i)=><SkeletonBlock key={i} className="h-12 w-full"/>)}</div></div></section>
          <p className="mt-7 text-center text-[10px] font-bold tracking-[.2em] text-[#a18d7c]">PREPARING YOUR WORKSPACE</p>
        </main>
      </div>
    </div>
  );
}
