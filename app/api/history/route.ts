import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ configured: false, rows: [] });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const { data, error } = await sb.from("analyses").select("*").eq("id", id).single();
    if (error) return NextResponse.json({ configured: true, error: error.message }, { status: 404 });
    return NextResponse.json({ configured: true, row: data });
  }

  const { data, error } = await sb
    .from("analyses")
    .select("id, created_at, supplier, invoice_number, declared_value, currency, overall_verdict")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ configured: true, error: error.message }, { status: 500 });
  return NextResponse.json({ configured: true, rows: data ?? [] });
}
