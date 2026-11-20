# James-Denning commercial billing

## Product policy

- Platform subscription: **USD 19 per workspace per month**.
- Trial: **3 days**, started once by a workspace owner/admin. Starting the trial does not take a payment.
- Employee usage: proposed additive price of **USD 1 per active billable hour per employee**.
- Queued, idle, paused, approval-wait and external-provider/tool-wait intervals are excluded.
- Budgets and spending caps must be tenant-configured before billable employee work can start. JD cannot authorise its own spending or create a billable employee from a recommendation.
- No customer is charged by a browser redirect, frontend state, model output or an unverified webhook.
- Billing must remain tenant-scoped, idempotent and auditable. Refunds, credits, disputes, failed-renewal recovery and reconciliation need explicit implementation before usage charging is enabled.

## Implemented on the billing feature branch

1. `src/config/billing.mjs` centralises the USD 19/month plan, 3-day trial and proposed USD 1/active employee-hour price.
2. The owner/admin Billing workspace page displays subscription state, trial status, usage pricing, invoice/payment history and payment-management controls.
3. `jd_billing_subscriptions`, `jd_billing_invoices`, `jd_billing_invoice_lines`, `jd_billing_payments`, `jd_billing_webhook_receipts` and append-only `jd_billing_events` provide tenant-scoped billing storage. Browser roles have no direct table access; RLS is enabled.
4. `jd-billing` verifies the signed-in user and derives workspace/actor identity from the authenticated profile. It supports one-time trial start, billing snapshots, server-side checkout initialisation, server-to-server transaction verification, subscription management links and owner/admin cancellation.
5. Checkout verifies the configured Paystack plan's exact amount, currency and monthly interval before use. A pending payment reference is persisted before a hosted checkout URL is returned.
6. A successful payment is verified directly with Paystack and finalised atomically across payment, subscription, invoice and audit state. A browser return is never payment proof.
7. `jd-paystack-webhook` verifies the timestamped `Paystack-Signature` against the exact raw request bytes, supports the legacy `X-Paystack-Signature` during migration, stores idempotent webhook receipts, and verifies successful transactions with Paystack before finalisation.
8. Subscription cancellation is only recorded locally after Paystack confirms that future renewals have been disabled. The paid period is preserved.

## Release gates — intentionally off

The code defaults all client release switches to false. Server checkout additionally requires explicit configuration of:

- `JD_BILLING_CHECKOUT_ENABLED=true`
- `JD_BILLING_CANCEL_FLOW_ENABLED=true`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PLATFORM_PLAN_CODE`
- `PAYSTACK_WEBHOOK_SECRET` for the timestamped webhook signature mode
- `JD_APP_URL` using HTTPS

The Paystack plan must already exist and match USD 19 monthly. Do not silently convert the configured USD price to NGN. Paystack documents USD payments as supported in Nigeria; the merchant account and plan still need to be configured and verified in the correct test/live environment.

Employee usage charging, invoice issuance as a standalone billing process, and automatic employee-hour collection remain disabled. A paid platform invoice is currently generated only as part of verified payment finalisation.

## Not production-ready yet

- Run authenticated Paystack **test-mode** end-to-end checks for checkout, success, failure, abandonment, duplicate webhooks, delayed webhooks, subscription creation, renewal, cancellation and payment-method management.
- Reconcile stale pending checkout attempts so abandoned/expired links cannot block a workspace indefinitely.
- Complete failed-renewal recovery, past-due policy, refunds, credits, disputes and provider reconciliation.
- Link each execution to an actual tenant employee/agent hire record with a stable verified identity.
- Finalise the billable active-time policy, including retries, failures, cancellation and clock uncertainty.
- Reconcile the complete tenant usage ledger; convert microdollars to USD cents once at invoice aggregation with documented rounding/adjustment rules.
- Enforce tenant spending caps before work is reserved; stop new billable work at the cap.
- Give owners live estimates, itemised invoice previews, spending limits, pause controls and a dispute/reconciliation path.
- Complete authenticated end-to-end acceptance before enabling live collection.

## Production boundary

The billing migrations and Edge Functions on this branch are **not applied/deployed to production**. No Paystack customer, plan, subscription or charge is created by merging the code. Do not enable live checkout until the test-mode workflow and release gates above are verified.

## Provider references

- [Paystack webhooks and signature verification](https://paystack.com/docs/payments/webhooks/)
- [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Paystack supported currencies](https://paystack.com/docs/v2/api/supported-currencies)
