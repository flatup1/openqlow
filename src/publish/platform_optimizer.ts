import type { PublishDestination } from "./publisher_types.js";

interface OptimizeInput {
  body: string;
  destinations: PublishDestination[];
}

interface OptimizedPost {
  text: string;
  hashtags: string[];
}

type OptimizedPosts = Partial<Record<PublishDestination, OptimizedPost>>;

function extractHashtags(text: string): string[] {
  return [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
}

function removeHashtags(text: string): string {
  return text.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/[ \t]+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function ensureFlatupHashtag(tags: string[]): string[] {
  if (tags.includes("#FLATUPGYM")) return tags;
  return ["#FLATUPGYM", ...tags];
}

function optimizeThreads(body: string): OptimizedPost {
  const tags = ensureFlatupHashtag(extractHashtags(body)).slice(0, 1);
  const base = removeHashtags(body);
  return {
    text: truncate([base, tags.join(" ")].filter(Boolean).join("\n"), 500),
    hashtags: tags,
  };
}

function optimizeGoogleBusiness(body: string): OptimizedPost {
  const base = removeHashtags(body);
  const text = [
    base,
    "",
    "成田で初心者にもやさしい格闘技ジムをお探しの方へ。",
    "FLATUP GYMは、無理なく一歩ずつ強くなる場所です。",
  ].join("\n").trim();
  return {
    text: truncate(text, 1500),
    hashtags: [],
  };
}

function optimizeLineVoom(body: string): OptimizedPost {
  const tags = ensureFlatupHashtag(extractHashtags(body)).slice(0, 5);
  const base = removeHashtags(body);
  return {
    text: truncate([base, tags.join(" ")].filter(Boolean).join("\n\n"), 10000),
    hashtags: tags,
  };
}

export function optimizePostForDestinations(input: OptimizeInput): OptimizedPosts {
  const output: OptimizedPosts = {};
  for (const destination of input.destinations) {
    if (destination === "threads") output.threads = optimizeThreads(input.body);
    if (destination === "google_business") output.google_business = optimizeGoogleBusiness(input.body);
    if (destination === "line_voom") output.line_voom = optimizeLineVoom(input.body);
  }
  return output;
}
