import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://expense:expense@localhost:5555/expense_tracker";
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding database...");

  // Clean existing data
  await db.execute(sql`
    TRUNCATE TABLE audit_log, expense_receipts, expenses,
      grant_categories, event_members, event_buckets, events,
      invite_links, email_codes, sessions, users
    CASCADE
  `);

  // Users
  const [alex] = await db
    .insert(schema.users)
    .values({
      email: "alex@sfu.ca",
      name: "Alexander Ng",
      emailVerified: true,
      isSuper: true,
      passwordHash: "$2b$12$JxzebUGg7dRtzB6J/JQkMuwq3wBO21vNYd.UzePFculytoW7dAv/.", // password123
    })
    .returning();

  const [michael] = await db
    .insert(schema.users)
    .values({
      email: "michael@sfu.ca",
      name: "Michael Ho",
      emailVerified: true,
    })
    .returning();

  const [dina] = await db
    .insert(schema.users)
    .values({
      email: "dina@sfu.ca",
      name: "Dina Zeng",
      emailVerified: true,
    })
    .returning();

  // Event: Ducky Frosh 2025
  const [frosh] = await db
    .insert(schema.events)
    .values({
      name: "Ducky Frosh 2025",
      description: "CSSS Frosh Week 2025",
      grantMode: true,
      createdById: alex.id,
    })
    .returning();

  // Members
  await db.insert(schema.eventMembers).values([
    { eventId: frosh.id, userId: alex.id, role: "super", canApprove: true },
    { eventId: frosh.id, userId: michael.id, role: "write", canApprove: false },
    { eventId: frosh.id, userId: dina.id, role: "write", canApprove: false },
  ]);

  // Buckets
  const bucketNames = [
    "general",
    "ice cream",
    "hike",
    "info sesh",
    "bbq",
    "mountain madness",
  ];
  const buckets: Record<string, string> = {};
  for (let i = 0; i < bucketNames.length; i++) {
    const [b] = await db
      .insert(schema.eventBuckets)
      .values({ eventId: frosh.id, name: bucketNames[i]!, sortOrder: i })
      .returning();
    buckets[bucketNames[i]!] = b.id;
  }

  // Grant Categories
  const categoryNames = [
    "FOOD EXPENSES",
    "EVENT SPECIFIC SUPPLIES",
    "GENERAL SUPPLIES",
    "BANNERS, FLYERS, BOOKLETS",
    "FROSH TSHIRT/HOODIE",
    "FROSH GENERAL / ART & DESIGN",
  ];
  const categories: Record<string, string> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const [c] = await db
      .insert(schema.grantCategories)
      .values({ eventId: frosh.id, name: categoryNames[i]!, sortOrder: i })
      .returning();
    categories[categoryNames[i]!] = c.id;
  }

  // Expenses (subset of the Frosh Budget spreadsheet)
  const expenseData = [
    {
      name: "Graphic Designer",
      amountCents: 35000,
      date: "2025-04-13",
      place: "ARTIST GRAPHIC DESIGN COMMISSION",
      status: "paid" as const,
      paidBy: dina,
      bucket: "general",
      category: "FROSH GENERAL / ART & DESIGN",
      subLabel: null,
      motion: 22,
      notes: "For Frosh Artwork: Banner & T-shirt",
    },
    {
      name: "T-Shirts",
      amountCents: 119857,
      date: "2025-07-12",
      place: "COWICHAN SOUVENIR CO.",
      status: "paid" as const,
      paidBy: dina,
      bucket: "general",
      category: "FROSH TSHIRT/HOODIE",
      subLabel: null,
      motion: 23,
      notes: "Alex paid with credit card; Dina E-Transferred Alex. Dina will receive grant money.",
    },
    {
      name: "Pizza Hike",
      amountCents: 26000,
      date: "2025-07-13",
      place: "DOMINO'S PIZZA",
      status: "paid" as const,
      paidBy: alex,
      bucket: "hike",
      category: "FOOD EXPENSES",
      subLabel: null,
      motion: 24,
      notes: "Domino's bulk deal @$13 per extra large pizza",
    },
    {
      name: "Walmart tools for BBQ",
      amountCents: 10733,
      date: "2025-07-15",
      place: "WALMART",
      status: "paid" as const,
      paidBy: michael,
      bucket: "bbq",
      category: "EVENT SPECIFIC SUPPLIES",
      subLabel: "BBQ",
      motion: 25,
      notes: "Brush, Spray, degreaser, thermometer, dawn detergent",
    },
    {
      name: "Banner",
      amountCents: 6216,
      date: "2025-07-22",
      place: "ODDBALL WORKSHOP CLOTHING",
      status: "paid" as const,
      paidBy: dina,
      bucket: "general",
      category: "BANNERS, FLYERS, BOOKLETS",
      subLabel: null,
      motion: 26,
      notes: "Notes",
    },
    {
      name: "Pens",
      amountCents: 805,
      date: "2025-08-11",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: michael,
      bucket: "general",
      category: "GENERAL SUPPLIES",
      subLabel: "Pens",
      motion: 27,
      notes: "Pens for signing waivers",
    },
    {
      name: "Birdies",
      amountCents: 2754,
      date: "2025-08-19",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: alex,
      bucket: "general",
      category: "EVENT SPECIFIC SUPPLIES",
      subLabel: "badminton",
      motion: 28,
      notes: "Badminton Birdies",
    },
    {
      name: "Lays Chips",
      amountCents: 12595,
      date: "2025-08-20",
      place: "COSTCO",
      status: "paid" as const,
      paidBy: michael,
      bucket: "bbq",
      category: "FOOD EXPENSES",
      subLabel: "BBQ",
      motion: 29,
      notes: "Lays chips from Costco",
    },
    {
      name: "Amazon Cooler",
      amountCents: 16799,
      date: "2025-08-21",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: michael,
      bucket: "general",
      category: "GENERAL SUPPLIES",
      subLabel: "Cooler",
      motion: 30,
      notes: "Cooler",
    },
    {
      name: "Karaoke Machine",
      amountCents: 48273,
      date: "2025-09-12",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: michael,
      bucket: "mountain madness",
      category: "EVENT SPECIFIC SUPPLIES",
      subLabel: "MIDNIGHT MADNESS",
      motion: 52,
      notes: null,
    },
  ];

  for (const e of expenseData) {
    await db.insert(schema.expenses).values({
      eventId: frosh.id,
      name: e.name,
      amountCents: e.amountCents,
      date: e.date,
      placeOfPurchase: e.place,
      status: e.status,
      paidById: e.paidBy.id,
      createdById: alex.id,
      bucketId: buckets[e.bucket],
      notes: e.notes,
      motionNumber: e.motion,
      grantCategoryId: categories[e.category],
      grantSubLabel: e.subLabel,
    });
  }

  // Invite link
  await db.insert(schema.inviteLinks).values({
    token: "dev-invite-token",
    createdById: alex.id,
    defaultRole: "write",
    maxUses: 100,
  });

  console.log("Seed complete.");
  console.log(`  Users: 3`);
  console.log(`  Events: 1 (Ducky Frosh 2025, Grant Mode)`);
  console.log(`  Buckets: ${bucketNames.length}`);
  console.log(`  Grant Categories: ${categoryNames.length}`);
  console.log(`  Expenses: ${expenseData.length}`);
  console.log(`  Invite link token: dev-invite-token`);

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
