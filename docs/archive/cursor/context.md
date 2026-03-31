MTSS Behavior Log — Cursor Pro Handoff

**Current runtime:** Cloudflare (Worker + D1 + public/*). The following describes legacy Apps Script context only when it conflicts with the repo.

State: Post BUILD 1C.8 → Pre Performance Overhaul

Platform: Google Apps Script Web App

Status: Working baseline, ready for speed rebuild



🧠 Architecture Overview



Apps Script project (4 files only):



Code.gs



Index.html → Logger



Teacher.html → Dashboard



Store.html → School Store



Routing



BASE\_URL → Logger



?page=teacher → Dashboard



?page=store → Store



?reset=ADMIN\_KEY → clears device lock (client-side)



Spreadsheet



Uses existing sheet only



NO auto-creation allowed



Tabs expected:



Logs



StoreCatalog



StoreRedemptions



StudentAliases



Students



Staff



Settings



🔒 Locked Rules (Do Not Break)

Navigation rules



Logger page links → Dashboard + Store only



Store page links → Logger + Dashboard only



Dashboard links → Logger + Store only



No page links to itself



Columbia blue/white nav buttons



Single row nav



UI rules



Mobile-first



Font size range: 22–36



No 2-column layouts (except tables)



Dropdown contrast must always be readable



One-column layout overall



Sheet rules



Never auto-create sheets



Must use existing spreadsheet ID



StudentAliases tab name must match exactly



🔊 Audio Rule (Critical)



cha\_ching.mp3 must play:



On:



Log Positive



Redeem Nuggets



Requirements



Play immediately at tap



Not after server response



Must work on mobile



Uses:



data-URI first



URL fallback



🔐 Enrollment System



LocalStorage key:



MTSS\_TEACHER\_LOCK\_V2



Flow:



Select teacher



Enter enrollment password



Device locks permanently



Dashboard + Store trust lock



?reset=ADMIN\_KEY clears lock



Logger controls enrollment.



🧾 Current Capabilities

Logger



Log Positive / Concern



Pending logs when no student



Post-submit overlay



Instant cha-ching on positive



Enrollment handled here



Dashboard



Pending assignment



Edit logs



Delete logs



Teacher totals



Auto-open edit via ?edit=logId



Store



Redeem nuggets



Balance calculation



Leaderboard



Catalog stock tracking



Cha-ching on redeem



⚠️ Known Issues Before Overhaul



Some calls scan full sheets repeatedly



Bootstrap split across calls



Cache not used



Sound timing fixed but needs optimistic UI



Enrollment logic duplicated across pages



Occasional slow dashboard loads



🚀 NEXT BUILD: Performance Overhaul

Goals



“Raw hot nasty speed”



Implement



Single-call page bootstraps



CacheService everywhere reasonable



30–60s TTL caching



Cache invalidation on writes



Targeted range reads



Batch writes



Smaller payload responses



Lazy UI loading



Request sequencing guards



Optimistic UI for:



Log Positive



Redeem Nuggets



Must also fix



Enrollment system unified across pages



Reset flow hardened



Alias tab fallback detection



Dashboard returned in one call



Store returned in one call



🛠 What Cursor Should Do Next



When continuing:



Instruction for Cursor



Resume MTSS Behavior Log.

Apply performance overhaul:

\- CacheService

\- single-call bootstraps

\- targeted sheet reads

\- optimistic UI

\- immediate cha\_ching at tap

\- reset hardening



Do not change architecture.

When outputting for deployment, return whole files.



Then paste:



Code.gs



Index.html



Teacher.html



Store.html



📦 Mental Model



Think of this system as:



Logger = write



Dashboard = manage



Store = spend



Sheet = source of truth



Cache = speed layer



Everything else must stay stable.



🧭 Priority Order



Performance overhaul



Enrollment unification



Cache + batching



UI responsiveness



Admin page later



🧩 Future Features (Not Now)



Admin identity panel



Duplicate entry button



Alias manager UI



Store admin editor



Analytics



You are now ready to continue in Cursor Pro with zero lag.

