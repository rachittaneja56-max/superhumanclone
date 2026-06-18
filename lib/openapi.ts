type Method = "get" | "post";

type Schema = Record<string, unknown>;

type OpenApiOperation = {
  summary: string;
  description?: string;
  tags: string[];
  operationId: string;
  parameters?: Array<{
    name: string;
    in: "query" | "path";
    required?: boolean;
    description?: string;
    schema: Schema;
    example?: unknown;
  }>;
  requestBody?: {
    required?: boolean;
    content: {
      "application/json": {
        schema: Schema;
        example?: unknown;
      };
    };
  };
  responses: Record<string, {
    description: string;
    content?: {
      "application/json": {
        schema: Schema;
        example?: unknown;
      };
    };
  }>;
  security?: Array<Record<string, string[]>>;
  "x-auth"?: "public" | "authenticated" | "admin";
  "x-hitl"?: boolean;
  "x-write"?: boolean;
};

type OpenApiSpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description?: string }>;
  tags: Array<{ name: string; description?: string }>;
  components: {
    securitySchemes: {
      bearerAuth: { type: string; scheme: string; bearerFormat?: string };
    };
  };
  paths: Record<string, Partial<Record<Method, OpenApiOperation>>>;
};

const zodString = { type: "string" };
const zodBoolean = { type: "boolean" };
const zodInteger = { type: "integer" };
const zodNumber = { type: "number" };
const zodDateTime = { type: "string", format: "date-time" };
const zodEmail = { type: "string", format: "email" };

const commonErrors = {
  "401": { description: "Unauthorized" },
  "403": { description: "Forbidden" },
  "404": { description: "Not found" },
  "409": { description: "Conflict" },
  "412": { description: "Precondition failed" },
  "429": { description: "Too many requests" },
  "500": { description: "Internal server error" },
};

function op(operation: OpenApiOperation): OpenApiOperation {
  return operation;
}

export const openApiSpec: OpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Aethra API",
    version: "1.0.0",
    description: "Generated from the current Next.js route handlers and tRPC routers in the codebase.",
  },
  servers: [
    { url: "/", description: "Current deployment" },
  ],
  tags: [
    { name: "Auth" },
    { name: "Inbox" },
    { name: "Calendar" },
    { name: "Agent" },
    { name: "Search" },
    { name: "Contacts" },
    { name: "Settings" },
    { name: "Billing" },
    { name: "Admin" },
    { name: "Realtime" },
    { name: "Audit" },
    { name: "Waitlist" },
    { name: "Webhooks" },
    { name: "System" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "session" },
    },
  },
  paths: {
    "/api/auth/google": {
      get: op({
        summary: "Redirect to Google OAuth login",
        description: "Legacy entrypoint that redirects users back to `/login` with an OAuth deprecation error.",
        tags: ["Auth"],
        operationId: "authGoogle",
        responses: { "302": { description: "Redirect" } },
        "x-auth": "public",
      }),
    },
    "/api/auth/google/callback": {
      get: op({
        summary: "Disabled OAuth callback",
        description: "Legacy callback endpoint that redirects to `/login` with an error message.",
        tags: ["Auth"],
        operationId: "authGoogleCallback",
        responses: { "302": { description: "Redirect" } },
        "x-auth": "public",
      }),
    },
    "/api/auth/logout": {
      get: op({
        summary: "Log out",
        tags: ["Auth"],
        operationId: "authLogoutGet",
        responses: { "302": { description: "Redirect to logout" } },
        "x-auth": "public",
      }),
      post: op({
        summary: "Log out",
        tags: ["Auth"],
        operationId: "authLogoutPost",
        responses: { "302": { description: "Redirect to logout" } },
        "x-auth": "public",
      }),
    },
    "/api/webhooks/corsair": {
      post: op({
        summary: "Corsair webhook receiver",
        description: "Accepts signed Corsair webhook payloads and applies mailbox/calendar sync events.",
        tags: ["Webhooks"],
        operationId: "corsairWebhook",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          "200": { description: "Webhook accepted" },
          ...commonErrors,
        },
        "x-auth": "public",
        "x-write": true,
      }),
    },
    "/api/corsair/connect": {
      get: op({
        summary: "Start Corsair connection flow",
        description: "Authenticated redirect into Corsair for Gmail or Google Calendar connection.",
        tags: ["Auth"],
        operationId: "corsairConnect",
        parameters: [
          { name: "provider", in: "query", required: true, schema: { type: "string", enum: ["gmail", "googlecalendar"] } },
        ],
        responses: { "302": { description: "Redirect to provider auth" }, "401": { description: "Unauthorized" } },
        security: [{ bearerAuth: [] }],
        "x-auth": "authenticated",
        "x-write": true,
      }),
    },
    "/api/corsair/callback": {
      get: op({
        summary: "Complete Corsair OAuth callback",
        description: "Handles OAuth callback state and provisions the user connection.",
        tags: ["Auth"],
        operationId: "corsairCallback",
        parameters: [
          { name: "code", in: "query", required: false, schema: zodString },
          { name: "state", in: "query", required: false, schema: zodString },
        ],
        responses: { "302": { description: "Redirect after callback" } },
        "x-auth": "public",
        "x-write": true,
      }),
    },
    "/api/trpc/waitlist.join": {
      post: op({
        summary: "Join waitlist",
        tags: ["Waitlist"],
        operationId: "waitlistJoin",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { email: zodEmail },
                required: ["email"],
              },
              example: { email: "user@example.com" },
            },
          },
        },
        responses: {
          "200": {
            description: "Joined successfully",
            content: {
              "application/json": {
                schema: { type: "object", properties: { success: zodBoolean }, required: ["success"] },
                example: { success: true },
              },
            },
          },
          ...commonErrors,
        },
        "x-auth": "public",
        "x-write": true,
      }),
    },
    "/api/trpc/email.getMailboxThreads": {
      get: op({
        summary: "List mailbox threads",
        tags: ["Inbox"],
        operationId: "emailGetMailboxThreads",
        parameters: [
          { name: "folder", in: "query", required: true, schema: { type: "string", enum: ["inbox", "drafts", "sent", "spam", "trash"] } },
          { name: "limit", in: "query", schema: zodInteger, example: 10 },
          { name: "offset", in: "query", schema: zodInteger, example: 0 },
          { name: "pageToken", in: "query", schema: zodString },
          { name: "query", in: "query", schema: zodString },
        ],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Mailbox threads" }, ...commonErrors },
        "x-auth": "authenticated",
      }),
    },
    "/api/trpc/email.getThreads": {
      get: op({ summary: "List thread groups", tags: ["Inbox"], operationId: "emailGetThreads", security: [{ bearerAuth: [] }], responses: { "200": { description: "Threads" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/email.getUnreadCounts": {
      get: op({ summary: "Get unread counts", tags: ["Inbox"], operationId: "emailGetUnreadCounts", security: [{ bearerAuth: [] }], responses: { "200": { description: "Unread counts" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/email.getThread": {
      get: op({
        summary: "Get thread detail",
        tags: ["Inbox"],
        operationId: "emailGetThread",
        parameters: [{ name: "threadId", in: "query", required: true, schema: zodString }],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Thread detail" }, ...commonErrors },
        "x-auth": "authenticated",
      }),
    },
    "/api/trpc/email.sendEmail": {
      post: op({
        summary: "Send an email",
        tags: ["Inbox"],
        operationId: "emailSendEmail",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  to: { type: "array", items: zodEmail },
                  cc: { type: "array", items: zodEmail },
                  bcc: { type: "array", items: zodEmail },
                  subject: zodString,
                  body: zodString,
                  threadId: zodString,
                },
                required: ["to"],
              },
            },
          },
        },
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Queued for send" }, ...commonErrors },
        "x-auth": "authenticated",
        "x-write": true,
      }),
    },
    "/api/trpc/email.sendConfirmed": {
      post: op({ summary: "Confirm queued send", tags: ["Inbox"], operationId: "emailSendConfirmed", security: [{ bearerAuth: [] }], responses: { "200": { description: "Send completed" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.cancelSend": {
      post: op({ summary: "Cancel queued send", tags: ["Inbox"], operationId: "emailCancelSend", security: [{ bearerAuth: [] }], responses: { "200": { description: "Cancellation result" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.saveDraft": {
      post: op({ summary: "Save a draft", tags: ["Inbox"], operationId: "emailSaveDraft", security: [{ bearerAuth: [] }], responses: { "200": { description: "Saved draft" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.deleteDraft": {
      post: op({ summary: "Delete a draft", tags: ["Inbox"], operationId: "emailDeleteDraft", security: [{ bearerAuth: [] }], responses: { "200": { description: "Deleted draft" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.rewriteDraft": {
      post: op({ summary: "Rewrite a draft with AI", tags: ["Inbox"], operationId: "emailRewriteDraft", security: [{ bearerAuth: [] }], responses: { "200": { description: "Rewritten draft" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true, "x-hitl": false }),
    },
    "/api/trpc/email.archiveEmail": {
      post: op({ summary: "Archive an email", tags: ["Inbox"], operationId: "emailArchiveEmail", security: [{ bearerAuth: [] }], responses: { "200": { description: "Archived" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.restoreFromArchive": {
      post: op({ summary: "Restore from archive", tags: ["Inbox"], operationId: "emailRestoreFromArchive", security: [{ bearerAuth: [] }], responses: { "200": { description: "Restored" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.deleteEmail": {
      post: op({ summary: "Move email to trash", tags: ["Inbox"], operationId: "emailDeleteEmail", security: [{ bearerAuth: [] }], responses: { "200": { description: "Deleted" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.restoreEmail": {
      post: op({ summary: "Restore a trashed email", tags: ["Inbox"], operationId: "emailRestoreEmail", security: [{ bearerAuth: [] }], responses: { "200": { description: "Restored" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.bulkMarkRead": {
      post: op({ summary: "Mark multiple emails read", tags: ["Inbox"], operationId: "emailBulkMarkRead", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.bulkArchive": {
      post: op({ summary: "Archive multiple emails", tags: ["Inbox"], operationId: "emailBulkArchive", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.bulkDelete": {
      post: op({ summary: "Delete multiple emails", tags: ["Inbox"], operationId: "emailBulkDelete", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/email.getMorningDigest": {
      get: op({ summary: "Get morning digest", tags: ["Inbox"], operationId: "emailGetMorningDigest", security: [{ bearerAuth: [] }], responses: { "200": { description: "Digest" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/email.getAutoReplies": {
      get: op({ summary: "Get suggested auto replies", tags: ["Inbox"], operationId: "emailGetAutoReplies", security: [{ bearerAuth: [] }], responses: { "200": { description: "Replies" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/calendar.getEvents": {
      get: op({ summary: "Get calendar events", tags: ["Calendar"], operationId: "calendarGetEvents", security: [{ bearerAuth: [] }], responses: { "200": { description: "Events" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/calendar.getTimeline": {
      get: op({ summary: "Get calendar timeline", tags: ["Calendar"], operationId: "calendarGetTimeline", security: [{ bearerAuth: [] }], responses: { "200": { description: "Timeline" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/calendar.createEvent": {
      post: op({ summary: "Create a calendar event", tags: ["Calendar"], operationId: "calendarCreateEvent", security: [{ bearerAuth: [] }], responses: { "200": { description: "Created" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/calendar.updateEvent": {
      post: op({ summary: "Update a calendar event", tags: ["Calendar"], operationId: "calendarUpdateEvent", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/calendar.deleteEvent": {
      post: op({ summary: "Delete a calendar event", tags: ["Calendar"], operationId: "calendarDeleteEvent", security: [{ bearerAuth: [] }], responses: { "200": { description: "Deleted" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/calendar.smartFillFromThread": {
      post: op({ summary: "Generate calendar fields from a thread", tags: ["Calendar"], operationId: "calendarSmartFillFromThread", security: [{ bearerAuth: [] }], responses: { "200": { description: "Suggested event data" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/calendar.generatePrepBrief": {
      post: op({ summary: "Generate meeting prep brief", tags: ["Calendar"], operationId: "calendarGeneratePrepBrief", security: [{ bearerAuth: [] }], responses: { "200": { description: "Prep brief" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/agent.getPendingHITL": {
      get: op({ summary: "Get pending HITL action", tags: ["Agent"], operationId: "agentGetPendingHITL", security: [{ bearerAuth: [] }], responses: { "200": { description: "Pending action" }, ...commonErrors }, "x-auth": "authenticated", "x-hitl": true }),
    },
    "/api/trpc/agent.resolveHITL": {
      post: op({ summary: "Resolve HITL action", tags: ["Agent"], operationId: "agentResolveHITL", security: [{ bearerAuth: [] }], responses: { "200": { description: "Resolution result" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true, "x-hitl": true }),
    },
    "/api/trpc/agent.clearSessionHistory": {
      post: op({ summary: "Clear agent session history", tags: ["Agent"], operationId: "agentClearSessionHistory", security: [{ bearerAuth: [] }], responses: { "200": { description: "Cleared" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/agent.replaceSessionHistory": {
      post: op({ summary: "Replace agent session history", tags: ["Agent"], operationId: "agentReplaceSessionHistory", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/agent.chatMessage": {
      post: op({ summary: "Stream an agent chat message", tags: ["Agent"], operationId: "agentChatMessage", security: [{ bearerAuth: [] }], responses: { "200": { description: "Streaming response" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true, "x-hitl": true }),
    },
    "/api/trpc/search.vectorSearch": {
      get: op({ summary: "Vector search emails", tags: ["Search"], operationId: "searchVectorSearch", security: [{ bearerAuth: [] }], responses: { "200": { description: "Search results" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/search.textSearch": {
      get: op({ summary: "Text search emails", tags: ["Search"], operationId: "searchTextSearch", security: [{ bearerAuth: [] }], responses: { "200": { description: "Search results" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/search.searchContacts": {
      get: op({ summary: "Search contacts", tags: ["Search"], operationId: "searchSearchContacts", security: [{ bearerAuth: [] }], responses: { "200": { description: "Contacts" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/contacts.getContactIntel": {
      get: op({ summary: "Get contact intelligence", tags: ["Contacts"], operationId: "contactsGetContactIntel", security: [{ bearerAuth: [] }], responses: { "200": { description: "Contact intelligence" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/settings.getUserSettings": {
      get: op({ summary: "Get user settings", tags: ["Settings"], operationId: "settingsGetUserSettings", security: [{ bearerAuth: [] }], responses: { "200": { description: "Settings" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/settings.updateSetting": {
      post: op({ summary: "Update a user setting", tags: ["Settings"], operationId: "settingsUpdateSetting", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/settings.updatePrivacyRules": {
      post: op({ summary: "Update privacy rules", tags: ["Settings"], operationId: "settingsUpdatePrivacyRules", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/billing.getOverview": {
      get: op({ summary: "Get billing overview", tags: ["Billing"], operationId: "billingGetOverview", security: [{ bearerAuth: [] }], responses: { "200": { description: "Billing overview" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/billing.simulatePlanChange": {
      post: op({ summary: "Simulate plan change", tags: ["Billing"], operationId: "billingSimulatePlanChange", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "authenticated", "x-write": true }),
    },
    "/api/trpc/admin.unlockDashboard": {
      post: op({ summary: "Unlock admin dashboard", tags: ["Admin"], operationId: "adminUnlockDashboard", security: [{ bearerAuth: [] }], responses: { "200": { description: "Unlocked" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/admin.getDashboard": {
      get: op({ summary: "Get admin dashboard", tags: ["Admin"], operationId: "adminGetDashboard", security: [{ bearerAuth: [] }], responses: { "200": { description: "Admin dashboard" }, ...commonErrors }, "x-auth": "admin" }),
    },
    "/api/trpc/admin.changeUserPlan": {
      post: op({ summary: "Change a user plan", tags: ["Admin"], operationId: "adminChangeUserPlan", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/admin.flagUser": {
      post: op({ summary: "Flag or unflag a user", tags: ["Admin"], operationId: "adminFlagUser", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/admin.setUserAiAccess": {
      post: op({ summary: "Enable or disable user AI access", tags: ["Admin"], operationId: "adminSetUserAiAccess", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/admin.resetUsageCounter": {
      post: op({ summary: "Reset a usage counter", tags: ["Admin"], operationId: "adminResetUsageCounter", security: [{ bearerAuth: [] }], responses: { "200": { description: "Reset" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/admin.promoteUserToAdminByEmail": {
      post: op({ summary: "Promote a user by email", tags: ["Admin"], operationId: "adminPromoteUserToAdminByEmail", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/admin.demoteUserToUserByEmail": {
      post: op({ summary: "Demote a user by email", tags: ["Admin"], operationId: "adminDemoteUserToUserByEmail", security: [{ bearerAuth: [] }], responses: { "200": { description: "Updated" }, ...commonErrors }, "x-auth": "admin", "x-write": true }),
    },
    "/api/trpc/audit.getAuditLog": {
      get: op({ summary: "Get audit log", tags: ["Audit"], operationId: "auditGetAuditLog", security: [{ bearerAuth: [] }], responses: { "200": { description: "Audit log" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
    "/api/trpc/realtime.getAblyToken": {
      get: op({ summary: "Get Ably token request", tags: ["Realtime"], operationId: "realtimeGetAblyToken", security: [{ bearerAuth: [] }], responses: { "200": { description: "Token request" }, ...commonErrors }, "x-auth": "authenticated" }),
    },
  },
};
