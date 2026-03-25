import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabaseUrl = "https://wsxgofbgpptlfxtcqnlx.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzeGdvZmJncHB0bGZ4dGNxbmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMTAwNjQsImV4cCI6MjA4MjY4NjA2NH0.p-Xat0v_DomiSIGIzzyhW4WBP7Gf0rquDSyva-76LTw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const seedData = JSON.parse(
  readFileSync("curriculum_seed_data.json", "utf-8"),
);

console.log(`Seeding ${seedData.length} curriculum lessons...`);

// Insert in batches of 50
const batchSize = 50;
let inserted = 0;

for (let i = 0; i < seedData.length; i += batchSize) {
  const batch = seedData.slice(i, i + batchSize).map((lesson) => ({
    grade: lesson.grade,
    format: lesson.format,
    unit_name: lesson.unit_name,
    unit_number: lesson.unit_number,
    phase_name: lesson.phase_name,
    lesson_number: lesson.lesson_number,
    title: lesson.title,
    description: lesson.description,
    durable_skill: lesson.durable_skill,
    student_work_product: lesson.student_work_product,
    platform_action: lesson.platform_action,
    alma_integration: lesson.alma_integration,
    status: lesson.status,
    display_order: lesson.display_order,
  }));

  const { error } = await supabase.from("curriculum_lessons").insert(batch);

  if (error) {
    console.error(`Error inserting batch starting at ${i}:`, error.message);
    process.exit(1);
  }

  inserted += batch.length;
  console.log(`  Inserted ${inserted}/${seedData.length}`);
}

console.log("Done! All curriculum lessons seeded.");
