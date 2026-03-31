\# Lantern Development Workflow



This file explains how features should be implemented in the Lantern platform.



Cursor and developers must follow this workflow.





\## Core Rule



Never implement a feature across the entire stack in one step.



Large changes must be broken into phases.





\## Standard Implementation Order



All features should follow this order:



1\. Database migration

2\. Worker backend route

3\. API client wrapper

4\. Student UI

5\. Teacher moderation UI





\## Example Feature Implementation



Example: News submission system.



Step 1 — Database



Create migration for news table.



Step 2 — Backend



Add Worker route:



POST /api/news/create



Step 3 — API Client



Add wrapper in:



apps/lantern-app/js/lantern-api.js





Step 4 — Student UI



Add submission form to:



news.html





Step 5 — Teacher UI



Add moderation interface.





\## Scope Control



Cursor must never edit more than 3–5 files in a single pass.



If a task affects many files, Cursor must propose phases first.





\## Safety



Follow DEAD SIMPLE rule.



Follow FERPA safety rule.



Never expose sensitive student data publicly.



Do not refactor working systems without explicit instruction.





\## Platform Stability



The lantern-app is the production platform.



The sandbox-app is used for experiments.



Successful experiments may later move into lantern-app.

