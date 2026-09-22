exports.up = (pgm) => {
  pgm.createTable("credit_accounts", {
    id: { type: "uuid", primaryKey: true },
    owner_reference: { type: "varchar(128)", notNull: true, unique: true },
    balance_cents: { type: "bigint", notNull: true, default: 0 },
    version: { type: "integer", notNull: true, default: 0 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("credit_commands", {
    id: { type: "uuid", primaryKey: true },
    operation_key: { type: "varchar(128)", notNull: true, unique: true },
    account_id: {
      type: "uuid",
      notNull: true,
      references: "credit_accounts",
      onDelete: "RESTRICT",
    },
    amount_cents: { type: "integer", notNull: true },
    reason: { type: "varchar(240)", notNull: true },
    request_hash: { type: "char(64)", notNull: true },
    trace_id: { type: "varchar(128)", notNull: true },
    status: { type: "varchar(16)", notNull: true, default: "pending" },
    result: { type: "jsonb" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    completed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("credit_commands", "credit_commands_status_check", {
    check: "status IN ('pending', 'completed', 'failed')",
  });
  pgm.addConstraint("credit_commands", "credit_commands_nonzero_amount_check", {
    check: "amount_cents <> 0",
  });
  pgm.createIndex("credit_commands", ["status", "created_at"]);

  pgm.createTable("outbox_messages", {
    id: { type: "uuid", primaryKey: true },
    aggregate_id: {
      type: "uuid",
      notNull: true,
      references: "credit_commands",
      onDelete: "CASCADE",
    },
    event_type: { type: "varchar(80)", notNull: true },
    payload: { type: "jsonb", notNull: true },
    status: { type: "varchar(16)", notNull: true, default: "pending" },
    attempts: { type: "integer", notNull: true, default: 0 },
    available_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    locked_until: { type: "timestamptz" },
    last_error: { type: "text" },
    published_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("outbox_messages", "outbox_messages_status_check", {
    check: "status IN ('pending', 'publishing', 'published')",
  });
  pgm.createIndex("outbox_messages", ["available_at", "created_at"], {
    name: "outbox_messages_dispatch_idx",
    where: "published_at IS NULL",
  });

  pgm.createTable("credit_ledger", {
    id: { type: "bigserial", primaryKey: true },
    operation_key: { type: "varchar(128)", notNull: true, unique: true },
    command_id: {
      type: "uuid",
      notNull: true,
      unique: true,
      references: "credit_commands",
      onDelete: "RESTRICT",
    },
    account_id: {
      type: "uuid",
      notNull: true,
      references: "credit_accounts",
      onDelete: "RESTRICT",
    },
    amount_cents: { type: "integer", notNull: true },
    source_job_id: { type: "varchar(128)", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.createIndex("credit_ledger", ["account_id", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("credit_ledger");
  pgm.dropTable("outbox_messages");
  pgm.dropTable("credit_commands");
  pgm.dropTable("credit_accounts");
};
