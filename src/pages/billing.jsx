import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, CreditCard, FileText, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import "./billing.css";

const money = (minor, currency = "USD") => new Intl.NumberFormat("en-US", {
  style: "currency", currency, maximumFractionDigits: 2,
}).format((Number(minor) || 0) / 100);
const dateTime = (value) => value ? new Date(value).toLocaleString() : "—";
const remaining = (value) => {
  if (!value) return "";
  const ms = Math.max(0, Date.parse(value) - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `${days} day${days === 1 ? "" : "s"} remaining` : `${hours} hour${hours === 1 ? "" : "s"} remaining`;
};

function Status({ status }) {
  const label = ({ trialing: "Free trial", checkout_required: "Payment required", active: "Active",
    past_due: "Payment overdue", cancelled: "Cancelled", expired: "Expired", incomplete: "Incomplete" })[status] || "Not started";
  return <span className={`jd-billing-status status-${status || "not_started"}`}>
    <span className="jd-billing-status-dot"/>
    {label}
  </span>;
}

export function BillingPage({ ctx }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const workspaceName = ctx?.selectedSchool?.name || "Your organisation";

  const call = useCallback(async (body) => {
    const { data, error: invokeError } = await supabase.functions.invoke("jd-billing", { body });
    if (invokeError) {
      let message = invokeError.message || "Billing request failed";
      try {
        const payload = await invokeError.context?.json?.();
        if (payload?.error) message = payload.error;
      } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await call({ action: "billing.snapshot" });
      setSnapshot(result);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || "Could not load billing details");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("billing") !== "paystack" || !reference) return;
    let active = true;
    setWorking("verify"); setNotice("Confirming your payment with Paystack…"); setError("");
    call({ action: "billing.checkout.verify", reference })
      .then(result => {
        if (!active) return;
        setNotice(result.verified ? "Payment verified. Your subscription is active." : "Payment is not yet confirmed.");
        const url = new URL(window.location.href);
        url.searchParams.delete("billing"); url.searchParams.delete("reference"); url.searchParams.delete("trxref");
        window.history.replaceState({}, "", url.toString());
        return refresh();
      })
      .catch(err => { if (active) setError(err?.message || "Payment verification failed"); })
      .finally(() => { if (active) setWorking(""); });
    return () => { active = false; };
  }, [call, refresh]);

  const subscription = snapshot?.subscription;
  const status = subscription?.effective_status || subscription?.status || "not_started";
  const trialActive = status === "trialing" && subscription?.trial_ends_at && Date.parse(subscription.trial_ends_at) > Date.now();
  const checkoutDue = ["checkout_required", "expired", "past_due", "incomplete"].includes(status) ||
    (status === "trialing" && subscription?.trial_ends_at && Date.parse(subscription.trial_ends_at) <= Date.now());
  const checkoutEnabled = Boolean(snapshot?.checkout_enabled);

  const startTrial = async () => {
    setWorking("trial"); setError(""); setNotice("");
    try {
      await call({ action: "billing.trial.start", requestId: crypto.randomUUID() });
      setNotice("Your 3-day trial has started. No payment has been taken.");
      await refresh();
    } catch (err) { setError(err?.message || "Could not start the trial"); }
    finally { setWorking(""); }
  };

  const managePaymentMethod = async () => {
    setWorking("manage"); setError(""); setNotice("");
    try {
      const result = await call({ action: "billing.subscription.manage_link" });
      if (!result?.url || !result.url.startsWith("https://paystack.com/manage/subscriptions/")) {
        throw new Error("Paystack returned an invalid payment-method management link");
      }
      window.location.assign(result.url);
    } catch (err) { setError(err?.message || "Could not open payment-method management"); setWorking(""); }
  };

  const cancelSubscription = async () => {
    setWorking("cancel"); setError(""); setNotice("");
    try {
      const result = await call({ action: "billing.subscription.cancel" });
      setNotice(result?.cancelled
        ? `Subscription cancelled. No further automatic renewals are scheduled. Current paid period ends ${dateTime(result.current_period_end)}.`
        : "Cancellation status is being reconciled.");
      setConfirmCancel(false);
      await refresh();
    } catch (err) { setError(err?.message || "Could not cancel the subscription"); }
    finally { setWorking(""); }
  };

  const checkout = async () => {
    setWorking("checkout"); setError(""); setNotice("");
    try {
      const result = await call({ action: "billing.checkout.create", requestId: crypto.randomUUID() });
      if (result?.verified && result?.status === "succeeded") {
        setNotice("Your previous payment was already completed and has now been verified.");
        await refresh();
        return;
      }
      if (!result?.checkout_url || !result.checkout_url.startsWith("https://checkout.paystack.com/")) {
        throw new Error("The payment provider returned an invalid checkout URL");
      }
      window.location.assign(result.checkout_url);
    } catch (err) { setError(err?.message || "Could not start checkout"); setWorking(""); }
  };

  const invoices = snapshot?.invoices || [];
  const statusDescription = useMemo(() => {
    if (trialActive) return `Your free trial ends ${dateTime(subscription.trial_ends_at)}. No charge is made during the trial.`;
    if (status === "cancelled") return `Your subscription has ended. No further automatic renewals are scheduled. The last paid period ended ${dateTime(subscription?.current_period_end)}.`;
    if (subscription?.cancel_at_period_end) return status === "past_due"
      ? `Automatic renewal is off, but this workspace still has a past-due balance. The recorded paid period ends ${dateTime(subscription?.current_period_end)}.`
      : `Automatic renewal is off. Your current paid period ends ${dateTime(subscription?.current_period_end)}.`;
    if (status === "active") return `Your platform subscription renews monthly. Next billing date: ${dateTime(subscription?.current_period_end)}.`;
    if (checkoutDue) return "Your trial has ended or payment needs attention. Review the amount and continue through secure checkout when ready.";
    return "Start with a 3-day trial. You will not be charged when the trial starts.";
  }, [trialActive, subscription, status, checkoutDue]);

  const periodEnd = subscription?.current_period_end;
  const planAmount = subscription?.amount_minor ?? 1900;
  const currency = subscription?.currency || "USD";

  return <main className="jd-billing-page">
    <header className="jd-billing-header">
      <div className="jd-billing-heading">
        <div className="jd-billing-eyebrow"><Wallet size={15}/> JAMES-DENNING / FINANCE</div>
        <h1>Billing <span>& subscriptions</span></h1>
        <p>Manage your plan, payment details and workspace invoices in one place.</p>
        <div className="jd-billing-workspace"><span className="jd-billing-workspace-dot"/>{workspaceName}</div>
      </div>
      <button className="jd-billing-refresh" onClick={refresh} disabled={loading || Boolean(working)}>
        {loading ? <LoaderCircle size={15} className="jd-billing-spin"/> : <RefreshCw size={15}/>} Refresh
      </button>
    </header>

    {error && <div className="jd-billing-alert" role="alert"><span>{error}</span><button onClick={()=>setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="jd-billing-notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss notice">×</button></div>}

    <nav className="jd-billing-tabs" aria-label="Billing sections">
      <button className={activeTab === "overview" ? "active" : ""} onClick={()=>setActiveTab("overview")}>Overview</button>
      <button className={activeTab === "invoices" ? "active" : ""} onClick={()=>setActiveTab("invoices")}>Invoices & history <span>{invoices.length}</span></button>
    </nav>

    {activeTab === "overview" ? <>
      <section className="jd-billing-hero">
        <div className="jd-billing-plan-card">
          <div className="jd-billing-plan-top">
            <span className="jd-billing-kicker">YOUR CURRENT PLAN</span>
            <Status status={status}/>
          </div>
          <div className="jd-billing-plan-name">James-Denning <span>Workspace</span></div>
          <div className="jd-billing-price">{money(planAmount, currency)}<span> / month</span></div>
          <p className="jd-billing-plan-copy">{statusDescription}</p>
          <div className="jd-billing-plan-bottom">
            <div className="jd-billing-renewal">
              <CalendarDays size={15}/>
              <span>{trialActive ? `Trial ends ${dateTime(subscription.trial_ends_at)}` : periodEnd ? `Current period ends ${dateTime(periodEnd)}` : "No billing date scheduled"}</span>
            </div>
            {loading ? <span className="jd-billing-muted">Loading…</span> :
              !subscription ? <button className="jd-billing-primary" onClick={startTrial} disabled={Boolean(working)}>
                {working === "trial" ? <LoaderCircle size={15} className="jd-billing-spin"/> : <Sparkles size={15}/>} Start 3-day free trial <ArrowUpRight size={15}/>
              </button> :
              trialActive ? <span className="jd-billing-trial-live"><CheckCircle2 size={15}/> Trial active · {remaining(subscription.trial_ends_at)}</span> :
              checkoutDue ? <button className="jd-billing-primary" onClick={checkout} disabled={!checkoutEnabled || Boolean(working)} title={!checkoutEnabled ? "Checkout is not enabled yet" : "Continue to secure Paystack checkout"}>
                {working === "checkout" ? <LoaderCircle size={15} className="jd-billing-spin"/> : <CreditCard size={15}/>} Continue with Paystack <ArrowUpRight size={15}/>
              </button> :
              <div className="jd-billing-plan-actions">
                {["active","past_due"].includes(status) && subscription?.provider_subscription_code && !subscription?.cancel_at_period_end ? <>
                  <button className="jd-billing-secondary" onClick={managePaymentMethod} disabled={Boolean(working)}>{working === "manage" ? <LoaderCircle size={14} className="jd-billing-spin"/> : <CreditCard size={14}/>} Update payment method</button>
                  <button className="jd-billing-text-button" onClick={()=>setConfirmCancel(true)} disabled={Boolean(working)}>Cancel subscription</button>
                </> : null}
              </div>}
          </div>
          {checkoutDue && !checkoutEnabled && <div className="jd-billing-gate-note">Secure checkout is currently being prepared. No payment can be taken until provider configuration and release checks are complete.</div>}
        </div>

        <div className="jd-billing-usage-card">
          <div className="jd-billing-usage-icon"><Sparkles size={18}/></div>
          <div className="jd-billing-kicker">AI EMPLOYEE USAGE</div>
          <div className="jd-billing-usage-price">$1 <span>/ active hour</span></div>
          <p>One simple rate for each AI employee while actively working on approved tasks.</p>
          <div className="jd-billing-usage-rules">
            <div><CheckCircle2 size={14}/> Active work only</div>
            <div><CheckCircle2 size={14}/> Idle and queued time excluded</div>
            <div><ShieldCheck size={14}/> Usage billing not yet enabled</div>
          </div>
          <div className="jd-billing-usage-foot">You will see usage charges here before collection is enabled.</div>
        </div>
      </section>

      <section className="jd-billing-detail-grid">
        <article className="jd-billing-detail-card">
          <div className="jd-billing-detail-icon"><ShieldCheck size={17}/></div>
          <div><h3>Protected payments</h3><p>Every payment is verified directly with Paystack before JD updates your subscription. A browser redirect is never treated as proof of payment.</p></div>
        </article>
        <article className="jd-billing-detail-card">
          <div className="jd-billing-detail-icon"><Clock3 size={17}/></div>
          <div><h3>Transparent billing</h3><p>Your platform subscription is separate from proposed AI employee usage. Idle, queued and approval-wait periods are excluded from usage pricing.</p></div>
        </article>
      </section>

      {confirmCancel && <section className="jd-billing-cancel-panel">
        <div><strong>Cancel recurring subscription?</strong><p>This asks Paystack to stop future automatic renewals. It does not refund previous payments. Your current paid period is recorded through {dateTime(subscription?.current_period_end)}.</p></div>
        <div className="jd-billing-cancel-actions">
          <button className="jd-billing-danger" onClick={cancelSubscription} disabled={Boolean(working)}>{working === "cancel" ? <LoaderCircle size={14} className="jd-billing-spin"/> : null} Confirm cancellation</button>
          <button className="jd-billing-secondary" onClick={()=>setConfirmCancel(false)} disabled={Boolean(working)}>Keep subscription</button>
        </div>
      </section>}
    </> : <section className="jd-billing-invoices">
      <div className="jd-billing-invoices-head">
        <div><div className="jd-billing-kicker">YOUR RECORDS</div><h2>Invoices & payment history</h2><p>Workspace billing documents and payment records.</p></div>
        <span className="jd-billing-record-count">{invoices.length} records</span>
      </div>
      {loading ? <div className="jd-billing-empty"><LoaderCircle size={20} className="jd-billing-spin"/> Loading billing records…</div> :
        invoices.length === 0 ? <div className="jd-billing-empty"><FileText size={24}/><strong>No invoices yet</strong><span>Invoices will appear here once billing is issued for this workspace.</span></div> :
        <div className="jd-billing-table-wrap"><table className="jd-billing-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th><th>Paid</th></tr></thead>
          <tbody>{invoices.map(invoice=><tr key={invoice.id}>
            <td><strong>{invoice.invoice_number}</strong></td>
            <td>{dateTime(invoice.issued_at || invoice.period_start)}</td>
            <td><span className={`jd-billing-invoice-status status-${invoice.status}`}>{invoice.status}</span></td>
            <td>{money(invoice.total_minor, invoice.currency)}</td>
            <td>{money(invoice.paid_minor, invoice.currency)}</td>
          </tr>)}</tbody>
        </table></div>}
      <div className="jd-billing-record-foot">Payment collection and invoice issuance remain subject to workspace billing configuration.</div>
    </section>}

    <footer className="jd-billing-footer">
      <span><ShieldCheck size={14}/> Secure billing powered by Paystack</span>
      {lastUpdated && <span>Last updated {lastUpdated.toLocaleTimeString()}</span>}
    </footer>
  </main>;
}

