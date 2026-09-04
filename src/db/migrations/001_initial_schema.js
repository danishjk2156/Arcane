/**
 * Full schema migration with all architecture fixes applied:
 *   - problem_types.hints_per_stage for growing hint override
 *   - served_problems.outcome includes 'judging' state
 *   - served_problems.judging_started_at for stale recovery
 *   - submissions.client_request_id for idempotency
 */
exports.up = async function (knex) {
  // ─── Problem Types ──────────────────────────────────────
  await knex.schema.createTable('problem_types', (t) => {
    t.increments('id').primary();
    t.text('name').unique().notNullable();
    t.integer('sequence_order').notNullable();
    // Override for growing hints; if NULL, computed as sequence_order
    t.integer('hints_per_stage').nullable();
  });

  // ─── Problems ───────────────────────────────────────────
  await knex.schema.createTable('problems', (t) => {
    t.increments('id').primary();
    t.integer('type_id').references('id').inTable('problem_types').notNullable();
    t.text('title').notNullable();
    t.text('description').notNullable();
    t.smallint('difficulty').notNullable().defaultTo(1);
    t.jsonb('starter_code').nullable();        // { c: "...", cpp: "...", java: "...", python: "..." }
    t.jsonb('test_cases').notNullable();        // [{ input, expected_output, hidden }]
    t.text('hint_text').notNullable();          // this problem's genuinely-correct hint
    t.integer('time_limit_ms').defaultTo(2000);
    t.integer('memory_limit_mb').defaultTo(128);
    t.boolean('is_active').defaultTo(true);
  });

  // ─── Decoy Hints ────────────────────────────────────────
  await knex.schema.createTable('decoy_hints', (t) => {
    t.increments('id').primary();
    t.integer('type_id').references('id').inTable('problem_types').notNullable();
    t.text('text').notNullable();
  });

  // ─── Participants ───────────────────────────────────────
  await knex.schema.createTable('participants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('display_name').notNullable();
    t.text('email').unique().nullable();
    t.text('password_hash').nullable();
    t.integer('current_problem_id').references('id').inTable('problems').nullable();
    t.text('status').defaultTo('active');       // active | finished | disqualified
    t.text('role').defaultTo('participant');     // participant | admin
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // ─── Hint Events ───────────────────────────────────────
  // One row per "hint reveal moment" — spans however many same-type loop attempts
  await knex.schema.createTable('hint_events', (t) => {
    t.increments('id').primary();
    t.uuid('participant_id').references('id').inTable('participants').notNullable();
    t.integer('type_id').references('id').inTable('problem_types').notNullable();
    t.boolean('resolved').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // ─── Hint Options ──────────────────────────────────────
  // Individual hint cards shown for a hint_event (1 correct + N-1 decoys)
  await knex.schema.createTable('hint_options', (t) => {
    t.increments('id').primary();
    t.integer('hint_event_id').references('id').inTable('hint_events').notNullable();
    t.text('text').notNullable();
    t.boolean('is_correct').notNullable();      // NEVER sent to client — enforced by DTO layer
    t.boolean('eliminated').defaultTo(false);
  });

  // ─── Served Problems ───────────────────────────────────
  // FIX: Added 'judging' state + judging_started_at for stale recovery
  await knex.schema.createTable('served_problems', (t) => {
    t.increments('id').primary();
    t.uuid('participant_id').references('id').inTable('participants').notNullable();
    t.integer('problem_id').references('id').inTable('problems').notNullable();
    t.integer('hint_event_id').references('id').inTable('hint_events').nullable(); // null for problem 1
    t.timestamp('served_at', { useTz: true }).defaultTo(knex.fn.now());
    t.integer('selected_hint_option_id').references('id').inTable('hint_options').nullable();
    // FIX: 'judging' state prevents double-submission race
    t.text('outcome').defaultTo('pending');      // pending | judging | correct | wrong
    // FIX: timestamp for stale judging recovery cron
    t.timestamp('judging_started_at', { useTz: true }).nullable();
  });

  // ─── Submissions ───────────────────────────────────────
  // FIX: client_request_id for idempotency
  await knex.schema.createTable('submissions', (t) => {
    t.increments('id').primary();
    t.integer('served_problem_id').references('id').inTable('served_problems').notNullable();
    // FIX: idempotency key — prevents duplicate processing on network retries
    t.uuid('client_request_id').unique().nullable();
    t.text('code').notNullable();
    t.text('language').notNullable();
    t.text('verdict').notNullable();             // accepted | wrong_answer | tle | runtime_error | compile_error
    t.integer('runtime_ms').nullable();
    t.timestamp('submitted_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // ─── Indexes ───────────────────────────────────────────
  await knex.schema.raw(
    'CREATE INDEX idx_served_participant ON served_problems(participant_id)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_served_outcome ON served_problems(outcome)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_submissions_served ON submissions(served_problem_id)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_submissions_idempotency ON submissions(client_request_id) WHERE client_request_id IS NOT NULL'
  );
  // Index for stale judging recovery cron
  await knex.schema.raw(
    'CREATE INDEX idx_served_stale_judging ON served_problems(judging_started_at) WHERE outcome = \'judging\''
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('submissions');
  await knex.schema.dropTableIfExists('served_problems');
  await knex.schema.dropTableIfExists('hint_options');
  await knex.schema.dropTableIfExists('hint_events');
  await knex.schema.dropTableIfExists('participants');
  await knex.schema.dropTableIfExists('decoy_hints');
  await knex.schema.dropTableIfExists('problems');
  await knex.schema.dropTableIfExists('problem_types');
};
