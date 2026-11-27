# Royal Skye feature-parity and production-readiness audit

This is an implementation checklist, not a claim that every feature is already production-ready. The comparison uses the public Restronp feature catalogue and the current Royal Skye repository documentation. Implement equivalent capabilities independently; do not copy proprietary source code, artwork, text, or branding.

Reference catalogue:
- https://www.restronp.com/features
- https://www.restronp.com/

## Existing capabilities documented in Royal Skye

| Area | Current repository capability | Release note |
|---|---|---|
| Dashboard | Sales, expenses, estimated profit, table occupancy, credit and date-based views | Verify figures against source ledgers |
| Menu | Categories, item creation/editing, availability, search and PDF menu | Add-on/modifier support needs a separate audit |
| Tables | Floors, table states, dine-in order entry | Verify transfer/merge/split workflows |
| POS and billing | Dine-in, takeaway, delivery service details, discounts, partial/split payments, receipts | Hardware and busy-shift tests required |
| Kitchen workflow | KOT routing and order fulfilment status | Verify station routing and print recovery |
| Customers | Customer records, purchase history, credit ledger, repayments and loyalty | Preferences/allergy fields need review |
| Reservations | Reservation records and table assignment | Overbooking and schedule UX tests required |
| Staff | Role-based accounts, attendance and payroll | Test every role on a real staff account |
| Inventory | Stock items, categories, recipes, movements, low-stock and expiry tracking | Verify recipe deduction and adjustment audit |
| Finance | Expenses, supplier ledger, cash drawer, sales register and reports | Reconcile each payment channel against bills |
| Administration | Tax/receipt settings, backup and restore, audit trail | Restore only in isolated test environments |

## Feature gaps to verify or build

These items are not confirmed as complete by the current documented feature set. Audit the code and implement only where the capability is genuinely missing.

- [ ] Menu modifiers, add-ons, variants and special preparation notes.
- [ ] Waiter/customer service requests with assignment, status and response-time history.
- [ ] Customer-facing QR menu with table-bound ordering and manager/cashier approval.
- [ ] Delivery dispatch workspace, rider assignment, delivery zones and handoff tracking.
- [ ] Customer-facing ordering site and reservation request flow.
- [ ] Multi-branch isolation, branch-specific bill numbering, staff access and consolidated reporting.
- [ ] Offline-safe order capture and deterministic sync after connectivity returns.
- [ ] Printer/device configuration, automatic KOT/BOT/receipt routing and failed-print recovery.
- [ ] Customer preferences and allergy notes with appropriate access controls.
- [ ] Dynamic QR/payment-provider integrations and automated payment confirmation where supported.
- [ ] Nepal tax compliance/IRD or CBMS integration only after requirements and provider access are verified.

## Operator-first navigation decisions

- Cashier: Overview, Tables & Orders, Checkout and Customer Credit.
- Manager: daily operations, menu, customers, inventory, expenses, cash drawer, reservations and authorized backup/restore.
- Admin: all manager functions plus staff accounts, attendance, payroll, sales register, reports, supplier ledger, audit, loyalty, account and business settings.
- Every major destination must have one direct route. Avoid a sidebar item opening a second navigation panel that then opens a third.
- Keep destructive and financial corrections behind explicit permissions and audit logging.

## Data safety and release gates

1. No production database reset, table drop, sales deletion or replacement database.
2. Use additive, reversible migrations only; review every migration before deployment.
3. Keep the existing production database and production services untouched during this rebuild.
4. Test restore against an isolated database or browser-only demo data, never against live sales.
5. Require backend tests, frontend typecheck/build, Docker builds and smoke tests to pass.
6. Verify admin, manager, cashier, waiter and kitchen/bar access with separate test accounts.
7. Reconcile cash, QR, card/bank and credit totals before any pilot.
8. Run a seven-day staff acceptance trial only after the isolated build passes and a verified backup exists.
9. Promote to production only after explicit acceptance and a tested rollback plan.

## Current implementation scope

The first rebuild slice introduces direct role-specific routes, removes duplicate in-page navigation on standalone destinations, tightens role fallback checks, and limits logout cleanup to authentication keys. It does not yet implement every gap listed above and is not approved for production use.
