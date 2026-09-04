export interface PlatformKnowledgeSource {
  id: string;
  title: string;
  keywords: string[];
  content: string;
  verifiedAt: string;
}

// Read-only support knowledge distilled from the /platform and
// /staff-platform demo-account explorers. Keep the verification date visible
// so Leo never presents an old UI path as certain.
const PLATFORM_KNOWLEDGE: PlatformKnowledgeSource[] = [
  {
    id: "student-home",
    title: "Student Home and profile",
    keywords: [
      "home",
      "profile",
      "portfolio",
      "smart goal",
      "strength",
      "award",
      "certificate",
      "student work",
    ],
    content:
      "The student profile is the Home page; there is no separate Portfolio sidebar item. Home includes profile sections, Student work, SMART Goals, bookmarked careers, and My school list. Resume Status lives under Transition. Resume uploads happen from the relevant lesson page, not from a profile document-upload control.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "student-lessons",
    title: "Student lessons",
    keywords: ["lesson", "lessons", "curriculum", "assign", "assigned"],
    content:
      "Students open assigned curriculum from Lessons. If a lesson is unavailable, first verify that it has been assigned to the student and that the student is using the intended account. A staff member may need to correct the assignment; do not claim an account change has been made unless it was separately confirmed.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "careers",
    title: "Career Exploration",
    keywords: ["career", "careers", "bookmark", "industry", "salary"],
    content:
      "Career Exploration lets students search and filter careers, browse by industry, purpose, or lifestyle, view career details and salary ranges, bookmark careers, and see personalized recommendations. Students use Careers in the sidebar.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "schools",
    title: "School Exploration",
    keywords: [
      "school",
      "schools",
      "college",
      "program",
      "my list",
      "application",
      "roi",
      "net cost",
    ],
    content:
      "School Exploration supports search, school profiles, personalized fit indicators, ROI and cost information, My List, comparisons, and application-status tracking. Students can star up to three programs or majors at a school to add it to My List. Personalized cost uses the income bracket in Preferences.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "financing",
    title: "Financing and FAFSA",
    keywords: [
      "financing",
      "financial",
      "fafsa",
      "aid",
      "award letter",
      "scholarship",
    ],
    content:
      "Financing contains FAFSA status tracking and aid-offer upload/comparison. Willow does not have a scholarship-search page. Students can add an aid letter and confirm the extracted figures. Staff can see Student FAFSA and Parent FAFSA status for a 12th grader, but not the student's financial-aid figures or award-letter comparison.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "alma",
    title: "Alma",
    keywords: ["alma", "ai coach", "reflection", "history"],
    content:
      "Alma is a right-side chat panel, not a standalone page. Students can message Alma and open conversation history. Staff see an advising-oriented Alma panel that can answer questions about students and advising.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "feed",
    title: "Feed and announcements",
    keywords: ["feed", "announcement", "poll", "post"],
    content:
      "Students use Feed to see announcements, polls, and staff updates. Staff use Feed to create posts and manage All posts or My posts.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "staff-dashboard",
    title: "Staff dashboard and student records",
    keywords: [
      "staff",
      "teacher",
      "educator",
      "counselor",
      "roster",
      "student record",
      "dashboard",
    ],
    content:
      "The staff Home dashboard contains the student roster with search and Class, Grade, and Status filters. Its roster views are Overview, List Building, Applications, and Portfolio. Opening a student shows tabs including Overview, Profile, Purpose, Postsecondary Planning, Work, Notes, Meetings, and Applications. The staff demo has no Milestones, Financials, or Durable Skills dashboard tabs.",
    verifiedAt: "2026-08-17",
  },
  {
    id: "access",
    title: "Platform access troubleshooting",
    keywords: [
      "login",
      "log in",
      "sign in",
      "password",
      "access",
      "account",
      "can't open",
      "cannot open",
      "not showing",
    ],
    content:
      "For access problems, confirm the person is using the correct Willow account and role, identify the exact page or lesson they cannot open, and ask for the visible error message. Give navigation guidance only from verified paths. If an account or assignment must be changed, flag it for Jaime rather than claiming it was changed.",
    verifiedAt: "2026-08-17",
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9' ]/g, " ");
}

export function findPlatformKnowledge(
  text: string,
  limit = 3,
): PlatformKnowledgeSource[] {
  const haystack = normalize(text);
  return PLATFORM_KNOWLEDGE.map((source) => ({
    source,
    score: source.keywords.reduce(
      (total, keyword) => total + (haystack.includes(keyword) ? 1 : 0),
      0,
    ),
  }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ source }) => source);
}
