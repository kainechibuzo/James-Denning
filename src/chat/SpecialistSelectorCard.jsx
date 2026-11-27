import React, { useState } from "react";
import { Box, Check, Clock3, Code2, Info, Star, UserCheck, Users } from "lucide-react";
import {
  SPECIALISTS,
  formatSingleAgentEstimate,
  recommendSpecialistTeams,
} from "./agent-recommendations.mjs";

export function SpecialistSelectorCard({
  item,
  recommendation,
  duration = 1800,
  onDurationChange,
  proposal,
  onRequestQuote,
  onDecideProposal,
  onLaunchApproved,
  onCoordinateTeam,
  onDismiss,
  disabled = false,
}) {
  const teams = recommendSpecialistTeams(recommendation?.task || "", recommendation?.id);
  const initialTeamId = teams.find((t) => t.recommended)?.id || teams[0]?.id;
  const [selectedMode, setSelectedMode] = useState("single"); // "team" | "single"
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);
  const [selectedAgentId, setSelectedAgentId] = useState(recommendation?.id || "software_engineer");

  const activeTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];
  const activeAgent = SPECIALISTS.find((a) => a.id === selectedAgentId) || SPECIALISTS[0];
  const singleEstimate = formatSingleAgentEstimate(duration);

  const blockedAttempt = item?.toolEvents?.some((event) => event.name === "delegate_to_specialist_agent");

  const handleRequestQuote = () => {
    if (selectedMode === "team") return;
    const targetId = activeAgent.id;
    const targetSpec = SPECIALISTS.find((s) => s.id === targetId) || activeAgent;
    onRequestQuote?.({
      id: targetSpec.id,
      name: targetSpec.name,
      task: String(recommendation?.task || "").slice(0, 1200),
    });
  };

  return (
    <section className="jd-specialist-hub" aria-label="JD specialist recommendation">
      <div className="jd-specialist-callout">
        <p>
          {blockedAttempt
            ? "JD paused the specialist delegation because explicit approval was not recorded yet. Review a specialist team or single agent below to verify its time and cost estimate before anything runs."
            : "Choose a single specialist for a verified quote. Team cards are planning previews only until each member has a separate approved quote and execution path."}
        </p>
      </div>

      <div className="jd-specialist-section-head">
        <span className="jd-specialist-section-icon" aria-hidden="true">
          <Users size={16} />
        </span>
        <div>
          <h3>Recommended Specialist Teams</h3>
          <p>Select a pre-assembled team or customise your approach:</p>
        </div>
      </div>

      <div className="jd-specialist-team-list" role="radiogroup" aria-label="Recommended Specialist Teams">
        {teams.map((team) => {
          const isSelected = selectedMode === "team" && selectedTeamId === team.id;
          return (
            <label
              key={team.id}
              className={"jd-specialist-team-card" + (isSelected ? " is-selected" : "")}
            >
              <input
                type="radio"
                name={`jd-specialist-mode-${item.id}`}
                checked={isSelected}
                disabled={disabled}
                onChange={() => {
                  setSelectedMode("team");
                  setSelectedTeamId(team.id);
                }}
              />
              <div className="jd-specialist-team-top">
                <span className="jd-specialist-radio-dot" aria-hidden="true" />
                <span className="jd-specialist-letter-badge" aria-hidden="true">
                  {team.letter}
                </span>
                <div className="jd-specialist-team-heading">
                  <div className="jd-specialist-team-title-row">
                    <strong>{team.title}</strong>
                    {team.recommended && (
                      <span className="jd-specialist-rec-pill">
                        <Star size={11} aria-hidden="true" /> Recommended
                      </span>
                    )}
                  </div>
                  <div className="jd-specialist-team-subrow">
                    <span>{team.agentCount}-agent team</span>
                    <span className="jd-specialist-rate">{team.rateLabel}</span>
                  </div>
                </div>
              </div>

              <ul className="jd-specialist-deliverables">
                {team.deliverables.map((line) => (
                  <li key={line}>
                    <Check size={13} aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="jd-specialist-estimates">
                <span>
                  <Clock3 size={13} aria-hidden="true" /> Est. time: {team.estTimeLabel}
                </span>
                <span>
                  <Box size={13} aria-hidden="true" /> Cost: {team.estCostLabel}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      <div className="jd-specialist-single-wrap">
        <div className="jd-specialist-section-head is-compact">
          <span className="jd-specialist-section-icon" aria-hidden="true">
            <UserCheck size={15} />
          </span>
          <div>
            <h3>Or use a single agent</h3>
          </div>
        </div>

        <div
          className={"jd-specialist-single-card" + (selectedMode === "single" ? " is-selected" : "")}
          onClick={() => {
            if (!disabled && selectedMode !== "single") setSelectedMode("single");
          }}
        >
          <div className="jd-specialist-single-top">
            <label className="jd-specialist-single-radio">
              <input
                type="radio"
                name={`jd-specialist-mode-${item.id}`}
                checked={selectedMode === "single"}
                disabled={disabled}
                onChange={() => setSelectedMode("single")}
              />
              <span className="jd-specialist-radio-dot" aria-hidden="true" />
              <span>Use one agent:</span>
            </label>
          </div>

          <div className="jd-specialist-single-controls">
            <label className="jd-specialist-select-wrap">
              <Code2 size={15} aria-hidden="true" />
              <select
                aria-label="Choose single specialist agent"
                value={selectedAgentId}
                disabled={disabled}
                onChange={(event) => {
                  setSelectedMode("single");
                  setSelectedAgentId(event.target.value);
                }}
              >
                {SPECIALISTS.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.displayLabel} ({agent.name})
                  </option>
                ))}
              </select>
            </label>

            <label className="jd-agent-duration">
              <span>Time allocation</span>
              <select
                aria-label="Time allocation"
                value={duration}
                disabled={disabled}
                onChange={(event) => onDurationChange?.(Number(event.target.value))}
              >
                <option value={900}>15 minutes</option>
                <option value={1800}>30 minutes</option>
                <option value={3600}>1 hour</option>
                <option value={7200}>2 hours</option>
              </select>
            </label>
          </div>

          <div className="jd-specialist-single-meta">
            <strong className="jd-specialist-rate">{singleEstimate.rateLabel}</strong>
            <div className="jd-specialist-estimates">
              <span>
                <Clock3 size={13} aria-hidden="true" /> Est. time: {singleEstimate.estTimeLabel}
              </span>
              <span>
                <Box size={13} aria-hidden="true" /> {singleEstimate.estCostLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="jd-specialist-info-banner">
        <Info size={15} aria-hidden="true" />
        <p>
          The displayed single-agent figure is only an indicative default. The server-generated quote is authoritative and may differ by workspace. Team cards are planning-only; JD will not present one lead-agent quote as approval for an entire team.
        </p>
      </div>

      {selectedMode === "team" && !proposal && <p className="jd-specialist-status" role="status">Planning only: this does not approve or start the team. Choose a single specialist to request an executable quote.</p>}

      {!proposal && (
        <div className="jd-agent-recommendation-actions jd-specialist-actions">
          {selectedMode === "team" && onCoordinateTeam && (
            <button
              type="button"
              className="jd-specialist-secondary-btn"
              disabled={disabled}
              onClick={() => onCoordinateTeam(activeTeam)}
            >
              Create a planning outline with {activeTeam.title}
            </button>
          )}
          <button
            type="button"
            className="jd-specialist-primary-btn"
            disabled={disabled || selectedMode === "team"}
            onClick={handleRequestQuote}
          >
            {selectedMode === "team" ? "Team quotes are not available yet" : "Check verified price and request approval"}
          </button>
          <button
            type="button"
            className="jd-specialist-ghost-btn"
            disabled={disabled}
            onClick={onDismiss}
          >
            No, continue without agent
          </button>
        </div>
      )}

      {proposal?.loading && <p className="jd-specialist-status" role="status">Verifying subscription, rate and spend limit…</p>}
      {proposal?.error && !proposal?.proposal_id && <p className="jd-response-error" role="alert">{proposal.error}</p>}

      {proposal?.proposal_id && (
        <div className="jd-agent-quote">
          <strong>Server-verified specialist quote</strong>
          <div>Rate: {(proposal.rate_minor_per_hour / 100).toFixed(2)} {proposal.currency}/hour</div>
          <div>Allocated time: {Math.round(proposal.allocated_seconds / 60)} minutes</div>
          <div>Estimated amount for this allocation: {(proposal.estimated_amount_minor / 100).toFixed(2)} {proposal.currency}</div>
          <div>Spend cap: {Math.round(proposal.spend_cap_seconds / 60)} minutes</div>
          <div>Subscription: {proposal.subscription_status}</div>
          {proposal.status === "quote_only" && (
            <div role="status">
              Estimate only — not authorised to run.{" "}
              {({
                subscription_required: "An eligible subscription is required.",
                subscription_expired: "The subscription or trial has expired.",
                subscription_not_eligible: "The subscription is not eligible.",
                workspace_time_ceiling_exceeded: "This allocation exceeds the workspace time ceiling.",
                workspace_time_capacity_unavailable: "The workspace time allocation is currently reserved.",
              })[proposal.authorization_block_reason] || "Execution prerequisites are not met."}{" "}
              You can review this estimate, but JD will not reserve time or start the specialist.
            </div>
          )}
          <div>This quote applies only to {String(proposal.role || "the selected specialist").replaceAll("_", " ")}. Payment collection is disabled; this is not a charge.</div>
          {proposal.status === "awaiting_approval" && (
            <div className="jd-agent-recommendation-actions">
              <button
                type="button"
                disabled={proposal.decisionLoading}
                onClick={() => onDecideProposal?.(proposal, "approve")}
              >
                Yes, approve and run
              </button>
              <button
                type="button"
                disabled={proposal.decisionLoading}
                onClick={() => onDecideProposal?.(proposal, "decline")}
              >
                No, decline
              </button>
            </div>
          )}
          {proposal.status === "approved" && (
            <div className="jd-agent-recommendation-actions">
              <button
                type="button"
                disabled={proposal.launching}
                onClick={() => onLaunchApproved?.(proposal)}
              >
                {proposal.launching ? "Queueing approved agent…" : "Run approved agent"}
              </button>
            </div>
          )}
          {proposal.status === "submitted" && <p role="status">Approval confirmed and the specialist assignment was submitted to JD.</p>}
          {proposal.error && <p className="jd-response-error" role="alert">{proposal.error}</p>}
          {proposal.status === "declined" && <p role="status">Declined. No agent was started.</p>}
        </div>
      )}
    </section>
  );
}
