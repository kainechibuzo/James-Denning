import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, CreditCard, FileText, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { C } from "../config/theme.js";

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

function Panel({ children, style = {} }) {
  return <section style={{
    background: "var(--jd-card)", border: "1px solid var(--jd-border)",
    borderRadius: 16, padding: 20, minWidth: 0, ...style,
  }}>{children}</section>;
}
function Status({ status }) {
  const label = ({ trialing: "Free trial", checkout_required: "Payment required", active: "Active",
    past_due: "Payment overdue", cancelled: "Cancelled", expired: "Expired", incomplete: "Incomplete" })[status] || "Not started";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 99,
    padding: "6px 10px", background: "var(--jd-soft)", border: "1px solid var(--jd-border)",
    color: "var(--jd-text)", fontSize: 12, fontWeight: 700 }}>
    <span style={{ width: 7, height: 7, borderRadius: 99, background: status === "active" ? "#65b98a" : "#a3a3a3" }}/>
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
  const user = ctx?.user;
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
      if (!result?.checkout_url || !result.checkout_url.startsWith("https://checkout.paystack.com/")) {
        throw new Error("The payment provider returned an invalid checkout URL");
      }
      window.location.assign(result.checkout_url);
    } catch (err) { setError(err?.message || "Could not start checkout"); setWorking(""); }
  };

  const invoices = snapshot?.invoices || [];
  const statusDescription = useMemo(() => {
    if (trialActive) return `Your free trial ends ${dateTime(subscription.trial_ends_at)}. No charge is made during the trial.`;
    if (status === "active") return `Your platform subscription renews monthly. Next billing date: ${dateTime(subscription?.current_period_end)}.`;
    if (checkoutDue) return "Your trial has ended or payment needs attention. Review the amount and continue through secure checkout when ready.";
    if (status === "cancelled") return `Your subscription is cancelled. No further automatic renewals are scheduled. The current paid period is recorded through ${dateTime(subscription?.current_period_end)}.`;
    return "Start with a 3-day trial. You will not be charged when the trial starts.";
  }, [trialActive, subscription, status, checkoutDue]);

  return <div style={{ maxWidth: 1120, margin: "0 auto", color: C.text }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <Wallet size={20} color={C.text}/>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: C.muted }}>WORKSPACE BILLING</span>
        </div>
        <h1 style={{ fontSize: 27, lineHeight: 1.2, margin: 0, fontWeight: 800 }}>Billing & subscription</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "7px 0 0" }}>{workspaceName}</p>
      </div>
      <button onClick={refresh} disabled={loading || Boolean(working)} style={{
        display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--jd-border)",
        background: "var(--jd-card)", color: C.text, borderRadius: 9, padding: "9px 12px",
        fontWeight: 700, cursor: "pointer", opacity: loading ? .6 : 1,
      }}><RefreshCw size={14}/> Refresh</button>
    </div>

    {error && <div role="alert" style={{ marginBottom: 14, padding: 12, borderRadius: 10,
      border: "1px solid #9a6666", color: C.text, background: "var(--jd-soft)", fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ marginBottom: 14, padding: 12, borderRadius: 10,
      border: "1px solid var(--jd-border)", color: C.text, background: "var(--jd-soft)", fontSize: 13 }}>{notice}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14, marginBottom: 14 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>CURRENT PLAN</span>
          <Status status={status}/>
        </div>
        <div style={{ fontSize: 32, fontWeight: 850, letterSpacing: "-.04em" }}>$19<span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>/month</span></div>
        <p style={{ color: C.muted, fontSize: 13, margin: "6px 0 18px" }}>James-Denning platform subscription</p>
        <div style={{ borderTop: "1px solid var(--jd-border)", paddingTop: 14, fontSize: 13, lineHeight: 1.7 }}>
          {statusDescription}
        </div>
        <div style={{ marginTop: 18 }}>
          {loading ? <span style={{ color: C.muted, fontSize: 12 }}>Loading subscription…</span> :
            !subscription ? <button onClick={startTrial} disabled={Boolean(working)} style={primaryButton}>
              {working === "trial" ? <LoaderCircle size={15}/> : <Clock3 size={15}/>} Start 3-day free trial
            </button> :
            trialActive ? <div style={{ color: C.muted, fontSize: 12 }}> <CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 5 }}/> Trial active · {remaining(subscription.trial_ends_at)}</div> :
            checkoutDue ? <button onClick={checkout} disabled={!checkoutEnabled || Boolean(working)} style={{ ...primaryButton, opacity: !checkoutEnabled ? .55 : 1 }}>
              {working === "checkout" ? <LoaderCircle size={15}/> : <CreditCard size={15}/>} Continue with Paystack
            </button> :
            status === "active" ? <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: C.muted, fontSize: 12 }}><ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: 5 }}/>Subscription confirmed</div>
              {subscription?.provider_subscription_code
                ? <button onClick={() => setConfirmCancel(true)} disabled={Boolean(working)} style={secondaryButton}>Cancel subscription</button>
                : <span style={{ color: C.muted, fontSize: 11 }}>Subscription management is still being linked.</span>}
            </div> : null}
          {checkoutDue && !checkoutEnabled && <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.5, margin: "9px 0 0" }}>Checkout remains disabled until recurring cancellation controls and provider configuration are verified. No payment will be taken here.</p>}
        </div>
      </Panel>

      <Panel>
        <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 15 }}>USAGE PRICING</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 29, fontWeight: 850 }}>$1</span>
          <span style={{ color: C.muted, fontSize: 13 }}>per active AI employee hour</span>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.65, color: C.muted, margin: "8px 0 16px" }}>
          Additional to the platform plan. Only measured active work is intended to count.
        </p>
        <div style={{ borderTop: "1px solid var(--jd-border)", paddingTop: 13, display: "grid", gap: 9, fontSize: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={14}/> Active work is the proposed billable unit</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={14}/> Idle, queued and approval-wait time excluded</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={14}/> Usage charging is not enabled yet</div>
        </div>
      </Panel>
    </div>

    {confirmCancel && <Panel style={{ marginBottom: 14, border: "1px solid #9a6666" }}>
      <strong style={{ fontSize: 14 }}>Cancel recurring subscription?</strong>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.65, margin: "8px 0 14px" }}>
        This asks Paystack to stop future automatic renewals. It does not refund previous payments.
        Your current paid period is recorded through {dateTime(subscription?.current_period_end)}.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={cancelSubscription} disabled={Boolean(working)} style={dangerButton}>
          {working === "cancel" ? <LoaderCircle size={14}/> : null} Confirm cancellation
        </button>
        <button onClick={() => setConfirmCancel(false)} disabled={Boolean(working)} style={secondaryButton}>Keep subscription</button>
      </div>
    </Panel>}

    <Panel style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <ShieldCheck size={17}/>
        <strong style={{ fontSize: 14 }}>Payment safety</strong>
      </div>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.7, margin: 0 }}>
        Checkout opens on Paystack. JD verifies the transaction server-to-server before marking the subscription active.
        Returning from checkout alone is not proof of payment. Employee usage charges, automatic debits during a trial,
        and invoice collection are not enabled in this release.
      </p>
    </Panel>

    <Panel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><FileText size={17}/><strong style={{ fontSize: 14 }}>Invoices & payment history</strong></div>
        <span style={{ color: C.muted, fontSize: 11 }}>{invoices.length} records</span>
      </div>
      {loading ? <div style={{ color: C.muted, fontSize: 12 }}>Loading invoices…</div> :
        invoices.length === 0 ? <div style={{ padding: "22px 10px", textAlign: "center", color: C.muted, fontSize: 12 }}>
          <FileText size={22} style={{ opacity: .5, marginBottom: 7 }}/>
          <div>No invoices yet</div>
          <div style={{ marginTop: 4 }}>Invoices will appear here once billing is issued.</div>
        </div> :
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 560 }}>
            <thead><tr style={{ color: C.muted, textAlign: "left" }}>
              {["Invoice","Date","Status","Total","Paid"].map(label => <th key={label} style={{ padding: "9px 8px", borderBottom: "1px solid var(--jd-border)", fontWeight: 700 }}>{label}</th>)}
            </tr></thead>
            <tbody>{invoices.map(invoice => <tr key={invoice.id}>
              <td style={cellStyle}>{invoice.invoice_number}</td>
              <td style={cellStyle}>{dateTime(invoice.issued_at || invoice.period_start)}</td>
              <td style={cellStyle}>{invoice.status}</td>
              <td style={cellStyle}>{money(invoice.total_minor, invoice.currency)}</td>
              <td style={cellStyle}>{money(invoice.paid_minor, invoice.currency)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      {lastUpdated && <div style={{ marginTop: 12, color: C.muted, fontSize: 10 }}>Updated {lastUpdated.toLocaleTimeString()}</div>}
    </Panel>
  </div>;
}

const primaryButton = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "11px 15px", border: "none", borderRadius: 9, background: "var(--jd-action)",
  color: "var(--jd-on-action)", fontWeight: 800, fontSize: 12, cursor: "pointer",
};
const secondaryButton = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "9px 12px", border: "1px solid var(--jd-border)", borderRadius: 9,
  background: "var(--jd-card)", color: "var(--jd-text)", fontWeight: 700, fontSize: 12, cursor: "pointer",
};
const dangerButton = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "9px 12px", border: "1px solid #9a6666", borderRadius: 9,
  background: "var(--jd-soft)", color: "var(--jd-text)", fontWeight: 800, fontSize: 12, cursor: "pointer",
};
const cellStyle = { padding: "11px 8px", borderBottom: "1px solid var(--jd-border)", color: "var(--jd-text)" };
