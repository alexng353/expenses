import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://expense:expense@localhost:5555/expense_tracker";
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const PASSWORD_HASH =
  "$2b$12$JxzebUGg7dRtzB6J/JQkMuwq3wBO21vNYd.UzePFculytoW7dAv/."; // password123

async function run() {
  console.log("Importing Frosh Budget 2026 CSV data...");

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
      passwordHash: PASSWORD_HASH,
    })
    .returning();

  const [michael] = await db
    .insert(schema.users)
    .values({
      email: "michael@sfu.ca",
      name: "Michael Ho",
      emailVerified: true,
      passwordHash: PASSWORD_HASH,
    })
    .returning();

  const [dina] = await db
    .insert(schema.users)
    .values({
      email: "dina@sfu.ca",
      name: "Dina Zeng",
      emailVerified: true,
      passwordHash: PASSWORD_HASH,
    })
    .returning();

  const [jason] = await db
    .insert(schema.users)
    .values({
      email: "jason@sfu.ca",
      name: "Jason He",
      emailVerified: true,
      passwordHash: PASSWORD_HASH,
    })
    .returning();

  const usersByName: Record<string, typeof alex> = {
    "Alexander Ng": alex,
    "Michael Ho": michael,
    "Dina Zeng": dina,
    "Jason He": jason,
  };

  // Event
  const [event] = await db
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
    { eventId: event.id, userId: alex.id, role: "super", canApprove: true },
    { eventId: event.id, userId: michael.id, role: "write", canApprove: false },
    { eventId: event.id, userId: dina.id, role: "write", canApprove: false },
    { eventId: event.id, userId: jason.id, role: "write", canApprove: false },
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
      .values({ eventId: event.id, name: bucketNames[i]!, sortOrder: i })
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
      .values({ eventId: event.id, name: categoryNames[i]!, sortOrder: i })
      .returning();
    categories[categoryNames[i]!] = c.id;
  }

  // Expenses from CSV
  const expenses: {
    date: string;
    name: string;
    amountCents: number;
    paidBy: string;
    notes: string | null;
    bucket: string;
  }[] = [
    { date: "2025-04-13", name: "Graphic Designer", amountCents: 35000, paidBy: "Dina Zeng", notes: "For Frosh Artwork: Banner & T-shirt", bucket: "general" },
    { date: "2025-07-12", name: "T-Shirts", amountCents: 119857, paidBy: "Dina Zeng", notes: "Alex paid with credit card; Dina E-Transferred Alex. Dina will receive grant money.", bucket: "general" },
    { date: "2025-07-13", name: "Pizza Hike", amountCents: 26000, paidBy: "Alexander Ng", notes: "Domino's bulk deal @$13 per extra large pizza", bucket: "hike" },
    { date: "2025-07-15", name: "Walmart tools for BBQ", amountCents: 10733, paidBy: "Michael Ho", notes: "Brush, Spray, degreaser, thermometer, dawn detergent", bucket: "bbq" },
    { date: "2025-07-22", name: "Banner", amountCents: 6216, paidBy: "Dina Zeng", notes: null, bucket: "info sesh" },
    // Skip DUPLICATE row
    { date: "2025-08-11", name: "Pens", amountCents: 805, paidBy: "Michael Ho", notes: "Pens for signing waivers", bucket: "general" },
    { date: "2025-08-19", name: "Birdies", amountCents: 2754, paidBy: "Alexander Ng", notes: "Badminton Birdies", bucket: "general" },
    { date: "2025-08-20", name: "Lays Chips", amountCents: 12595, paidBy: "Michael Ho", notes: "Lays chips from Costco", bucket: "bbq" },
    { date: "2025-08-21", name: "Amazon Cooler", amountCents: 16799, paidBy: "Michael Ho", notes: "Cooler", bucket: "general" },
    { date: "2025-08-21", name: "Wrist bands", amountCents: 1455, paidBy: "Michael Ho", notes: "Wrist bands", bucket: "general" },
    { date: "2025-08-21", name: "Amazon run 1", amountCents: 18174, paidBy: "Michael Ho", notes: "Fabric Markers, Name tags", bucket: "general" },
    { date: "2025-08-21", name: "Costco Run online", amountCents: 8576, paidBy: "Michael Ho", notes: "Rags, Gloves, Garbage bags, Cooking spray", bucket: "bbq" },
    { date: "2025-09-01", name: "T-Shirts", amountCents: 119857, paidBy: "Michael Ho", notes: "Alex paid initial deposit. Michael E-Transferred Alex. Michael will receive grant reimbursement.", bucket: "general" },
    { date: "2025-09-04", name: "Ice cream sandwiches and table for hike", amountCents: 30718, paidBy: "Michael Ho", notes: "Tables, ice cream sandwiches", bucket: "ice cream" },
    { date: "2025-09-04", name: "Costco Run for Hike Snacks + Ice Cream Social", amountCents: 19227, paidBy: "Michael Ho", notes: null, bucket: "hike" },
    { date: "2025-09-04", name: "Walmart (Ice Cream Cones and Scoopers)", amountCents: 5883, paidBy: "Michael Ho", notes: null, bucket: "ice cream" },
    { date: "2025-09-04", name: "Salad spinner for BBQ", amountCents: 2237, paidBy: "Michael Ho", notes: "Salad spinner", bucket: "bbq" },
    { date: "2025-09-08", name: "Dollar Tree Tablecloth for BBQ", amountCents: 1568, paidBy: "Alexander Ng", notes: "Tablecloths and Lasagna Pans", bucket: "bbq" },
    { date: "2025-09-08", name: "Pizza Hike Map/Instructions Printing", amountCents: 220, paidBy: "Alexander Ng", notes: null, bucket: "hike" },
    { date: "2025-09-08", name: "Home Depot (Sprayer + Steel Wool + Contractor Cleanup Bags)", amountCents: 4258, paidBy: "Alexander Ng", notes: null, bucket: "bbq" },
    { date: "2025-09-10", name: "Dollar Tree Lasagna Pan for BBQ", amountCents: 784, paidBy: "Alexander Ng", notes: "Lasagna Pan 2pks", bucket: "bbq" },
    { date: "2025-09-10", name: "RCSS BBQ supplies", amountCents: 9323, paidBy: "Alexander Ng", notes: "Reyn unblched pp, alcan foil, plastic wrap, cubed ice, zin/ss turner, EE SL Steel tngs", bucket: "bbq" },
    { date: "2025-09-10", name: "Lettuce, gluten-free buns for BBQ", amountCents: 2400, paidBy: "Alexander Ng", notes: "Lettuce, gluten-free hamburger buns", bucket: "bbq" },
    { date: "2025-09-10", name: "Drinks, cheese, pop, etc for BBQ", amountCents: 37639, paidBy: "Michael Ho", notes: "Iced tea, Crush, coke, coke zero, cheddar, mayo, beyond meat burgers, alcan foil, plates, pickles, onions, tomatoes, napkins", bucket: "bbq" },
    { date: "2025-09-10", name: "Ground beef for BBQ", amountCents: 36596, paidBy: "Michael Ho", notes: "Ground beef", bucket: "bbq" },
    { date: "2025-09-11", name: "Walmart timers for BBQ", amountCents: 2535, paidBy: "Alexander Ng", notes: "Timers from Walmart", bucket: "bbq" },
    { date: "2025-09-11", name: "Propane for BBQ", amountCents: 3837, paidBy: "Alexander Ng", notes: "Propane", bucket: "bbq" },
    { date: "2025-09-11", name: "Pamphlet Printing", amountCents: 10050, paidBy: "Michael Ho", notes: null, bucket: "general" },
    { date: "2025-09-11", name: "Spices for BBQ", amountCents: 3360, paidBy: "Michael Ho", notes: "Spice shaker, GS grnd tblspns", bucket: "bbq" },
    { date: "2025-09-11", name: "Hamburger buns and lettuce for BBQ", amountCents: 2993, paidBy: "Michael Ho", notes: "Joyce paid initially. Michael e-transferred Joyce. Michael will receive grant reimbursement.", bucket: "bbq" },
    { date: "2025-09-12", name: "DQ Sheet Cake for Madness", amountCents: 5899, paidBy: "Alexander Ng", notes: null, bucket: "mountain madness" },
    { date: "2025-09-12", name: "Midnight Madness Pizza", amountCents: 105602, paidBy: "Jason He", notes: null, bucket: "mountain madness" },
    { date: "2025-09-12", name: "CSSS Karaoke Machine", amountCents: 48273, paidBy: "Michael Ho", notes: null, bucket: "mountain madness" },
    { date: "2025-09-13", name: "One Night Werewolf", amountCents: 1649, paidBy: "Michael Ho", notes: null, bucket: "mountain madness" },
    { date: "2025-09-13", name: "Midnight Madness Breakfast", amountCents: 127075, paidBy: "Jason He", notes: null, bucket: "mountain madness" },
    { date: "2025-09-13", name: "2 Mahjong Sets + Tent", amountCents: 39754, paidBy: "Michael Ho", notes: null, bucket: "mountain madness" },
    { date: "2025-09-13", name: "Brita Filters", amountCents: 3357, paidBy: "Michael Ho", notes: null, bucket: "mountain madness" },
    { date: "2025-09-11", name: "London Drugs - additional timers for BBQ", amountCents: 1119, paidBy: "Alexander Ng", notes: "Additional timers from London Drugs because Walmart ran out of stock", bucket: "bbq" },
    { date: "2025-09-05", name: "Return Fees", amountCents: 5099, paidBy: "Michael Ho", notes: "Return Fees on Amazon", bucket: "general" },
  ];

  let count = 0;
  for (const e of expenses) {
    const paidByUser = usersByName[e.paidBy];
    if (!paidByUser) {
      console.error(`Unknown user: ${e.paidBy}`);
      continue;
    }

    await db.insert(schema.expenses).values({
      eventId: event.id,
      name: e.name,
      amountCents: e.amountCents,
      date: e.date,
      status: "paid",
      paidById: paidByUser.id,
      createdById: alex.id,
      bucketId: buckets[e.bucket] ?? null,
      notes: e.notes,
    });
    count++;
  }

  // Invite link
  await db.insert(schema.inviteLinks).values({
    token: "dev-invite-token",
    createdById: alex.id,
    defaultRole: "write",
    maxUses: 100,
  });

  // Verify totals
  const total = expenses.reduce((s, e) => s + e.amountCents, 0);

  console.log("Import complete.");
  console.log(`  Users: 4 (alex, michael, dina, jason — all password: password123)`);
  console.log(`  Event: Ducky Frosh 2025 (Grant Mode)`);
  console.log(`  Buckets: ${bucketNames.length}`);
  console.log(`  Expenses: ${count}`);
  console.log(`  Total: $${(total / 100).toFixed(2)}`);
  console.log(`  Expected: $8,902.76`);

  await client.end();
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
