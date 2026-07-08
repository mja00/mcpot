import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { connections, daemons, enrollmentTokens } from "./schema.ts";

// Zod schemas derived directly from the Drizzle tables — the single source of truth for DB-row
// shapes. Read APIs validate their output against these instead of hand-maintaining a parallel copy.
export const DaemonRow = createSelectSchema(daemons);
export const DaemonInsert = createInsertSchema(daemons);
export const ConnectionRow = createSelectSchema(connections);
export const ConnectionInsert = createInsertSchema(connections);
export const EnrollmentTokenRow = createSelectSchema(enrollmentTokens);
