"use strict";
// Generic quota + usage-counter service on top of the Phase 1 core/subscriptions
// schema. Works for any organization entity_type (pharmacy, warehouse, doctor
// today; hospital/lab/insurance/driver/clinic tomorrow) without modification —
// callers only ever pass entityType/entityId/quotaKey.

function periodBounds(resetPeriod, resetPeriodDays, now = new Date()) {
  switch (resetPeriod) {
    case 'daily': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
    }
    case 'weekly': {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      return { start: d, end: new Date(d.getTime() + 7 * 24 * 3600 * 1000) };
    }
    case 'monthly': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { start, end };
    }
    case 'yearly': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
      return { start, end };
    }
    case 'custom': {
      const days = resetPeriodDays || 30;
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return { start, end: new Date(start.getTime() + days * 24 * 3600 * 1000) };
    }
    default: // 'none' — non-metered quotas never need a counter
      return { start: new Date(0), end: new Date('9999-12-31T00:00:00Z') };
  }
}

// Shared by every paginated admin list — clamps to sane bounds so a stray or
// malicious page/limit query param can't force an unbounded scan or a
// negative OFFSET (Postgres just errors on the latter today, but this makes
// it impossible rather than "not observed yet").
function clampPagination(page, limit, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const p = Math.max(1, Number.parseInt(page, 10) || 1);
  const l = Math.min(maxLimit, Math.max(1, Number.parseInt(limit, 10) || defaultLimit));
  return { page: p, limit: l, offset: (p - 1) * l };
}

module.exports = function createQuotaService(pool) {
  // Ensures an organization row (and an active subscription, defaulting to the
  // plan flagged is_default) exists for the given entity. Idempotent — safe to
  // call on every request. Reuses the exact backfill pattern from Phase 1 so
  // organizations created after Phase 1 bootstrap ran are never left unsubscribed.
  async function getOrCreateOrganization(entityType, entityId, ownerUserId = null, displayName = null) {
    const existing = await pool.query(
      `SELECT * FROM core.organizations WHERE entity_type=$1 AND entity_id=$2`,
      [entityType, entityId]
    );
    let org = existing.rows[0];
    if (!org) {
      const inserted = await pool.query(
        `INSERT INTO core.organizations (entity_type, entity_id, owner_user_id, display_name, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [entityType, entityId, ownerUserId, displayName]
      );
      org = inserted.rows[0];
    }
    await pool.query(
      `INSERT INTO subscriptions.subscriptions (organization_id, plan_id, status, started_at)
       SELECT $1, (SELECT id FROM subscriptions.plans WHERE is_default AND deleted_at IS NULL LIMIT 1), 'active', NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM subscriptions.subscriptions WHERE organization_id=$1 AND status IN ('trialing','active','past_due')
       )
       AND EXISTS (SELECT 1 FROM subscriptions.plans WHERE is_default AND deleted_at IS NULL)`,
      [org.id]
    );
    return org;
  }

  async function getActivePlan(organizationId) {
    const r = await pool.query(
      `SELECT p.* FROM subscriptions.subscriptions s
       JOIN subscriptions.plans p ON p.id = s.plan_id
       WHERE s.organization_id=$1 AND s.status IN ('trialing','active','past_due')
       LIMIT 1`,
      [organizationId]
    );
    return r.rows[0] || null;
  }

  async function getQuotaDefinition(quotaKey) {
    const r = await pool.query(`SELECT * FROM subscriptions.quota_definitions WHERE key=$1`, [quotaKey]);
    return r.rows[0] || null;
  }

  // null  = plan grants unlimited use
  // undefined = no active plan, or plan doesn't define this quota (fail-open: not enforced)
  async function getEffectiveLimit(organizationId, quotaKey) {
    const override = await pool.query(
      `SELECT override_value FROM subscriptions.organization_quota_overrides
       WHERE organization_id=$1 AND quota_key=$2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [organizationId, quotaKey]
    );
    if (override.rows.length) return override.rows[0].override_value;
    const plan = await getActivePlan(organizationId);
    if (!plan) return undefined;
    const pq = await pool.query(
      `SELECT limit_value FROM subscriptions.plan_quotas WHERE plan_id=$1 AND quota_key=$2`,
      [plan.id, quotaKey]
    );
    if (!pq.rows.length) return undefined;
    return pq.rows[0].limit_value;
  }

  async function getUsage(organizationId, quotaKey, resetPeriod, resetPeriodDays) {
    const { start, end } = periodBounds(resetPeriod, resetPeriodDays);
    const r = await pool.query(
      `SELECT used_value FROM subscriptions.usage_counters WHERE organization_id=$1 AND quota_key=$2 AND period_start=$3`,
      [organizationId, quotaKey, start]
    );
    return { used: r.rows.length ? Number(r.rows[0].used_value) : 0, periodStart: start, periodEnd: end };
  }

  // Atomic — concurrent requests race safely via ON CONFLICT ... DO UPDATE.
  async function incrementUsage(organizationId, quotaKey, amount, resetPeriod, resetPeriodDays) {
    const { start, end } = periodBounds(resetPeriod, resetPeriodDays);
    const r = await pool.query(
      `INSERT INTO subscriptions.usage_counters (organization_id, quota_key, period_start, period_end, used_value)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (organization_id, quota_key, period_start)
       DO UPDATE SET used_value = subscriptions.usage_counters.used_value + $5, updated_at = NOW()
       RETURNING used_value`,
      [organizationId, quotaKey, start, end, amount]
    );
    return Number(r.rows[0].used_value);
  }

  async function checkQuota(organizationId, quotaKey, amount = 1) {
    const def = await getQuotaDefinition(quotaKey);
    if (!def) return { allowed: true, unlimited: true, def: null };
    const limit = await getEffectiveLimit(organizationId, quotaKey);
    if (limit === undefined) return { allowed: true, unlimited: true, def };
    if (limit === null) return { allowed: true, unlimited: true, limit: null, def };
    if (!def.is_metered) return { allowed: true, unlimited: false, limit: Number(limit), def };
    const { used } = await getUsage(organizationId, quotaKey, def.reset_period, def.reset_period_days);
    const allowed = used + amount <= Number(limit);
    return { allowed, unlimited: false, limit: Number(limit), used, remaining: Math.max(0, Number(limit) - used), def };
  }

  // Express middleware factory — attach to any route without modification.
  // getEntity(req) -> { entityType, entityId, ownerUserId?, displayName? } | null
  // Usage is only recorded once the wrapped handler responds successfully
  // (status < 400), so a rejected/failed action never consumes quota.
  function enforceQuota({ getEntity, quotaKey, amount = 1 }) {
    return async function quotaMiddleware(req, res, next) {
      try {
        const entity = await getEntity(req);
        if (!entity || !entity.entityId) return next(); // nothing to attribute usage to — don't block
        const org = await getOrCreateOrganization(entity.entityType, entity.entityId, entity.ownerUserId, entity.displayName);
        const result = await checkQuota(org.id, quotaKey, amount);
        if (!result.allowed) {
          return res.status(429).json({
            success: false,
            error: {
              title: 'Quota exceeded', status: 429, code: 'QUOTA_EXCEEDED',
              quotaKey, limit: result.limit, used: result.used,
            },
          });
        }
        if (result.def && result.def.is_metered) {
          res.on('finish', () => {
            if (res.statusCode < 400) {
              incrementUsage(org.id, quotaKey, amount, result.def.reset_period, result.def.reset_period_days).catch(() => {});
            }
          });
        }
        next();
      } catch (err) { next(err); }
    };
  }

  // Full read model for an organization: plan + every quota it grants, each with
  // its effective limit (override-aware) and current-period usage.
  async function getOrganization(entityType, entityId) {
    const r = await pool.query(
      `SELECT * FROM core.organizations WHERE entity_type=$1 AND entity_id=$2`,
      [entityType, entityId]
    );
    return r.rows[0] || null;
  }

  // The one place a per-entity-type lookup is unavoidable: core.organizations
  // is generic, but each entity still lives in its own source table, so
  // verifying *true* ownership (not just trusting a caller-supplied id) means
  // asking that table. Mirrors the Phase 1 backfill queries — same mapping,
  // just parameterized per row instead of bulk. Adding a future entity type
  // (hospital, lab, ...) means adding one line here, nothing else changes.
  const ENTITY_OWNER_QUERIES = {
    pharmacy: `SELECT owner_id AS owner_user_id, name AS display_name, name_ar AS display_name_ar, status FROM pharmacies.pharmacies WHERE id=$1`,
    warehouse: `SELECT owner_id AS owner_user_id, name AS display_name, name_ar AS display_name_ar, status FROM warehouses.warehouses WHERE id=$1`,
    doctor: `SELECT id AS owner_user_id, COALESCE(email, phone) AS display_name, NULL AS display_name_ar, status FROM auth.users WHERE id=$1 AND role='doctor'`,
  };

  async function resolveEntityOwner(entityType, entityId) {
    const query = ENTITY_OWNER_QUERIES[entityType];
    if (!query) return null;
    const r = await pool.query(query, [entityId]);
    return r.rows[0] || null;
  }

  // Express middleware — resolves :entityType/:entityId to an organization the
  // caller is allowed to see (owner or staff role), 404/403 otherwise. Shared by
  // every org-scoped route so the same access rule never has to be re-written.
  // Self-heals: if the organization row doesn't exist yet (created after Phase 1
  // bootstrap ran, and no quota-enforced action has touched it yet), it verifies
  // true ownership against the entity's own source table before creating one —
  // never trusts the caller-supplied id alone.
  function requireOrgAccess() {
    return async function (req, res, next) {
      try {
        const { entityType, entityId } = req.params;
        let org = await getOrganization(entityType, entityId);
        const isStaff = ['admin', 'super_admin', 'auditor', 'support'].includes(req.user.role);
        if (!org) {
          const resolved = await resolveEntityOwner(entityType, entityId);
          if (!resolved) return res.status(404).json({ success: false, error: { title: 'Organization not found', status: 404 } });
          if (resolved.owner_user_id !== req.user.sub && !isStaff) {
            return res.status(403).json({ success: false, error: { title: 'Not authorized for this organization', status: 403 } });
          }
          org = await getOrCreateOrganization(entityType, entityId, resolved.owner_user_id, resolved.display_name);
        } else {
          const isOwner = org.owner_user_id === req.user.sub;
          if (!isOwner && !isStaff) {
            return res.status(403).json({ success: false, error: { title: 'Not authorized for this organization', status: 403 } });
          }
        }
        req.organization = org;
        next();
      } catch (err) { next(err); }
    };
  }

  async function buildSnapshot(org) {
    const plan = await getActivePlan(org.id);
    let quotas = [];
    if (plan) {
      const rows = await pool.query(
        `SELECT qd.key, qd.label, qd.label_ar, qd.value_type, qd.is_metered, qd.reset_period, qd.reset_period_days,
                pq.limit_value AS plan_limit_value,
                COALESCE(oqo.override_value, pq.limit_value) AS limit_value,
                (oqo.id IS NOT NULL) AS is_overridden
         FROM subscriptions.plan_quotas pq
         JOIN subscriptions.quota_definitions qd ON qd.key = pq.quota_key
         LEFT JOIN subscriptions.organization_quota_overrides oqo
           ON oqo.organization_id=$1 AND oqo.quota_key = pq.quota_key AND (oqo.expires_at IS NULL OR oqo.expires_at > NOW())
         WHERE pq.plan_id=$2
         ORDER BY qd.key`,
        [org.id, plan.id]
      );
      quotas = await Promise.all(rows.rows.map(async (q) => {
        const planLimit = q.plan_limit_value === null ? null : Number(q.plan_limit_value);
        if (!q.is_metered) return { ...q, plan_limit_value: planLimit, used: null, remaining: null };
        const { used } = await getUsage(org.id, q.key, q.reset_period, q.reset_period_days);
        const limit = q.limit_value === null ? null : Number(q.limit_value);
        return { ...q, plan_limit_value: planLimit, limit_value: limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
      }));
    }
    return { organization: org, plan, quotas };
  }

  async function getOrganizationSnapshot(entityType, entityId) {
    const org = await getOrganization(entityType, entityId);
    if (!org) return null;
    return buildSnapshot(org);
  }

  // Shared by listPublicPlans/listAllPlans — one query per catalog (LATERAL +
  // json_agg) instead of the previous 2-3 queries per plan in a loop. Same
  // output shape either way; includeSubscriberCount only adds one more field.
  async function _fetchPlanCatalog(extraWhere, includeSubscriberCount) {
    const r = await pool.query(`
      SELECT p.*,
             COALESCE(quotas.data, '[]'::json) AS quotas,
             COALESCE(prices.data, '[]'::json) AS prices
             ${includeSubscriberCount ? ', COALESCE(sub_count.count, 0) AS subscriber_count' : ''}
      FROM subscriptions.plans p
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'key', qd.key, 'label', qd.label, 'label_ar', qd.label_ar, 'value_type', qd.value_type,
          'applies_to_entity_type', qd.applies_to_entity_type, 'limit_value', pq.limit_value
        ) ORDER BY qd.key) AS data
        FROM subscriptions.plan_quotas pq JOIN subscriptions.quota_definitions qd ON qd.key = pq.quota_key
        WHERE pq.plan_id = p.id
      ) quotas ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('currency', currency, 'billing_cycle', billing_cycle, 'price', price)) AS data
        FROM subscriptions.plan_prices WHERE plan_id = p.id
      ) prices ON true
      ${includeSubscriberCount ? `
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS count FROM subscriptions.subscriptions
        WHERE plan_id = p.id AND status IN ('trialing','active','past_due')
      ) sub_count ON true` : ''}
      WHERE p.is_current_version AND p.deleted_at IS NULL ${extraWhere}
      ORDER BY p.display_order
    `);
    return r.rows;
  }

  // Public plan catalog — generic across entity types; the frontend filters by
  // applies_to_entity_type client-side if it needs to, nothing here hardcodes it.
  async function listPublicPlans() {
    return _fetchPlanCatalog(`AND p.is_public AND p.status='active'`, false);
  }

  async function createUpgradeRequest(organizationId, { requestType, requestedPlanId, requestedQuotaKey, requestedValue, requestedDurationDays }) {
    const existing = await pool.query(
      `SELECT * FROM subscriptions.upgrade_requests WHERE organization_id=$1 AND request_type=$2 AND status='pending'`,
      [organizationId, requestType]
    );
    if (existing.rows.length) {
      const err = new Error('A pending request of this type already exists');
      err.code = 'DUPLICATE_PENDING_REQUEST';
      err.existing = existing.rows[0];
      throw err;
    }
    const r = await pool.query(
      `INSERT INTO subscriptions.upgrade_requests
         (organization_id, request_type, requested_plan_id, requested_quota_key, requested_value, requested_duration_days, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [organizationId, requestType, requestedPlanId || null, requestedQuotaKey || null, requestedValue ?? null, requestedDurationDays ?? null]
    );
    return r.rows[0];
  }

  async function listUpgradeRequests(organizationId) {
    const r = await pool.query(
      `SELECT ur.*, p.name AS requested_plan_name, p.name_ar AS requested_plan_name_ar, p.family_code AS requested_plan_family_code
       FROM subscriptions.upgrade_requests ur
       LEFT JOIN subscriptions.plans p ON p.id = ur.requested_plan_id
       WHERE ur.organization_id=$1 ORDER BY ur.created_at DESC`,
      [organizationId]
    );
    return r.rows;
  }

  // ═══════════════════════ ADMIN — Phase 4 ════════════════════════════════
  // Everything below still goes through the same generic tables and the same
  // buildSnapshot/changeOrgPlan/getUsage primitives above — nothing here is
  // per-entity-type. Dashboards, plan CRUD, org search, upgrade-request
  // decisions, manual subscription changes, quota overrides, and audit log
  // all work identically for pharmacy/warehouse/doctor and any future type.

  async function listOrganizations({ search, entityType, planFamilyCode, page, limit } = {}) {
    const { page: p, limit: l, offset } = clampPagination(page, limit);
    const params = [entityType || null, planFamilyCode || null, search || null, l, offset];
    const rows = await pool.query(
      `SELECT o.*, s.id AS subscription_id, s.status AS subscription_status, s.plan_id,
              p.family_code AS plan_family_code, p.name AS plan_name, p.name_ar AS plan_name_ar
       FROM core.organizations o
       LEFT JOIN subscriptions.subscriptions s ON s.organization_id=o.id AND s.status IN ('trialing','active','past_due')
       LEFT JOIN subscriptions.plans p ON p.id = s.plan_id
       WHERE ($1::text IS NULL OR o.entity_type=$1)
         AND ($2::text IS NULL OR p.family_code=$2)
         AND ($3::text IS NULL OR o.display_name ILIKE '%' || $3 || '%')
       ORDER BY o.created_at DESC
       LIMIT $4 OFFSET $5`,
      params
    );
    const count = await pool.query(
      `SELECT count(*) FROM core.organizations o
       LEFT JOIN subscriptions.subscriptions s ON s.organization_id=o.id AND s.status IN ('trialing','active','past_due')
       LEFT JOIN subscriptions.plans p ON p.id = s.plan_id
       WHERE ($1::text IS NULL OR o.entity_type=$1)
         AND ($2::text IS NULL OR p.family_code=$2)
         AND ($3::text IS NULL OR o.display_name ILIKE '%' || $3 || '%')`,
      [entityType || null, planFamilyCode || null, search || null]
    );
    return { data: rows.rows, total: Number(count.rows[0].count), page: p, limit: l };
  }

  async function getOrganizationById(id) {
    const r = await pool.query(`SELECT * FROM core.organizations WHERE id=$1`, [id]);
    if (!r.rows.length) return null;
    return buildSnapshot(r.rows[0]);
  }

  // Admin plan catalog — every current-version plan regardless of is_public/status,
  // so deactivated/private (e.g. "super") tiers are still visible for management.
  async function listAllPlans() {
    return _fetchPlanCatalog('', true);
  }

  async function getPlanById(id) {
    const plan = await pool.query(`SELECT * FROM subscriptions.plans WHERE id=$1`, [id]);
    if (!plan.rows.length) return null;
    const quotas = await pool.query(
      `SELECT qd.key, qd.label, qd.label_ar, qd.value_type, qd.applies_to_entity_type, pq.limit_value
       FROM subscriptions.plan_quotas pq JOIN subscriptions.quota_definitions qd ON qd.key = pq.quota_key
       WHERE pq.plan_id=$1 ORDER BY qd.key`,
      [id]
    );
    const prices = await pool.query(`SELECT currency, billing_cycle, price FROM subscriptions.plan_prices WHERE plan_id=$1`, [id]);
    return { ...plan.rows[0], quotas: quotas.rows, prices: prices.rows };
  }

  // Plans are immutable once published (see Phase 1 note): editing content
  // creates version+1 and flips is_current_version, so orgs already on the old
  // row are never silently affected (grandfathering). Quotas/prices carry over
  // unchanged — this endpoint edits descriptive info only, not quota values.
  async function createPlanVersion(planId, updates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(`SELECT * FROM subscriptions.plans WHERE id=$1 AND is_current_version FOR UPDATE`, [planId]);
      if (!cur.rows.length) throw Object.assign(new Error('Plan not found or not the current version'), { code: 'PLAN_NOT_CURRENT' });
      const old = cur.rows[0];
      // Clear is_default too, not just is_current_version — both have partial
      // unique indexes (one-per-family, one-overall) that would otherwise
      // collide with the new row inserted below.
      await client.query(`UPDATE subscriptions.plans SET is_current_version=false, is_default=false, updated_at=NOW() WHERE id=$1`, [planId]);
      const merged = {
        name: updates.name ?? old.name,
        name_ar: updates.name_ar ?? old.name_ar,
        description: updates.description ?? old.description,
        description_ar: updates.description_ar ?? old.description_ar,
        marketing_features: updates.marketing_features ?? old.marketing_features,
        display_order: updates.display_order ?? old.display_order,
        is_public: updates.is_public ?? old.is_public,
      };
      const inserted = await client.query(
        `INSERT INTO subscriptions.plans
           (family_code, version, is_current_version, name, name_ar, description, description_ar, marketing_features, display_order, is_default, is_public, status)
         VALUES ($1,$2,true,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [old.family_code, old.version + 1, merged.name, merged.name_ar, merged.description, merged.description_ar,
          JSON.stringify(merged.marketing_features), merged.display_order, old.is_default, merged.is_public, old.status]
      );
      const newPlan = inserted.rows[0];
      await client.query(`UPDATE subscriptions.plans SET superseded_by_plan_id=$1 WHERE id=$2`, [newPlan.id, planId]);
      await client.query(
        `INSERT INTO subscriptions.plan_quotas (plan_id, quota_key, limit_value, warning_pct, critical_pct)
         SELECT $1, quota_key, limit_value, warning_pct, critical_pct FROM subscriptions.plan_quotas WHERE plan_id=$2`,
        [newPlan.id, planId]
      );
      await client.query(
        `INSERT INTO subscriptions.plan_features (plan_id, feature_key, is_enabled)
         SELECT $1, feature_key, is_enabled FROM subscriptions.plan_features WHERE plan_id=$2`,
        [newPlan.id, planId]
      );
      await client.query(
        `INSERT INTO subscriptions.plan_prices (plan_id, currency, billing_cycle, price)
         SELECT $1, currency, billing_cycle, price FROM subscriptions.plan_prices WHERE plan_id=$2`,
        [newPlan.id, planId]
      );
      await client.query('COMMIT');
      return newPlan;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Activate/deactivate — a state toggle on the current version row, not a
  // content edit, so it never bumps the version.
  async function setPlanStatus(planId, status) {
    const r = await pool.query(
      `UPDATE subscriptions.plans SET status=$1, updated_at=NOW() WHERE id=$2 AND is_current_version RETURNING *`,
      [status, planId]
    );
    return r.rows[0] || null;
  }

  async function listUpgradeRequestsAdmin({ status, entityType, page, limit } = {}) {
    const { page: p, limit: l, offset } = clampPagination(page, limit);
    const rows = await pool.query(
      `SELECT ur.*, o.entity_type, o.entity_id, o.display_name AS organization_display_name,
              p.name AS requested_plan_name, p.name_ar AS requested_plan_name_ar, p.family_code AS requested_plan_family_code
       FROM subscriptions.upgrade_requests ur
       JOIN core.organizations o ON o.id = ur.organization_id
       LEFT JOIN subscriptions.plans p ON p.id = ur.requested_plan_id
       WHERE ($1::text IS NULL OR ur.status=$1)
         AND ($2::text IS NULL OR o.entity_type=$2)
       ORDER BY ur.created_at DESC
       LIMIT $3 OFFSET $4`,
      [status || null, entityType || null, l, offset]
    );
    const count = await pool.query(
      `SELECT count(*) FROM subscriptions.upgrade_requests ur
       JOIN core.organizations o ON o.id = ur.organization_id
       WHERE ($1::text IS NULL OR ur.status=$1) AND ($2::text IS NULL OR o.entity_type=$2)`,
      [status || null, entityType || null]
    );
    return { data: rows.rows, total: Number(count.rows[0].count), page: p, limit: l };
  }

  async function getUpgradeRequestById(id) {
    const r = await pool.query(
      `SELECT ur.*, o.entity_type, o.entity_id, o.display_name AS organization_display_name,
              p.name AS requested_plan_name, p.name_ar AS requested_plan_name_ar, p.family_code AS requested_plan_family_code
       FROM subscriptions.upgrade_requests ur
       JOIN core.organizations o ON o.id = ur.organization_id
       LEFT JOIN subscriptions.plans p ON p.id = ur.requested_plan_id
       WHERE ur.id=$1`,
      [id]
    );
    return r.rows[0] || null;
  }

  // The one reused ledger for every subscription-state change (plan change,
  // cancel, restore) — subscription_history was designed generic enough
  // (changed_by/change_reason/effective_date) that inventing a second table
  // for admin actions would just be duplicated logic.
  async function changeOrgPlan(organizationId, planId, { changedBy, reason } = {}) {
    const existing = await pool.query(
      `SELECT * FROM subscriptions.subscriptions WHERE organization_id=$1 AND status IN ('trialing','active','past_due') LIMIT 1`,
      [organizationId]
    );
    const previousPlanId = existing.rows[0]?.plan_id || null;
    if (existing.rows.length) {
      await pool.query(`UPDATE subscriptions.subscriptions SET plan_id=$1, status='active', updated_at=NOW() WHERE id=$2`, [planId, existing.rows[0].id]);
    } else {
      await pool.query(
        `INSERT INTO subscriptions.subscriptions (organization_id, plan_id, status, started_at) VALUES ($1,$2,'active',NOW())`,
        [organizationId, planId]
      );
    }
    await pool.query(
      `INSERT INTO subscriptions.subscription_history (organization_id, previous_plan_id, new_plan_id, changed_by, change_reason, effective_date)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [organizationId, previousPlanId, planId, changedBy || null, reason || 'manual_plan_change']
    );
    return getOrganizationById(organizationId);
  }

  async function cancelOrgSubscription(organizationId, { changedBy, reason } = {}) {
    const sub = await pool.query(
      `UPDATE subscriptions.subscriptions SET status='canceled', canceled_at=NOW(), updated_at=NOW()
       WHERE organization_id=$1 AND status IN ('trialing','active','past_due') RETURNING *`,
      [organizationId]
    );
    if (!sub.rows.length) {
      const err = new Error('No active subscription to cancel');
      err.code = 'NO_ACTIVE_SUBSCRIPTION';
      throw err;
    }
    await pool.query(
      `INSERT INTO subscriptions.subscription_history (organization_id, previous_plan_id, new_plan_id, changed_by, change_reason, effective_date)
       VALUES ($1,$2,$2,$3,$4,NOW())`,
      [organizationId, sub.rows[0].plan_id, changedBy || null, reason || 'admin_cancel']
    );
    return getOrganizationById(organizationId);
  }

  async function restoreOrgSubscription(organizationId, { changedBy, reason } = {}) {
    const active = await pool.query(
      `SELECT id FROM subscriptions.subscriptions WHERE organization_id=$1 AND status IN ('trialing','active','past_due') LIMIT 1`,
      [organizationId]
    );
    if (active.rows.length) {
      const err = new Error('Subscription is already active — nothing to restore');
      err.code = 'ALREADY_ACTIVE';
      throw err;
    }
    const canceled = await pool.query(
      `SELECT * FROM subscriptions.subscriptions WHERE organization_id=$1 AND status='canceled' ORDER BY updated_at DESC LIMIT 1`,
      [organizationId]
    );
    let planId;
    if (canceled.rows.length) {
      await pool.query(`UPDATE subscriptions.subscriptions SET status='active', canceled_at=NULL, updated_at=NOW() WHERE id=$1`, [canceled.rows[0].id]);
      planId = canceled.rows[0].plan_id;
    } else {
      const defaultPlan = await pool.query(`SELECT id FROM subscriptions.plans WHERE is_default AND deleted_at IS NULL LIMIT 1`);
      if (!defaultPlan.rows.length) {
        const err = new Error('No canceled subscription and no default plan to restore to');
        err.code = 'NOTHING_TO_RESTORE';
        throw err;
      }
      planId = defaultPlan.rows[0].id;
      await pool.query(
        `INSERT INTO subscriptions.subscriptions (organization_id, plan_id, status, started_at) VALUES ($1,$2,'active',NOW())`,
        [organizationId, planId]
      );
    }
    await pool.query(
      `INSERT INTO subscriptions.subscription_history (organization_id, previous_plan_id, new_plan_id, changed_by, change_reason, effective_date)
       VALUES ($1,$2,$2,$3,$4,NOW())`,
      [organizationId, planId, changedBy || null, reason || 'admin_restore']
    );
    return getOrganizationById(organizationId);
  }

  // approve reuses changeOrgPlan — the exact same function manual "change plan"
  // uses — so the two paths can never drift apart.
  async function decideUpgradeRequest(id, { decision, adminUserId, adminNotes } = {}) {
    const reqRow = await pool.query(`SELECT * FROM subscriptions.upgrade_requests WHERE id=$1 AND status='pending'`, [id]);
    if (!reqRow.rows.length) {
      const err = new Error('Upgrade request not found or already decided');
      err.code = 'NOT_PENDING';
      throw err;
    }
    const request = reqRow.rows[0];
    if (decision === 'approved' && request.request_type === 'plan_change') {
      await changeOrgPlan(request.organization_id, request.requested_plan_id, {
        changedBy: adminUserId, reason: `upgrade_request_approved:${id}`,
      });
    }
    const updated = await pool.query(
      `UPDATE subscriptions.upgrade_requests SET status=$1, decided_by=$2, decided_at=NOW(), admin_notes=$3 WHERE id=$4 RETURNING *`,
      [decision, adminUserId || null, adminNotes || null, id]
    );
    return updated.rows[0];
  }

  async function listQuotaOverrides(organizationId) {
    const r = await pool.query(
      `SELECT oqo.*, qd.label, qd.label_ar FROM subscriptions.organization_quota_overrides oqo
       JOIN subscriptions.quota_definitions qd ON qd.key = oqo.quota_key
       WHERE oqo.organization_id=$1 ORDER BY qd.key`,
      [organizationId]
    );
    return r.rows;
  }

  async function upsertQuotaOverride(organizationId, quotaKey, { overrideValue, isTemporary, expiresAt, reason, createdBy } = {}) {
    // null/undefined = "unlimited" override, same convention as plan_quotas.limit_value.
    // Anything else must be a finite number — otherwise this fails as an
    // opaque Postgres type error (500) instead of a clear 422.
    if (overrideValue !== null && overrideValue !== undefined && !Number.isFinite(Number(overrideValue))) {
      const err = new Error('overrideValue must be a number or null (unlimited)');
      err.code = 'INVALID_OVERRIDE_VALUE';
      throw err;
    }
    const previous = await pool.query(
      `SELECT override_value FROM subscriptions.organization_quota_overrides WHERE organization_id=$1 AND quota_key=$2`,
      [organizationId, quotaKey]
    );
    const r = await pool.query(
      `INSERT INTO subscriptions.organization_quota_overrides (organization_id, quota_key, override_value, is_temporary, expires_at, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (organization_id, quota_key) DO UPDATE
         SET override_value=$3, is_temporary=$4, expires_at=$5, reason=$6, updated_at=NOW()
       RETURNING *`,
      [organizationId, quotaKey, overrideValue ?? null, !!isTemporary, expiresAt || null, reason || null, createdBy || null]
    );
    await pool.query(
      `INSERT INTO subscriptions.quota_change_history (organization_id, quota_key, change_type, previous_value, new_value, changed_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [organizationId, quotaKey, previous.rows.length ? 'override_updated' : 'override_created',
        previous.rows[0]?.override_value ?? null, overrideValue ?? null, createdBy || null, reason || null]
    );
    return r.rows[0];
  }

  async function removeQuotaOverride(organizationId, quotaKey, { removedBy, reason } = {}) {
    const previous = await pool.query(
      `SELECT override_value FROM subscriptions.organization_quota_overrides WHERE organization_id=$1 AND quota_key=$2`,
      [organizationId, quotaKey]
    );
    if (!previous.rows.length) return null;
    await pool.query(`DELETE FROM subscriptions.organization_quota_overrides WHERE organization_id=$1 AND quota_key=$2`, [organizationId, quotaKey]);
    await pool.query(
      `INSERT INTO subscriptions.quota_change_history (organization_id, quota_key, change_type, previous_value, new_value, changed_by, reason)
       VALUES ($1,$2,'override_removed',$3,NULL,$4,$5)`,
      [organizationId, quotaKey, previous.rows[0].override_value, removedBy || null, reason || null]
    );
    return { removed: true };
  }

  // Unified audit trail — reuses the three existing ledgers (subscription
  // history, quota-override history, decided upgrade requests) instead of a
  // new table. organizationId omitted = platform-wide view.
  async function getAuditLog({ organizationId, page, limit } = {}) {
    const { limit: l, offset } = clampPagination(page, limit, { defaultLimit: 50, maxLimit: 200 });
    const rows = await pool.query(
      `SELECT * FROM (
         SELECT sh.id, 'plan_change' AS type, sh.organization_id, sh.effective_date AS occurred_at,
                sh.changed_by AS actor_id, sh.change_reason AS summary,
                jsonb_build_object('previous_plan_id', sh.previous_plan_id, 'new_plan_id', sh.new_plan_id) AS detail
         FROM subscriptions.subscription_history sh
         WHERE ($1::uuid IS NULL OR sh.organization_id=$1)
         UNION ALL
         SELECT qch.id, 'quota_override' AS type, qch.organization_id, qch.created_at AS occurred_at,
                qch.changed_by AS actor_id, qch.change_type AS summary,
                jsonb_build_object('quota_key', qch.quota_key, 'previous_value', qch.previous_value, 'new_value', qch.new_value, 'reason', qch.reason) AS detail
         FROM subscriptions.quota_change_history qch
         WHERE ($1::uuid IS NULL OR qch.organization_id=$1)
         UNION ALL
         SELECT ur.id, 'upgrade_request' AS type, ur.organization_id, ur.decided_at AS occurred_at,
                ur.decided_by AS actor_id, ur.status AS summary,
                jsonb_build_object('request_type', ur.request_type, 'requested_plan_id', ur.requested_plan_id, 'admin_notes', ur.admin_notes) AS detail
         FROM subscriptions.upgrade_requests ur
         WHERE ur.decided_at IS NOT NULL AND ($1::uuid IS NULL OR ur.organization_id=$1)
       ) events
       LEFT JOIN LATERAL (SELECT email, phone FROM auth.users WHERE id = events.actor_id) actor ON true
       ORDER BY occurred_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId || null, l, offset]
    );
    return rows.rows;
  }

  async function getDashboardStats() {
    const [totalOrgs, activeSubs, pendingRequests, byPlan, byEntityType, recentRequests] = await Promise.all([
      pool.query(`SELECT count(*) FROM core.organizations`),
      pool.query(`SELECT count(*) FROM subscriptions.subscriptions WHERE status IN ('trialing','active','past_due')`),
      pool.query(`SELECT count(*) FROM subscriptions.upgrade_requests WHERE status='pending'`),
      pool.query(`
        SELECT p.family_code, p.name, p.name_ar, count(*)::int AS organization_count
        FROM subscriptions.subscriptions s
        JOIN subscriptions.plans p ON p.id = s.plan_id
        WHERE s.status IN ('trialing','active','past_due')
        GROUP BY p.family_code, p.name, p.name_ar, p.display_order
        ORDER BY p.display_order
      `),
      pool.query(`SELECT entity_type, count(*)::int AS organization_count FROM core.organizations GROUP BY entity_type ORDER BY entity_type`),
      listUpgradeRequestsAdmin({ page: 1, limit: 5 }),
    ]);
    return {
      total_organizations: Number(totalOrgs.rows[0].count),
      active_subscriptions: Number(activeSubs.rows[0].count),
      pending_upgrade_requests: Number(pendingRequests.rows[0].count),
      organizations_by_plan: byPlan.rows,
      organizations_by_entity_type: byEntityType.rows,
      recent_upgrade_requests: recentRequests.data,
    };
  }

  return {
    getOrCreateOrganization,
    getOrganization,
    requireOrgAccess,
    getActivePlan,
    getQuotaDefinition,
    getEffectiveLimit,
    getUsage,
    incrementUsage,
    checkQuota,
    listPublicPlans,
    createUpgradeRequest,
    listUpgradeRequests,
    enforceQuota,
    getOrganizationSnapshot,
    listOrganizations,
    getOrganizationById,
    listAllPlans,
    getPlanById,
    createPlanVersion,
    setPlanStatus,
    listUpgradeRequestsAdmin,
    getUpgradeRequestById,
    changeOrgPlan,
    cancelOrgSubscription,
    restoreOrgSubscription,
    decideUpgradeRequest,
    listQuotaOverrides,
    upsertQuotaOverride,
    removeQuotaOverride,
    getAuditLog,
    getDashboardStats,
  };
};
