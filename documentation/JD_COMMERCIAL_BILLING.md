# James-Denning commercial billing — implementation contract

## Product policy

- Platform subscription: **USD 19 per organisation per month**.
- Trial: **3 days**, starting when an organisation's owner begins the trial.
- Employee usage: additional to the platform subscription, proposed at **USD 1 per active billable hour per employee**.
- Only trusted, reconciled `active` intervals can become usage invoice lines. Queued, idle, paused, approval-wait and external-provider/tool-wait intervals are excluded.
- Budgets and spending caps must be tenant-configured before billable work can start. JD cannot authorise its own spending or create a billable employee from a recommendation.
- No customer is charged by a redirect, frontend state, model output or an unverified webhook.
- Billing must be idempotent, tenant-scoped, auditable and reconciled against provider transactions. Refunds, credits, disputes and failed-payment policy need explicit implementation before usage charging is enabled.

## Current implementation in this branch

1. `src/config/billing.mjs` centralises the current commercial defaults and keeps all live billing switches off.
2. `jd_billing_subscriptions` stores one tenant subscription state, including trial, provider and period metadata.
3. `jd_billing_invoices` and `jd_billing_invoice_lines` provide an idempotent invoice/line foundation. A usage line requires a source job and is unique per tenant/job.
4. `jd_billing_payments` stores server-verified Paystack references; provider references are unique.
5. `jd_billing_webhook_receipts` stores payload hashes and idempotency state, not raw payment payloads.
6. `jd_billing_events` is append-only. Billing tables are RLS-enabled and unavailable to browser roles; the service role is the only data-plane principal.

The migration is schema groundwork only. It does not initialise Paystack checkout, create provider plans, issue invoices, create a subscription, charge a card, or enable employee usage billing.

## Paystack integration requirements

- Secret keys stay in Supabase Edge Function secrets; never in `VITE_*` or browser storage.
- Checkout is created server-side for the authenticated organisation owner. The server derives tenant and actor from the verified JWT, not request JSON.
- The server creates a unique reference and stores a pending payment attempt before returning the hosted checkout URL.
- A browser callback is only a navigation event. The backend must verify the transaction directly with Paystack, compare exact amount/currency/reference/tenant and only then transition the subscription/payment state.
- Verify webhook HMAC signatures against the raw request body, persist a unique receipt before processing, and make event processing replay-safe.
- Paystack documents card and (in Nigeria) direct-debit subscription channels. Its subscription docs state that failed subscription charges are not retried; JD therefore needs its own past-due handling and owner-visible recovery state.
- The 3-day trial is represented internally first. Do not create a recurring subscription until a usable payment authorisation has been obtained with clear customer consent. Trial expiry should move the tenant to `checkout_required` rather than silently charging a customer.
- Confirm that the merchant account and Paystack plan support USD for the target customer before enabling live checkout. Do not silently convert the configured USD prices to NGN.

## Employee usage billing requirements

The existing `jd_usage_*` records are shadow accounting only. They contain conservative server observations, not a commercially accepted employee-time measure or payable invoice data. In particular, subject references are not verified hired-employee identities.

Before creating employee-usage invoice lines:

1. Link each execution to an actual tenant employee/agent hire record with a stable, verified identity.
2. Finalise the definition of billable active time and the treatment of model/tool compute, retries, failures, cancellation and clock uncertainty.
3. Reconcile the complete tenant usage ledger and reject unbalanced or uncertain periods.
4. Convert microdollars to USD cents once at invoice aggregation, with documented rounding and adjustment rules.
5. Enforce a tenant spending cap before work is reserved and stop new billable work at the cap.
6. Give owners a live estimate, itemised invoice preview, spending limit, pause control and dispute/reconciliation path.
7. Require explicit owner enablement before any actual charge.

## Delivery sequence

- [x] Commercial defaults and release switches.
- [x] Tenant-scoped schema for subscription, invoice, payment, webhook and audit records.
- [ ] Paystack checkout initialisation and transaction verification.
- [ ] Signed webhook ingestion with replay/idempotency tests.
- [ ] 3-day trial lifecycle and owner billing settings UI.
- [ ] Invoice generation and immutable invoice-line snapshots.
- [ ] Employee identity linkage and accepted active-time policy.
- [ ] Usage budgets, hard caps, invoice preview and collection.
- [ ] Past-due, cancellation, refund, dispute and reconciliation workflows.
- [ ] Authenticated end-to-end tests and owner acceptance before production enablement.

## Provider references

- [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Paystack recurring payments](https://paystack.com/docs/v2/payments/recurring)
