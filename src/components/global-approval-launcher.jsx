import React, { useEffect, useRef, useState } from "react";
import { Shield } from "lucide-react";
import { ReviewCentre } from "../chat/ReviewCentre.jsx";
import { supabase } from "../supabaseClient.js";

// The workspace-wide Review Centre launcher.
//
// This owns every piece of state the launcher needs: the pending-approval count
// shown as a badge, the ids dismissed in this session, whether the panel is
// open, and the polling effect that keeps the badge truthful. Keeping the state
// and the markup in one component is deliberate — the header markup in
// AppDemo.jsx is also lifted verbatim into the Reference layout fixture, so a
// launcher that read `pendingApprovalCount` from AppInner's scope rendered as
// `pendingApprovalCount is not defined` and took the whole shell down. Here the
// header only has to render a component whose props are optional.
//
// Approval is not execution: the panel reads records, a decision is explicit,
// and nothing is auto-approved. Polling is read-only and stops on unmount.
export function GlobalApprovalLauncher({ user, client = supabase, onClose, onDecision } = {}) {
  const [show, setShow] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingIds, setPendingIds] = useState([]);
  const dismissed = useRef(new Set());

  const actorId = user?._authUserId || user?.id;
  const role = user?.role;
  const canReview = role === "owner" || role === "admin";

  useEffect(() => {
    dismissed.current = new Set();
    setPendingCount(0);
    setPendingIds([]);
    setShow(false);
    if (!client?.functions?.invoke || !actorId || !canReview) return;
    let alive = true;
    const check = async () => {
      try {
        const { data, error } = await client.functions.invoke("jd-automation", {
          body: { action: "approvals.list" },
        });
        if (!alive || error || data?.error || !Array.isArray(data?.approvals)) return;
        const pending = data.approvals.filter((item) => item?.status === "pending");
        setPendingCount(pending.length);
        setPendingIds(pending.map((item) => item.id));
        if (pending.some((item) => !dismissed.current.has(item.id))) setShow(true);
      } catch {
        // A failed read must never open the panel or invent a count.
      }
    };
    void check();
    const timer = window.setInterval(check, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [client, actorId, role, canReview]);

  const close = () => {
    pendingIds.forEach((id) => dismissed.current.add(id));
    setShow(false);
    onClose?.();
  };

  return (
    <>
      <button
        type="button"
        data-tour="review-centre"
        onClick={() => setShow(true)}
        aria-label={pendingCount ? pendingCount + " pending approvals" : "Open Review Centre"}
        title="Review Centre"
        style={{
          position: "relative",
          border: 0,
          background: "transparent",
          color: "var(--jd-ink)",
          padding: 8,
          cursor: "pointer",
        }}
      >
        <Shield size={19} />
        {pendingCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 1,
              right: 0,
              minWidth: 16,
              height: 16,
              borderRadius: 10,
              background: "var(--jd-ink)",
              color: "var(--jd-paper)",
              fontSize: 10,
              lineHeight: "16px",
              textAlign: "center",
              padding: "0 3px",
            }}
          >
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </button>
      {show && (
        <ReviewCentre
          client={client}
          onClose={close}
          onDecision={(decision, item, data, note) => {
            dismissed.current = new Set();
            if (client?.functions?.invoke) {
              client.functions
                .invoke("jd-automation", { body: { action: "approvals.list" } })
                .then(({ data: next }) => {
                  setPendingCount((next?.approvals || []).filter((row) => row.status === "pending").length);
                })
                .catch(() => {});
            }
            onDecision?.(decision, item, data, note);
          }}
        />
      )}
    </>
  );
}
