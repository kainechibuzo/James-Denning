import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!anonKey || !serviceKey) throw new Error("Supabase server configuration missing");
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: studentProfile } = await supabase.from("student_profiles").select("student_id").eq("profile_id", authData.user.id).maybeSingle();
    if (!studentProfile?.student_id) return new Response(JSON.stringify({ error: "A linked student account is required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { reference, bill_id, student_id } = await req.json();
    if (typeof reference !== "string" || !reference.trim() || !bill_id || student_id !== studentProfile.student_id) {
      return new Response(JSON.stringify({ error: "Invalid payment details for this signed-in student" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!reference || !bill_id || !student_id) {
      return new Response(JSON.stringify({ error: "Missing required fields: reference, bill_id, student_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) {
      return new Response(JSON.stringify({ error: "Paystack secret key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Verify transaction with Paystack API ────────────────────────────
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== "success" || verifyData.data?.currency !== "NGN") {
      return new Response(JSON.stringify({ error: "Payment not successful", detail: verifyData.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paidAmountKobo = verifyData.data.amount; // Paystack returns amount in kobo
    const paidAmountNaira = paidAmountKobo / 100;

    // ── 2. Connect to Supabase with service role (bypasses RLS) ───────────
    // Authenticated student identity was verified above; privileged writes stay server-side.

    // ── 3. Guard: check this reference hasn't already been recorded ───────
    const { data: existing } = await supabase
      .from("fee_payments")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "This payment reference has already been recorded." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Fetch fresh bill from DB ────────────────────────────────────────
    const { data: bill, error: billFetchErr } = await supabase
      .from("fee_bills")
      .select("*")
      .eq("id", bill_id)
      .eq("student_id", student_id)
      .eq("school_id", (await supabase.from("profiles").select("school_id").eq("id", authData.user.id).single()).data?.school_id)
      .single();

    if (billFetchErr || !bill) {
      return new Response(JSON.stringify({ error: "Bill not found or does not belong to this student" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Guard: paid amount must be > 0 and must not exceed outstanding balance ──
    const balance = Math.round((+(bill.total_amount) - +(bill.amount_paid)) * 100) / 100;
    if (paidAmountNaira <= 0) {
      return new Response(JSON.stringify({ error: "Invalid payment amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (paidAmountNaira > balance) {
      // Allow ₦1 tolerance for rounding; reject clear overpayments
      return new Response(JSON.stringify({
        error: `Overpayment: Paystack recorded ₦${paidAmountNaira}, but outstanding balance is only ₦${balance}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 6. Insert payment record ───────────────────────────────────────────
    const { data: payment, error: payInsertErr } = await supabase
      .from("fee_payments")
      .insert({
        bill_id,
        student_id,
        amount: paidAmountNaira,
        payment_method: "paystack",
        paystack_reference: reference,
        payment_date: new Date().toISOString(),
        school_id: bill.school_id,
      })
      .select()
      .single();

    if (payInsertErr) {
      return new Response(JSON.stringify({ error: `Failed to record payment: ${payInsertErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 7. Update bill totals ──────────────────────────────────────────────
    const newPaid = Math.round((+(bill.amount_paid) + paidAmountNaira) * 100) / 100;
    const newStatus = newPaid >= +(bill.total_amount) ? "paid" : "partial";
    const { data: updatedBill, error: billUpdateErr } = await supabase
      .from("fee_bills")
      .update({ amount_paid: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", bill_id)
      .eq("school_id", bill.school_id)
      .eq("amount_paid", bill.amount_paid)
      .select("id")
      .maybeSingle();
    if (!billUpdateErr && !updatedBill) {
      await supabase.from("fee_payments").delete().eq("id", payment.id);
      return new Response(JSON.stringify({ error: "Bill changed during verification; retry the payment verification" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (billUpdateErr) {
      // Rollback: delete the payment we just inserted
      await supabase.from("fee_payments").delete().eq("id", payment.id);
      return new Response(JSON.stringify({ error: `Bill update failed and payment was rolled back: ${billUpdateErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 8. Audit log ───────────────────────────────────────────────────────
    await supabase.from("fee_audit_log").insert({
      bill_id,
      student_id,
      school_id: bill.school_id,
      action: "payment_recorded",
      amount: paidAmountNaira,
      performed_by: "paystack",
      details: { method: "paystack", reference, new_paid: newPaid, new_status: newStatus },
    });

    return new Response(JSON.stringify({ success: true, amount: paidAmountNaira, new_status: newStatus }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Unexpected error: ${err.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
