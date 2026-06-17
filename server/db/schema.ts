import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  vector,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';



export const tagEnum = pgEnum('tag', [
  'work',
  'personal',
  'finance',
  'travel',
  'newsletter',
  'update',
  'social',
  'other'
]);

export const priorityEnum = pgEnum('priority', [
  'low',
  'medium',
  'high',
  'urgent'
]);

export const auditActionEnum = pgEnum('audit_action', [
  'email_sent',
  'email_received',
  'email_archived',
  'hitl_created',
  'hitl_resolved',
  'settings_changed',
  'token_refreshed',
  'admin_promoted',
  'admin_demoted'
]);

export const hitlStatusEnum = pgEnum('hitl_status', [
  'pending',
  'approved',
  'rejected',
  'expired'
]);

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  role: text('role').$type<'user' | 'admin' | 'superadmin'>().default('user').notNull(),
  plan: text('plan').$type<'free' | 'pro' | 'team'>().default('free').notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  isFlagged: boolean('is_flagged').default(false).notNull(),
  aiDisabled: boolean('ai_disabled').default(false).notNull(),
  // Aethra custom columns — added AFTER Auth.js required columns
  // Note: Corsair OAuth tokens are managed by @corsair-dev/app — never stored locally
  createdAt: timestamp('created_at').defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  gmailConnected: boolean('gmail_connected').default(false).notNull(),
  calendarConnected: boolean('calendar_connected').default(false).notNull(),
  privacyConfigured: boolean('privacy_configured').default(false).notNull(),
  aiEnabled: boolean('ai_enabled').default(true).notNull(),
  draftSuggestionsEnabled: boolean('draft_suggestions_enabled').default(true).notNull(),
  autoTagEnabled: boolean('auto_tag_enabled').default(true).notNull(),
  theme: text('theme').default('light').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

export const aiConsentRules = pgTable(
  'ai_consent_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    ruleType: text('rule_type').$type<'domain_group' | 'custom_domain'>().notNull(),
    pattern: text('pattern').notNull(),
    isBlocked: boolean('is_blocked').default(true).notNull(),
    groupName: text('group_name'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('user_domain_idx').on(table.userId, table.pattern),
    index('consent_user_idx').on(table.userId)
  ]
);

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    corsair_message_id: text('corsair_message_id').unique().notNull(),
    thread_id: text('thread_id'),
    from_address: text('from_address').notNull(),
    from_name: text('from_name'),
    to_address: text('to_address').notNull(),
    subject: text('subject'),
    snippet: text('snippet'),
    body_text: text('body_text'),
    body_html: text('body_html'), 
    is_read: boolean('is_read').default(false).notNull(),
    is_archived: boolean('is_archived').default(false).notNull(),
    is_deleted: boolean('is_deleted').default(false).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ai_triage_skipped: boolean('ai_triage_skipped').default(true).notNull(),
    priority: priorityEnum('priority').default('medium').notNull(),
    tag: tagEnum('tag').default('other').notNull(),
    tldr: text('tldr'),
    confidence: real('confidence'),
    embedding: vector('embedding', { dimensions: 768 }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('emails_user_idx').on(table.userId),
    index('emails_thread_idx').on(table.thread_id),
    index('emails_deleted_idx').on(table.is_deleted),
    index('emails_archived_idx').on(table.is_archived)
  ]
);


export const autoReplyDrafts = pgTable(
  'auto_reply_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    emailId: uuid('email_id')
      .references(() => emails.id, { onDelete: 'cascade' })
      .notNull(),
    reply_text: text('reply_text').notNull(),
    reply_html: text('reply_html'),
    status: text('status').default('draft').notNull(), 
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('auto_reply_user_idx').on(table.userId),
    index('auto_reply_email_idx').on(table.emailId)
  ]
);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    corsair_event_id: text('corsair_event_id').unique().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    start_time: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(),
    end_time: timestamp('end_time', { withTimezone: true, mode: 'date' }).notNull(),
    location: text('location'),
    is_all_day: boolean('is_all_day').default(false).notNull(),
    status: text('status').default('confirmed').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('calendar_user_idx').on(table.userId),
    index('calendar_start_idx').on(table.start_time)
  ]
);

export const hitlActions = pgTable(
  'hitl_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    emailId: uuid('email_id').references(() => emails.id, { onDelete: 'set null' }),
    action_type: text('action_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: hitlStatusEnum('status').default('pending').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    resolved_at: timestamp('resolved_at', { withTimezone: true, mode: 'date' })
  },
  (table) => [
    index('hitl_user_idx').on(table.userId),
    index('hitl_status_idx').on(table.status)
  ]
);

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').default('active').notNull(), 
    history: jsonb('history').default([]).notNull(), 
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [index('agent_session_user_idx').on(table.userId)]
);

export const contactIntelligence = pgTable(
  'contact_intelligence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    name: text('name'),
    summary: text('summary'),
    interaction_count: integer('interaction_count').default(0).notNull(),
    last_interaction_at: timestamp('last_interaction_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('user_contact_email_idx').on(table.userId, table.email),
    index('contact_user_idx').on(table.userId)
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    action: auditActionEnum('action').notNull(),
    details: jsonb('details').notNull(), 
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [index('audit_user_idx').on(table.userId)]
);

export const waitlistEmails = pgTable('waitlist_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});



export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId]
  }),
  consentRules: many(aiConsentRules),
  emails: many(emails),
  autoReplyDrafts: many(autoReplyDrafts),
  calendarEvents: many(calendarEvents),
  hitlActions: many(hitlActions),
  agentSessions: many(agentSessions),
  contactIntelligence: many(contactIntelligence),
  auditLogs: many(auditLogs)
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id]
  })
}));

export const aiConsentRulesRelations = relations(aiConsentRules, ({ one }) => ({
  user: one(users, {
    fields: [aiConsentRules.userId],
    references: [users.id]
  })
}));

export const emailsRelations = relations(emails, ({ one, many }) => ({
  user: one(users, {
    fields: [emails.userId],
    references: [users.id]
  }),
  autoReplyDrafts: many(autoReplyDrafts),
  hitlActions: many(hitlActions)
}));

export const autoReplyDraftsRelations = relations(autoReplyDrafts, ({ one }) => ({
  user: one(users, {
    fields: [autoReplyDrafts.userId],
    references: [users.id]
  }),
  email: one(emails, {
    fields: [autoReplyDrafts.emailId],
    references: [emails.id]
  })
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id]
  })
}));

export const hitlActionsRelations = relations(hitlActions, ({ one }) => ({
  user: one(users, {
    fields: [hitlActions.userId],
    references: [users.id]
  }),
  email: one(emails, {
    fields: [hitlActions.emailId],
    references: [emails.id]
  })
}));

export const agentSessionsRelations = relations(agentSessions, ({ one }) => ({
  user: one(users, {
    fields: [agentSessions.userId],
    references: [users.id]
  })
}));

export const contactIntelligenceRelations = relations(contactIntelligence, ({ one }) => ({
  user: one(users, {
    fields: [contactIntelligence.userId],
    references: [users.id]
  })
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id]
  })
}));






export const corsairIntegrations = pgTable('corsair_integrations', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    name: text('name').notNull(),
    config: jsonb('config').notNull().default({}),
    dek: text('dek'),
});

export const corsairAccounts = pgTable('corsair_accounts', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    tenantId: text('tenant_id').notNull(),
    integrationId: text('integration_id').notNull().references(() => corsairIntegrations.id),
    config: jsonb('config').notNull().default({}),
    dek: text('dek'),
});

export const corsairEntities = pgTable('corsair_entities', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    accountId: text('account_id').notNull().references(() => corsairAccounts.id),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type').notNull(),
    version: text('version').notNull(),
    data: jsonb('data').notNull().default({}),
});

export const corsairEvents = pgTable('corsair_events', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    accountId: text('account_id').notNull().references(() => corsairAccounts.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status'),
});
