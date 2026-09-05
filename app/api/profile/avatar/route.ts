import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

/**
 * POST /api/profile/avatar
 * Uploads a profile photo to Supabase Storage and saves the path.
 * Accepts multipart/form-data with a "file" field.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type and size (max 2MB)
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP and GIF images are allowed." }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 2MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Save path to profiles table
  await supabase
    .from("profiles")
    .upsert({ user_id: user.id, photo_path: path, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

  return NextResponse.json({ photoUrl: urlData.publicUrl, path });
}
